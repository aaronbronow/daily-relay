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
    port: 993,
    tls: true,
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

          if (!uids || uids.length === 0) {
            console.log(`[imapCollector] No messages found for ${SITE_NAME}.`);
            imap.end();
            return safeResolve({ site: SITE_NAME, items: [] });
          }

          const targetUids = uids.sort((a, b) => b - a).slice(0, LIMIT);
          // Fetch full body to allow mailparser to decode correctly
          const f = imap.fetch(targetUids, { bodies: '' });

          f.on('message', (msg) => {
            const p = new Promise((resolveMsg) => {
              msg.on('body', (stream) => {
                simpleParser(stream).then(parsed => {
                  const subject = parsed.subject || '(No Subject)';
                  const date = parsed.date || new Date();
                  const from = parsed.from ? (parsed.from.value[0].name || parsed.from.value[0].address) : 'Unknown Sender';
                  
                  // Extract a clean text snippet
                  let snippet = '';
                  if (parsed.text) {
                    snippet = parsed.text.substring(0, 500).replace(/\s+/g, ' ').trim();
                  } else if (parsed.html) {
                    snippet = parsed.html.replace(/<[^>]*>/g, ' ').substring(0, 500).replace(/\s+/g, ' ').trim();
                  }

                  items.push({
                    title: subject,
                    from: from,
                    description: snippet,
                    url: '',
                    timestamp: date.toISOString()
                  });
                }).catch(err => console.error(`[imapCollector] Parse error for message in ${SITE_NAME}:`, err))
                  .finally(() => resolveMsg());
              });
            });
            messagePromises.push(p);
          });

          f.once('error', (err) => {
            console.error(`[imapCollector] Fetch error for ${SITE_NAME}:`, err);
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

    // 60s safety timeout (parsing full bodies can take a bit longer)
    setTimeout(() => {
      if (!resolved) {
        console.warn(`[imapCollector] Timeout for ${SITE_NAME}.`);
        imap.destroy();
        safeResolve({ site: SITE_NAME, items: items, error: 'Timeout' });
      }
    }, 60000);
  });
}

module.exports = { collect };
