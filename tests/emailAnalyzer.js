const Imap = require('imap');
const { simpleParser } = require('mailparser');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const SOURCES_FILE = path.join(__dirname, '../sources.yaml');

async function analyzeEmails() {
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

                  metrics.push({
                    Sender: (parsed.from && parsed.from.value[0].address) || 'Unknown',
                    Subject: (parsed.subject || '(No Subject)').substring(0, 40),
                    Time: parsed.date ? parsed.date.toLocaleTimeString() : 'N/A',
                    'Has Text': text.trim().length > 0,
                    Length: (text || html).length,
                    Headings: headingMatches.length,
                    Links: linkMatches.length,
                    Lists: listMatches.length
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
