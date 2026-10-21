const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const http = require('node:http');
const http2 = require('node:http2');
const net = require('node:net');
const tls = require('node:tls');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const { importPair } = require('../certificate.cjs');
const fixtures = process.env.VNET_TLS_TEST_FIXTURES;
const domains = ['sm.sjhl.online', 'www.sm.sjhl.online'];
const pair = name => [fs.readFileSync(path.join(fixtures, `${name}.pem`)), fs.readFileSync(path.join(fixtures, `${name}.key`))];
function start(root) {
  const child = fork(path.join(__dirname, 'servers.cjs'), [], { execArgv: [], env: { ...process.env, VNET_TLS_CENTER_ROOT: root, NODE_OPTIONS: `--require="${path.join(__dirname, '../preload.cjs').replaceAll('\\', '/')}"` }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let errors = ''; child.stderr.on('data', chunk => { errors += chunk; });
  return new Promise((resolve, reject) => { child.once('message', data => resolve({ child, ...data, errors: () => errors })); child.once('exit', code => reject(new Error(`Fixture exited ${code}: ${errors}`))); });
}
const secure = (port, agent = false) => new Promise((resolve, reject) => {
  const request = https.get({ hostname: '127.0.0.1', servername: domains[0], port, agent, timeout: 3000 }, response => {
    const fingerprint = response.socket.getPeerCertificate().fingerprint256;
    let text = ''; response.on('data', c => { text += c; }); response.on('end', () => resolve({ fingerprint, body: JSON.parse(text), status: response.statusCode }));
  });
  request.on('error', reject); request.on('timeout', () => request.destroy(new Error('Timeout')));
});
const plain = port => new Promise((resolve, reject) => { const req = http.get({ hostname: '127.0.0.1', port, timeout: 2000 }, res => { res.resume(); res.once('end', () => resolve(res.statusCode)); }); req.on('error', reject); req.on('timeout', () => req.destroy(new Error('Timeout'))); });

test('public HTTP/HTTPS ports share a certificate; hot rotation keeps old connections and protects internal HTTP/TCP', { timeout: 25000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vnet-tls-runtime-'));
  const first = importPair(root, ...pair('first'), domains);
  const children = [], agent = new https.Agent({ keepAlive: true, maxSockets: 1 });
  let h2;
  try {
    const running = await start(root); children.push(running.child);
    for (const port of [running.ports.plainPublic, running.ports.securePublic]) {
      const response = await secure(port); assert.equal(response.fingerprint, first.fingerprint); assert.equal(response.body.encrypted, true);
      await assert.rejects(plain(port));
    }
    assert.equal(await plain(running.ports.loopback), 200);
    const raw = net.connect(running.ports.rawTcp, '127.0.0.1');
    let rawText=''; raw.on('data', c => { rawText+=c; }); await once(raw,'end'); assert.equal(rawText, 'raw TCP preserved');
    h2 = http2.connect(`https://127.0.0.1:${running.ports.h2}`, { servername: domains[0] });
    const stream = h2.request({ ':path': '/' }); let h2Text=''; stream.on('data', c=>{h2Text+=c;}); await once(stream,'end'); assert.equal(h2Text,'h2 preserved');
    const promotedH2 = http2.connect(`https://127.0.0.1:${running.ports.h2Plain}`, { servername: domains[0] });
    const promotedStream = promotedH2.request({ ':path': '/' }); let promotedText=''; promotedStream.on('data',c=>{promotedText+=c;}); await once(promotedStream,'end'); assert.equal(promotedText,'h2 promoted'); promotedH2.destroy();
    const kept = await secure(running.ports.plainPublic, agent); assert.equal(kept.fingerprint, first.fingerprint);
    const second = importPair(root, ...pair('second'), domains);
    let refreshed;
    for (let i=0; i<25; i++) { refreshed=await secure(running.ports.securePublic); if (refreshed.fingerprint===second.fingerprint) break; await new Promise(r=>setTimeout(r,200)); }
    assert.equal(refreshed.fingerprint, second.fingerprint);
    assert.equal((await secure(running.ports.plainPublic)).fingerprint, second.fingerprint);
    assert.equal((await secure(running.ports.plainPublic, agent)).fingerprint, first.fingerprint, 'existing TLS connection must survive rotation');
    const saved = fs.readFileSync(path.join(root,'current.json'));
    fs.writeFileSync(path.join(root,'current.json'),'{ invalid update');
    await new Promise(r=>setTimeout(r,2300));
    assert.equal((await secure(running.ports.plainPublic)).fingerprint, second.fingerprint);
    assert.match(running.errors(),/existing TLS contexts retained/);
    fs.writeFileSync(path.join(root,'current.json'),saved);
    const later = await start(root); children.push(later.child);
    assert.equal((await secure(later.ports.securePublic)).fingerprint, second.fingerprint, 'new processes and ports use current certificate');
  } finally {
    agent.destroy(); h2?.destroy();
    for (const child of children) { const ended=once(child,'exit'); child.send('close'); await ended; }
    fs.rmSync(root, {recursive:true,force:true});
  }
});

test('promoted public HTTP preserves WebSocket upgrades over TLS', {timeout:10000}, async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'vnet-tls-ws-'));
  importPair(root,...pair('first'),domains);
  const running=await start(root);
  let socket;
  try {
    socket=tls.connect({host:'127.0.0.1',port:running.ports.plainPublic,servername:domains[0]});
    await once(socket,'secureConnect');
    socket.write(`GET /ws HTTP/1.1\r\nHost: ${domains[0]}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    const [headers]=await once(socket,'data'); assert.match(headers.toString(),/101 Switching Protocols/);
    const mask=Buffer.from([1,2,3,4]), text=Buffer.from('hello');
    socket.write(Buffer.concat([Buffer.from([0x81,0x80|text.length]),mask,Buffer.from(text.map((b,i)=>b^mask[i%4]))]));
    const [echo]=await once(socket,'data'); assert.equal(echo.subarray(2).toString(),'hello');
  } finally {socket?.destroy(); const ended=once(running.child,'exit');running.child.send('close');await ended;fs.rmSync(root,{recursive:true,force:true});}
});
