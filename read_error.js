const fs = require('fs');
const content = fs.readFileSync('error.log', 'utf16le');
const lines = content.split('\n');
console.log(lines.slice(-100).join('\n'));
