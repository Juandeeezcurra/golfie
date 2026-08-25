// Corre todos los suites contra el cliente y el backend reales.
// Uso: node tests/run.js
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'suites');
let pass = 0, fail = 0;
const fallos = [];

const ok = (cond, msg) => {
  if (cond) { pass++; console.log('    \x1b[32m✓\x1b[0m ' + msg); }
  else { fail++; fallos.push(msg); console.log('    \x1b[31m✗ ' + msg + '\x1b[0m'); }
};

(async () => {
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort()) {
    console.log('\n\x1b[1m' + f.replace(/\.js$/, '') + '\x1b[0m');
    try {
      await require(path.join(dir, f))(ok);
    } catch (e) {
      fail++; fallos.push(f + ' explotó: ' + e.message);
      console.log('    \x1b[31m✗ el suite explotó: ' + e.stack + '\x1b[0m');
    }
  }

  console.log('\n' + '─'.repeat(50));
  if (fail) {
    console.log('\x1b[31m' + fail + ' fallidos\x1b[0m de ' + (pass + fail) + ':');
    fallos.forEach(m => console.log('  · ' + m));
  } else {
    console.log('\x1b[32mTODO OK\x1b[0m — ' + pass + ' checks');
  }
  process.exit(fail ? 1 : 0);
})();
