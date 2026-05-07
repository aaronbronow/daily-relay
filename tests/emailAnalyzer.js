const Imap = require('imap');
const { simpleParser } = require('mailparser');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const SOURCES_FILE = path.join(__dirname, '../sources.yaml');
const CACHE_FILE = path.join(__dirname, '../data/cache.json');

async function analyzeEmails() {
  const args = process.argv.slice(2);
  const useCache = args.includes('--cache');

  if (useCache) {
    console.log("Analyzing from cache...");
    try {
      const cacheRaw = fs.readFileSync(CACHE_FILE, 'utf8');
      const cache = JSON.parse(cacheRaw);
      const emailSources = cache.emailUpdates || [];
      
      const metrics = [];
      for (const source of emailSources) {
        for (const item of source.items || []) {
          const m = item.metrics || {};
          const len = m.length || 0;
          const h = m.headings || 0;
          const l = m.links || 0;
          const ls = m.lists || 0;

          // Recalculate cpx in case it wasn't in cache
          const cpx = m.cpx !== undefined ? m.cpx : 
                      (len > 5000 ? 3 : len > 2000 ? 1 : 0) + 
                      (h > 3 ? 2 : 0) + 
                      (l > 25 ? 2 : 0) + 
                      (ls > 0 ? 1 : 0);

          const lenStr = (len >= 1024 ? (len / 1024).toFixed(1) + 'k' : len).toString().padStart(5);
          const hStr = h.toString().padStart(2);
          const aStr = l.toString().padStart(3);
          const lStr = ls.toString().padStart(2);
          const meter = '[' + '●'.repeat(cpx) + '○'.repeat(8 - cpx) + ']';

          metrics.push({
            From: (item.from || 'Unknown').substring(0, 12),
            Subj: (item.title || '(No Subject)').substring(0, 35),
            'Len H A L [Cpx]': `${lenStr} ${hStr} ${aStr} ${lStr} ${meter}`
          });
        }
      }

      console.log("\n--- Email Metrics Analysis (From Cache) ---");
      console.table(metrics);
      return;
    } catch (err) {
      console.error("Error reading cache:", err.message);
      process.exit(1);
    }
  }

  // Load Gmail config from sources.yaml
  let sourcesConfig = { sources: [] };
  try {
    const yamlContent = fs.readFileSync(SOURCES_FILE, 'utf8');
    sourcesConfig = yaml.load(yamlContent);
  } catch (err) {
    console.error("sources.yaml not found or invalid.");
    process.exit(1);
  }

  const gmailConfig = sourcesConfig.sources.find(s => s.type === 'imap' && s.name === 'Gmail Updates');
  if (!gmailConfig) {
    console.error("Gmail Updates source not found in sources.yaml");
    process.exit(1);
  }

  const IMAP_USER = process.env[gmailConfig.user_env];
  const IMAP_PASS = process.env[gmailConfig.pass_env];

  if (!IMAP_USER || !IMAP_PASS) {
    console.error("IMAP credentials missing in environment.");
    process.exit(1);
  }

  const imap = new Imap({
    user: IMAP_USER,
    password: IMAP_PASS,
    host: gmailConfig.host || 'imap.gmail.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
    authTimeout: 10000,
    keepalive: false
  });

  console.log("Connecting to IMAP...");

  return new Promise((resolve) => {
    const metrics = [];
    const messagePromises = [];

    imap.once('ready', () => {
      imap.openBox(gmailConfig.folder || 'INBOX', true, (err) => {
        if (err) {
          console.error("openBox error:", err);
          imap.end();
          return resolve();
        }

        const searchCriteria = gmailConfig.gmail_raw 
          ? [['X-GM-RAW', gmailConfig.gmail_raw]]
          : [['SINCE', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)]];

        console.log("Searching with:", JSON.stringify(searchCriteria));

        imap.search(searchCriteria, (err, uids) => {
          if (err || !uids || uids.length === 0) {
            console.log("No messages found.");
            imap.end();
            return resolve();
          }

          // Fetch latest 20
          const targetUids = uids.sort((a, b) => b - a).slice(0, 20);
          console.log(`Fetching ${targetUids.length} messages...`);
          
          const f = imap.fetch(targetUids, { bodies: '' });

          f.on('message', (msg) => {
            const p = new Promise((resolveMsg) => {
              msg.on('body', (stream) => {
                simpleParser(stream).then(parsed => {
                  const html = parsed.html || '';
                  const text = parsed.text || '';
                  
                  const headingMatches = html.match(/<h[1-6]/gi) || [];
                  const linkMatches = html.match(/<a\b/gi) || [];
                  const listMatches = html.match(/<(ul|ol)\b/gi) || [];

                  const len = (text || html).length;
                  const h = headingMatches.length;
                  const l = linkMatches.length;
                  const ls = listMatches.length;

                  // Complexity index (0-8 scale) based on structural thresholds
                  const cpx = (len > 5000 ? 3 : len > 2000 ? 1 : 0) + 
                              (h > 3 ? 2 : 0) + 
                              (l > 25 ? 2 : 0) + 
                              (ls > 0 ? 1 : 0);

                  const lenStr = (len >= 1024 ? (len / 1024).toFixed(1) + 'k' : len).toString().padStart(5);
                  const hStr = h.toString().padStart(2);
                  const aStr = l.toString().padStart(3);
                  const lStr = ls.toString().padStart(2);
                  const meter = '[' + '●'.repeat(cpx) + '○'.repeat(8 - cpx) + ']';

                  metrics.push({
                    From: ((parsed.from && parsed.from.value[0].address) || 'Unknown').substring(0, 12),
                    Subj: (parsed.subject || '(No Subject)').substring(0, 35),
                    'Len H A L [Cpx]': `${lenStr} ${hStr} ${aStr} ${lStr} ${meter}`
                  });
                }).catch(err => console.error("Parse error:", err))
                  .finally(() => resolveMsg());
              });
            });
            messagePromises.push(p);
          });

          f.once('end', () => {
            Promise.all(messagePromises).then(() => {
              imap.end();
            });
          });
        });
      });
    });

    imap.once('end', () => {
      console.log("\n--- Email Metrics Analysis (Latest 20) ---");
      console.table(metrics);
      resolve();
    });

    imap.once('error', (err) => {
      console.error("IMAP error:", err);
      resolve();
    });

    imap.connect();
  });
}

analyzeEmails().then(() => process.exit(0));
