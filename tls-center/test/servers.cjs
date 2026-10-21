const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const http2 = require('node:http2');
const net = require('node:net');
const crypto = require('node:crypto');
const fixtures = process.env.VNET_TLS_TEST_FIXTURES;
const options = { cert: fs.readFileSync(path.join(fixtures, 'first.pem')), key: fs.readFileSync(path.join(fixtures, 'first.key')) };
const handler = (req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ encrypted: !!req.socket.encrypted, url: req.url })); };
const servers = {
  plainPublic: http.createServer(handler),
  securePublic: https.createServer(options, handler),
  loopback: http.createServer(handler),
  h2: http2.createSecureServer(options),
  h2Plain: http2.createServer(),
  rawTcp: net.createServer(socket => socket.end('raw TCP preserved')),
};
servers.h2.on('stream', stream => { stream.respond({ ':status': 200 }); stream.end('h2 preserved'); });
servers.h2Plain.on('stream', stream => { stream.respond({ ':status': 200 }); stream.end('h2 promoted'); });
servers.plainPublic.on('upgrade', (req, socket) => {
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.on('data', frame => {
    const size = frame[1] & 127, mask = frame.subarray(2, 6), payload = frame.subarray(6, 6 + size);
    if (size < 126) { const message = Buffer.from(payload.map((v, i) => v ^ mask[i % 4])); socket.write(Buffer.concat([Buffer.from([0x81, message.length]), message])); }
  });
});
Promise.all(Object.entries(servers).map(([name, server]) => new Promise((resolve, reject) => {
  server.once('error', reject);
  const result = server.listen(0, name === 'loopback' ? '127.0.0.1' : '0.0.0.0', () => resolve([name, server.address().port]));
  if (result !== server) reject(new Error('listen did not preserve return identity'));
}))).then(entries => process.send({ ports: Object.fromEntries(entries) })).catch(error => { console.error(error.code || error.message); process.exit(1); });
process.on('message', message => {
  if (message === 'close') {
    for (const server of Object.values(servers)) { server.closeAllConnections?.(); server.close(); }
    setTimeout(() => process.exit(0), 100).unref();
    process.disconnect();
  }
});
