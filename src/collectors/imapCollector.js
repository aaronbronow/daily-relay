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
  const MAX_RETRIES = 3;

  if (!IMAP_USER || !IMAP_PASS) {
    console.error(`[imapCollector] Missing credentials for ${SITE_NAME}`);
    return { site: SITE_NAME, items: [], error: 'Missing credentials' };
  }

  const runAttempt = (attempt) => {
    return new Promise((resolve) => {
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

      let resolved = false;
      let lastError = null;
      const items = [];
      const messagePromises = [];

      const safeResolve = (result) => {
        if (!resolved) {
          resolved = true;
          resolve(result);
        }
      };

      imap.once('ready', () => {
        console.log(`[imapCollector] (${SITE_NAME}) [Attempt ${attempt}] Connection established. Opening ${FOLDER}...`);
        imap.openBox(FOLDER, true, (err) => {
          if (err) {
            console.error(`[imapCollector] (${SITE_NAME}) openBox error:`, err);
            lastError = err.message;
            imap.end();
            return safeResolve({ site: SITE_NAME, items: [], error: err.message });
          }

          console.log(`[imapCollector] (${SITE_NAME}) Folder opened. Preparing search...`);
          const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
          let searchCriteria = ['ALL'];
          if (config.gmail_raw) {
            searchCriteria = [['X-GM-RAW', config.gmail_raw]];
          } else {
            searchCriteria = [['SINCE', threeDaysAgo]];
          }

          console.log(`[imapCollector] (${SITE_NAME}) Executing search:`, JSON.stringify(searchCriteria));
          
          const fetchMessages = (uids) => {
            if (!uids || uids.length === 0) {
              console.log(`[imapCollector] (${SITE_NAME}) No messages found.`);
              imap.end();
              return safeResolve({ site: SITE_NAME, items: [] });
            }

            const targetUids = uids.slice(0, LIMIT);
            console.log(`[imapCollector] (${SITE_NAME}) Fetching ${targetUids.length} messages...`);
            const f = imap.fetch(targetUids, { bodies: '' });

            let fetchedCount = 0;
            f.on('message', (msg) => {
              const p = new Promise((resolveMsg) => {
                msg.on('body', (stream) => {
                  simpleParser(stream).then(parsed => {
                    fetchedCount++;
                    const subject = parsed.subject || '(No Subject)';
                    console.log(`[imapCollector] (${SITE_NAME}) Parsed [${fetchedCount}/${targetUids.length}]: ${subject.substring(0, 30)}...`);
                    
                    const date = parsed.date || new Date();
                    const from = parsed.from ? (parsed.from.value[0].name || parsed.from.value[0].address) : 'Unknown Sender';
                    const fromAddress = (parsed.from && parsed.from.value[0].address) || '';
                    
                    const html = parsed.html || '';
                    const text = parsed.text || '';
                    const headingCount = (html.match(/<h[1-6]/gi) || []).length;
                    const linkCount = (html.match(/<a\b/gi) || []).length;
                    const listCount = (html.match(/<(ul|ol)\b/gi) || []).length;
                    const bodyLength = (text || html).length;

                    const cpx = (bodyLength > 5000 ? 3 : bodyLength > 2000 ? 1 : 0) + 
                                (headingCount > 3 ? 2 : 0) + 
                                (linkCount > 25 ? 2 : 0) + 
                                (listCount > 0 ? 1 : 0);

                    let snippet = '';
                    const hasText = parsed.text && parsed.text.trim().length > 0;
                    
                    if (hasText) {
                      snippet = parsed.text;
                    } else if (parsed.html) {
                      snippet = parsed.html
                        .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gmi, ' ')
                        .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gmi, ' ')
                        .replace(/<[^>]*>/g, ' ');
                    }
                    snippet = snippet.replace(/\s+/g, ' ').trim().substring(0, 1000);

                    items.push({
                      title: subject,
                      from: from,
                      fromAddress: fromAddress,
                      description: snippet,
                      url: '',
                      timestamp: date.toISOString(),
                      metrics: {
                        headings: headingCount,
                        links: linkCount,
                        lists: listCount,
                        length: bodyLength,
                        cpx: cpx
                      }
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
          };

          if (imap.serverSupports('SORT')) {
            imap.sort(['ARRIVAL'], searchCriteria, (err, uids) => {
              if (err) {
                console.warn(`[imapCollector] SORT failed for ${SITE_NAME}, falling back to search:`, err.message);
                imap.search(searchCriteria, (err, uids) => {
                  if (err) {
                    console.error(`[imapCollector] search error for ${SITE_NAME}:`, err);
                    lastError = err.message;
                    imap.end();
                    return safeResolve({ site: SITE_NAME, items: [], error: err.message });
                  }
                  fetchMessages(uids.sort((a, b) => b - a));
                });
              } else {
                fetchMessages(uids.reverse());
              }
            });
          } else {
            imap.search(searchCriteria, (err, uids) => {
              if (err) {
                console.error(`[imapCollector] search error for ${SITE_NAME}:`, err);
                lastError = err.message;
                imap.end();
                return safeResolve({ site: SITE_NAME, items: [], error: err.message });
              }
              fetchMessages(uids.sort((a, b) => b - a));
            });
          }
        });
      });

      imap.once('error', (err) => {
        console.error(`[imapCollector] (${SITE_NAME}) [Attempt ${attempt}] connection error:`, err);
        lastError = err.message;
        safeResolve({ site: SITE_NAME, items: [], error: err.message });
      });

      imap.once('end', () => {
        console.log(`[imapCollector] (${SITE_NAME}) [Attempt ${attempt}] Finished. Found ${items.length} items.`);
        const sortedItems = items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const result = { site: SITE_NAME, items: sortedItems };
        if (lastError && items.length === 0) result.error = lastError;
        safeResolve(result);
      });

      imap.connect();

      setTimeout(() => {
        if (!resolved) {
          console.warn(`[imapCollector] Timeout for ${SITE_NAME} on attempt ${attempt}.`);
          imap.destroy();
          safeResolve({ site: SITE_NAME, items: items, error: 'Timeout' });
        }
      }, 60000);
    });
  };

  let result;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    result = await runAttempt(attempt);
    if (!result.error) return result;
    
    if (result.error && (result.error.includes('authentication failed') || result.error.includes('invalid credentials'))) {
      console.error(`[imapCollector] Authentication failed for ${SITE_NAME}. Not retrying.`);
      return result;
    }

    if (attempt < MAX_RETRIES) {
      const delay = attempt * 2000; // 2s, then 4s. Total = 6s < 10s.
      console.log(`[imapCollector] (${SITE_NAME}) Retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  return result;
}

module.exports = { collect };
