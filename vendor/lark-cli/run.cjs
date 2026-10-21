const { execFileSync } = require('node:child_process');
const path = require('node:path');

const exe = path.join(__dirname, 'bin', process.platform === 'win32' ? 'lark-cli.exe' : 'lark-cli');
const args = process.argv.slice(2);

try {
  execFileSync(exe, args, { stdio: 'inherit' });
} catch (error) {
  process.exit(error.status || 1);
}
