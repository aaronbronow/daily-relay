const ejs = require('ejs');
const fs = require('fs').promises;
const path = require('path');

const CACHE_FILE = path.join(__dirname, '../data/cache.json');
const TEMPLATE_FILE = path.join(__dirname, 'templates/briefing.ejs');
const PUBLIC_INDEX = path.join(__dirname, '../public/index.html');

async function render() {
  try {
    const data = JSON.parse(await fs.readFile(CACHE_FILE, 'utf8'));
    const html = await ejs.renderFile(TEMPLATE_FILE, { briefing: data });
    await fs.writeFile(PUBLIC_INDEX, html);
    console.log(`[Render] Briefing re-rendered from cache: ${PUBLIC_INDEX}`);
  } catch (err) {
    console.error("[Render] Failed to re-render:", err);
  }
}

render();
