/* global require, process */
const fs = require('fs');
const parser = require('@babel/parser');
const code = fs.readFileSync('src/pages/Chat.jsx','utf8');
try {
  parser.parse(code, { sourceType: 'module', plugins: ['jsx'] });
  console.log('Parsed OK');
} catch (e) {
  console.error('Parse error:', e.message);
  if (e.loc) {
    console.error('Line:', e.loc.line, 'Column:', e.loc.column);
    const lines = code.split(/\r?\n/);
    const start = Math.max(0, e.loc.line - 3);
    const end = Math.min(lines.length, e.loc.line + 2);
    for (let i = start; i < end; i++) {
      console.error(String(i + 1).padStart(4) + ': ' + lines[i]);
    }
  }
  process.exit(1);
}
