import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const version = '6.4.299';
const integrity = 'AVl138zALtfaAPvADulE0PZThbYzCBS79nL4pOSL/6Sm/4AH5A21BD9VHt97OlCuzJuCpmeZtAtkinisF4Vb1g==';
const dir = path.resolve('vendor/pdfjs');
if (fs.existsSync(path.join(dir, 'manifest.json'))) throw new Error('PDF.js 已入库，不重复下载或覆盖。');
const source = `https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-${version}.tgz`;
const first = await fetch(source, { headers: { Range: 'bytes=0-0' } });
const total = Number(/\/(\d+)$/.exec(first.headers.get('content-range') || '')?.[1]);
await first.arrayBuffer();
if (first.status !== 206 || !total || total > 50 * 1024 * 1024) throw new Error('PDF.js 下载服务器未提供有效分段信息。');
const chunks = [];
for (let start = 0; start < total; start += 2 * 1024 * 1024) {
  const end = Math.min(total - 1, start + 2 * 1024 * 1024 - 1);
  const response = await fetch(source, { headers: { Range: `bytes=${start}-${end}` } });
  if (response.status !== 206 || response.headers.get('content-range') !== `bytes ${start}-${end}/${total}`) throw new Error('PDF.js 分段响应不匹配。');
  const chunk = Buffer.from(await response.arrayBuffer());
  if (chunk.length !== end - start + 1) throw new Error('PDF.js 分段下载不完整。');
  chunks.push(chunk);
}
const bytes = Buffer.concat(chunks);
if (createHash('sha512').update(bytes).digest('base64') !== integrity) throw new Error('PDF.js npm 完整性校验失败。');
fs.mkdirSync('.runtime/research-deps', { recursive: true });
const archive = path.resolve(`.runtime/research-deps/NOT-A-RELEASE-pdfjs-${version}.tgz`); fs.writeFileSync(archive, bytes);
const all = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/);
if (all.some(name => name.startsWith('/') || name.includes('..') || name.includes('\\'))) throw new Error('PDF.js 压缩包包含异常路径。');
fs.mkdirSync(dir, { recursive: true });
execFileSync('tar', ['-xzf', archive, '-C', dir, '--strip-components', '1', 'package/build/pdf.mjs', 'package/build/pdf.worker.mjs', 'package/cmaps', 'package/standard_fonts', 'package/wasm', 'package/LICENSE'], { windowsHide: true });
function files(folder) { return fs.readdirSync(folder, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(folder, e.name)) : [path.join(folder, e.name)]); }
const hashes = Object.fromEntries(files(dir).map(file => [path.relative(dir, file).replaceAll('\\', '/'), createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ name: 'pdfjs-dist', version, license: 'Apache-2.0', source: `https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-${version}.tgz`, npmIntegrity: `sha512-${integrity}`, files: hashes }, null, 2));
console.log(JSON.stringify({ ok: true, version, files: Object.keys(hashes).length, archiveIntegrity: 'verified' }));
