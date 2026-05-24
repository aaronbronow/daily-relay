const express = require('express');
const path = require('path');
const fs = require('fs');
const { checkDockerSync } = require('./utils/dockerCheck');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '../public');
const WATCH_FILE = path.join(PUBLIC_DIR, 'index.html');

// Serve static files
app.use(express.static(PUBLIC_DIR));

// SSE endpoint for auto-refresh
let clients = [];
app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const clientId = Date.now();
    const newClient = { id: clientId, res };
    clients.push(newClient);

    req.on('close', () => {
        clients = clients.filter(c => c.id !== clientId);
    });
});

// Watch for changes in index.html to notify clients
if (fs.existsSync(WATCH_FILE)) {
    fs.watch(WATCH_FILE, (eventType) => {
        if (eventType === 'change') {
            console.log('[Server] File change detected, notifying clients...');
            clients.forEach(client => client.res.write(`data: reload\n\n`));
        }
    });
} else {
    // If it doesn't exist, wait for it to be created
    const watcher = fs.watch(path.dirname(WATCH_FILE), (eventType, filename) => {
        if (filename === 'index.html') {
            console.log('[Server] index.html created, starting watch...');
            fs.watch(WATCH_FILE, (eventType) => {
                if (eventType === 'change') {
                    console.log('[Server] File change detected, notifying clients...');
                    clients.forEach(client => client.res.write(`data: reload\n\n`));
                }
            });
            watcher.close();
        }
    });
}

app.listen(PORT, '0.0.0.0', async () => {
    console.log(`[Server] daily-relay running at http://localhost:${PORT}`);
    try {
        const warnings = await checkDockerSync();
        for (const warning of warnings) {
            console.warn(`[Server Warning] ${warning}`);
        }
    } catch (err) {
        // Gracefully ignore
    }
});
