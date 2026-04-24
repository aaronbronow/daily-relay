const Imap = require('imap');
const { simpleParser } = require('mailparser');

/**
 * IMAP Email Collector.
 * Fetches recent emails and extracts subjects/snippets.
 * 
 * @param {Object} config - The source configuration from sources.yaml
 */
async function collect(config) {
  const SITE_NAME = config.name;
  const IMAP_USER = process.env[config.user_env];
  const IMAP_PASS = process.env[config.pass_env];
  const FOLDER = config.folder || 'INBOX';
  const LIMIT = config.limit || 10;

  if (!IMAP_USER || !IMAP_PASS) {
    console.error(`[imapCollector] Missing credentials for ${SITE_NAME}`);
    return { site: SITE_NAME, items: [], error: 'Missing credentials' };
  }

  const imap = new Imap({
    user: IMAP_USER,
    password: IMAP_PASS,
    host: config.host || 'imap.gmail.com',
    port: config.port || 993,
    tls: config.tls !== false,
    tlsOptions: { rejectUnauthorized: false },
    authTimeout: 10000,
    keepalive: false
  });

  return new Promise((resolve) => {
    let resolved = false;
    const items = [];
    const messagePromises = [];

    const safeResolve = (result) => {
      if (!resolved) {
        resolved = true;
        resolve(result);
      }
    };

    imap.once('ready', () => {
      imap.openBox(FOLDER, true, (err) => {
        if (err) {
          console.error(`[imapCollector] openBox error for ${SITE_NAME}:`, err);
          imap.end();
          return safeResolve({ site: SITE_NAME, items: [], error: err.message });
        }

        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        // Use a flat array for search criteria to avoid double-nesting issues
        let searchCriteria = ['ALL'];
        if (config.gmail_raw) {
          searchCriteria = [['X-GM-RAW', config.gmail_raw]];
        } else {
          searchCriteria = [['SINCE', yesterday]];
        }

        console.log(`[imapCollector] Searching ${SITE_NAME} with:`, JSON.stringify(searchCriteria));
        imap.search(searchCriteria, (err, uids) => {
          if (err) {
            console.error(`[imapCollector] search error for ${SITE_NAME}:`, err);
            imap.end();
            return safeResolve({ site: SITE_NAME, items: [], error: err.message });
          }

          if (uids.length === 0) {
            console.log(`[imapCollector] No messages found for ${SITE_NAME}.`);
            imap.end();
            return safeResolve({ site: SITE_NAME, items: [] });
          }

          const targetUids = uids.sort((a, b) => b - a).slice(0, LIMIT);
          // Fetch both the full header and the first 1KB of the body for a snippet
          const f = imap.fetch(targetUids, { bodies: ['HEADER', 'TEXT'] });

          f.on('message', (msg) => {
            const p = new Promise((resolveMsg) => {
              let headerData = null;
              let bodyData = '';

              msg.on('body', (stream, info) => {
                let buffer = '';
                stream.on('data', (chunk) => { buffer += chunk.toString('utf8'); });
                stream.on('end', () => {
                  if (info.which === 'HEADER') {
                    headerData = Imap.parseHeader(buffer);
                  } else {
                    bodyData = buffer.substring(0, 500); // Limit snippet size
                  }
                });
              });

              msg.once('end', () => {
                const subject = (headerData && headerData.subject) ? headerData.subject[0] : '(No Subject)';
                const date = (headerData && headerData.date) ? headerData.date[0] : new Date().toISOString();
                
                // Clean up snippet (remove HTML tags if any, though TEXT is usually plain)
                const snippet = bodyData.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

                items.push({
                  title: `Subject: ${subject} - ${snippet}...`,
                  url: '',
                  timestamp: new Date(date).toISOString()
                });
                resolveMsg();
              });
            });
            messagePromises.push(p);
          });

          f.once('error', (err) => {
            console.error(`[imapCollector] Fetch error for ${SITE_NAME}:`, err);
            imap.end();
          });

          f.once('end', () => {
            Promise.all(messagePromises).then(() => {
              imap.end();
            });
          });
        });
      });
    });

    imap.once('error', (err) => {
      console.error(`[imapCollector] connection error for ${SITE_NAME}:`, err);
      safeResolve({ site: SITE_NAME, items: [], error: err.message });
    });

    imap.once('end', () => {
      console.log(`[imapCollector] Finished ${SITE_NAME}. Found ${items.length} items.`);
      safeResolve({ site: SITE_NAME, items: items });
    });

    imap.connect();

    // 45s safety timeout
    setTimeout(() => {
      if (!resolved) {
        console.warn(`[imapCollector] Timeout for ${SITE_NAME}.`);
        imap.destroy();
        safeResolve({ site: SITE_NAME, items: items, error: 'Timeout' });
      }
    }, 45000);
  });
}

module.exports = { collect };
