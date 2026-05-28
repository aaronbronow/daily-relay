const { google } = require('googleapis');
const { Readable } = require('stream');

/**
 * Publishes the HTML briefing to Google Drive as a Google Doc.
 *
 * @param {string} htmlContent - The HTML content to upload.
 * @param {Object} targetConfig - Configuration containing filename, etc.
 */
async function publishBriefing(htmlContent, targetConfig) {
  const filename = targetConfig.filename || 'Daily Relay Briefing';
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    console.warn('[googleDrivePublisher] Missing Google credentials. Skipping Drive publishing.');
    return false;
  }

  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  try {
    // Escape single quotes in filename for query
    const escapedFilename = filename.replace(/'/g, "\\'");
    const q = `name = '${escapedFilename}' and mimeType = 'application/vnd.google-apps.document' and trashed = false`;

    const listRes = await drive.files.list({
      q,
      spaces: 'drive',
      fields: 'files(id, name)'
    });

    const files = listRes.data.files || [];

    if (files.length > 0) {
      // Overwrite the existing document
      const fileId = files[0].id;
      console.log(`[googleDrivePublisher] Found existing document (ID: ${fileId}). Updating content...`);

      await drive.files.update({
        fileId,
        media: {
          mimeType: 'text/html',
          body: Readable.from(htmlContent)
        }
      });

      console.log(`[googleDrivePublisher] Successfully updated "${filename}" (ID: ${fileId})`);
    } else {
      // Create a new document
      console.log(`[googleDrivePublisher] Document "${filename}" not found. Creating new Google Doc...`);

      const createRes = await drive.files.create({
        requestBody: {
          name: filename,
          mimeType: 'application/vnd.google-apps.document'
        },
        media: {
          mimeType: 'text/html',
          body: Readable.from(htmlContent)
        }
      });

      console.log(`[googleDrivePublisher] Successfully created "${filename}" (ID: ${createRes.data.id})`);
    }
    return true;
  } catch (error) {
    console.error(`[googleDrivePublisher] Error publishing to Google Drive:`, error);
    return false;
  }
}

module.exports = {
  publishBriefing
};
