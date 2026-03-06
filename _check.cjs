const fs = require('fs');
const html = fs.readFileSync('public/create.html', 'utf8');
const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
const scripts = [];
let m;
while ((m = re.exec(html)) !== null) scripts.push(m[1]);
const mainScript = scripts[scripts.length - 1];
const cleaned = mainScript.replace(/^\s*(import|export)\s+.*$/gm, '// [stripped]');
try {
  new Function(cleaned);
  console.log('JS syntax OK');
} catch(e) {
  console.log('SYNTAX ERROR:', e.message);
}
