import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
const files = ['server.mjs', 'base-sync.mjs', 'application-settings.mjs', 'src/data.js', 'src/app.js', 'src/platform-navigation.js', 'src/application-settings.js', ...['research', 'research/web', 'knowledge', 'knowledge/web', 'scripts', 'tests'].flatMap(dir => readdirSync(dir).filter(f => /\.mjs$/.test(f)).map(f => `${dir}/${f}`))];
for (const file of files) { const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit', windowsHide: true }); if (result.status !== 0) process.exit(result.status || 1); }
console.log(`${files.length} JavaScript files: syntax OK`);
