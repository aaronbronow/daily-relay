const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const CSV_FILE = path.join(__dirname, '../Weekly_Home_Checklist_Mindset_Aligned_2026.csv');
const YAML_FILE = path.join(__dirname, '../data/homeChecklist.yaml');

/**
 * Character-by-character CSV line parser.
 * Properly respects double quotes enclosing commas.
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function convert() {
  try {
    console.log(`[Converter] Reading CSV: ${CSV_FILE}`);
    const csvContent = fs.readFileSync(CSV_FILE, 'utf8');
    const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);
    
    // Header check
    const header = parseCSVLine(lines[0]);
    console.log('[Converter] CSV Headers:', header);
    
    const tasks = [];
    
    for (let i = 1; i < lines.length; i++) {
      const fields = parseCSVLine(lines[i]);
      if (fields.length < 5) {
        console.warn(`[Converter] Skipping malformed line ${i + 1}: ${lines[i]}`);
        continue;
      }
      
      const [weekStr, name, taskDescription, lastDayOfWeek, mindsetHoliday] = fields;
      
      tasks.push({
        week: parseInt(weekStr, 10),
        name: name,
        taskDescription: taskDescription,
        lastDayOfWeek: lastDayOfWeek,
        mindsetHoliday: mindsetHoliday
      });
    }
    
    console.log(`[Converter] Successfully parsed ${tasks.length} tasks.`);
    
    // Dump to YAML
    const yamlString = yaml.dump({ tasks }, { indent: 2, lineWidth: -1 });
    fs.writeFileSync(YAML_FILE, yamlString, 'utf8');
    console.log(`[Converter] Saved YAML output: ${YAML_FILE}`);
    
  } catch (err) {
    console.error('[Converter] Conversion failed:', err);
    process.exit(1);
  }
}

convert();
