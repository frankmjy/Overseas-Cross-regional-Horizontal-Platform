'use strict';
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const tls = require('node:tls');
const http = require('node:http');
const http2 = require('node:http2');
const { syncBuiltinESMExports } = require('node:module');
const { readCurrent } = require('./certificate.cjs');
const root = process.env.VNET_TLS_CENTER_ROOT || path.join(process.env.ProgramData || 'C:\\ProgramData', 'VNET', 'TLSCenter');
const originalContext = tls.Server.prototype.setSecureContext;
const originalListen = net.Server.prototype.listen;
const servers = new Set();
const cleartextH2 = new WeakSet();
const createH2 = http2.createServer;
http2.createServer = function(...args) { const server = createH2.apply(this, args); cleartextH2.add(server); return server; };
let current, timer, signature, lastError = '', installing = false;

function optionsFor(options = {}) {
  const next = { ...options, ...current.options, ciphers: tls.DEFAULT_CIPHERS, honorCipherOrder: true };
  delete next.pfx; delete next.passphrase; delete next.secureContext;
  if (options.minVersion === 'TLSv1.3') next.minVersion = 'TLSv1.3';
  if (options.maxVersion && !['TLSv1.2', 'TLSv1.3'].includes(options.maxVersion)) throw new Error('TLS_CENTER_PROTOCOL_TOO_OLD');
  return next;
}
function load() {
  if (!current) {
    current = readCurrent(root);
    signature = fs.readFileSync(path.join(root, 'current.json'), 'utf8');
    timer = setInterval(refresh, 2000); timer.unref();
  }
  return current;
}
function refresh() {
  try {
    const nextSignature = fs.readFileSync(path.join(root, 'current.json'), 'utf8');
    if (nextSignature === signature) return;
    const next = readCurrent(root), old = current;
    current = next;
    const updated = [];
    try {
      for (const server of servers) { apply(server); updated.push(server); }
    } catch (error) {
      current = old;
      for (const server of updated) apply(server);
      throw error;
    }
    signature = nextSignature; lastError = '';
    console.error(`[VNET TLS] active certificate ${next.fingerprint}; listeners=${servers.size}`);
  } catch (error) {
    const code = error.code?.startsWith('TLS_') ? error.code : 'TLS_CENTER_UPDATE_REJECTED';
    if (lastError !== code) { console.error(`[VNET TLS] ${code}; existing TLS contexts retained`); lastError = code; }
  }
}
function apply(server) {
  const options = optionsFor(server.__vnetOptions);
  const sniContext = tls.createSecureContext(options);
  originalContext.call(server, options);
  server.__vnetSNIContext = sniContext;
}
tls.Server.prototype.setSecureContext = function(options) {
  load();
  this.__vnetOptions = { ...options };
  apply(this);
};
function register(server) {
  load();
  apply(server);
  server._SNICallback = (name, callback) => {
    const allowed = current.domains.includes(String(name).toLowerCase());
    callback(allowed ? null : new Error('TLS_CENTER_SNI_REJECTED'), allowed ? server.__vnetSNIContext : undefined);
  };
  if (!servers.has(server)) { servers.add(server); server.once('close', () => servers.delete(server)); }
}
function loopback(args) {
  const first = args[0];
  if (first && typeof first === 'object' && (first.path || first.fd !== undefined)) return true;
  if (typeof first === 'string' && !/^\d+$/.test(first)) return true;
  const host = first && typeof first === 'object' ? first.host : args.find((arg, i) => i > 0 && typeof arg === 'string');
  return typeof host === 'string' && /^(?:localhost|::1|127(?:\.\d{1,3}){3})$/i.test(host);
}
function promote(server, args) {
  load();
  const transport = tls.createServer({ ...current.options, ...(cleartextH2.has(server) ? { ALPNProtocols: ['h2'] } : {}) }, socket => server.emit('connection', socket));
  register(transport);
  transport.on('error', error => server.emit('error', error));
  transport.on('listening', () => server.emit('listening'));
  transport.on('close', () => server.emit('close'));
  transport.on('tlsClientError', (error, socket) => server.emit('tlsClientError', error, socket));
  for (const method of ['address', 'getConnections', 'ref', 'unref']) server[method] = (...values) => {
    const result = transport[method](...values); return result === transport ? server : result;
  };
  Object.defineProperty(server, 'listening', { configurable: true, get: () => transport.listening });
  for (const property of ['maxConnections', 'dropMaxConnection']) {
    if (server[property] !== undefined) transport[property] = server[property];
    Object.defineProperty(server, property, { configurable: true, get: () => transport[property], set: value => { transport[property] = value; } });
  }
  server.close = callback => { server.closeIdleConnections?.(); transport.close(callback); return server; };
  if (typeof transport.closeAllConnections === 'function') server.closeAllConnections = transport.closeAllConnections.bind(transport);
  server.listen = (...values) => {
    const callback = typeof values.at(-1) === 'function' ? values.pop() : undefined;
    if (callback) server.once('listening', callback);
    register(transport);
    installing = true;
    try { originalListen.apply(transport, values); } finally { installing = false; }
    return server;
  };
  return server.listen(...args);
}
net.Server.prototype.listen = function(...args) {
  if (!installing && this instanceof tls.Server) register(this);
  else if (!installing && (this instanceof http.Server || cleartextH2.has(this)) && !loopback(args)) return promote(this, args);
  return originalListen.apply(this, args);
};
syncBuiltinESMExports();
