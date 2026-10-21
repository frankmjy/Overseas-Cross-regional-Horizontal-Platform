'use strict';
const fs = require('node:fs');
const path = require('node:path');
const tls = require('node:tls');
const { X509Certificate, createPrivateKey, createHash, randomUUID } = require('node:crypto');
const LIMIT = 128 * 1024;
let roots;
const fail = code => { throw Object.assign(new Error(code), { code }); };

function readFile(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > LIMIT) fail('TLS_FILE_UNSAFE');
  return fs.readFileSync(file);
}
function directory(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('TLS_DIRECTORY_UNSAFE');
}
function validDomains(domains) {
  if (!Array.isArray(domains) || !domains.length || domains.some(d => typeof d !== 'string' || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(d))) fail('TLS_DOMAINS_INVALID');
  return [...new Set(domains)];
}
function validatePair(certificate, privateKey, domains) {
  domains = validDomains(domains);
  if (certificate.length > LIMIT || privateKey.length > LIMIT) fail('TLS_CERT_SIZE');
  let chain, key;
  try {
    const parts = certificate.toString('utf8').match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
    if (!parts?.length || parts.length > 10) fail('TLS_CERT_FORMAT');
    chain = parts.map(pem => new X509Certificate(pem));
  } catch { fail('TLS_CERT_FORMAT'); }
  try { key = createPrivateKey(privateKey); } catch { fail('TLS_KEY_FORMAT'); }
  const leaf = chain[0], now = Date.now();
  if (!leaf.checkPrivateKey(key)) fail('TLS_CERT_KEY_MISMATCH');
  if (chain.some(c => Date.parse(c.validFrom) > now || Date.parse(c.validTo) <= now)) fail('TLS_CERT_TIME');
  if (leaf.ca || (leaf.keyUsage?.length && !leaf.keyUsage.includes('1.3.6.1.5.5.7.3.1'))) fail('TLS_CERT_USAGE');
  if (domains.some(domain => !leaf.checkHost(domain))) fail('TLS_CERT_DOMAIN');
  if (key.asymmetricKeyType === 'rsa' && key.asymmetricKeyDetails.modulusLength < 2048) fail('TLS_KEY_STRENGTH');
  for (let i = 0; i < chain.length - 1; i++) if (!chain[i + 1].ca || !chain[i].checkIssued(chain[i + 1]) || !chain[i].verify(chain[i + 1].publicKey)) fail('TLS_CERT_CHAIN');
  roots ||= (typeof tls.getCACertificates === 'function' ? tls.getCACertificates('default') : tls.rootCertificates).map(pem => new X509Certificate(pem));
  const top = chain.at(-1);
  if (!roots.some(root => root.ca && Date.parse(root.validFrom) <= now && now < Date.parse(root.validTo) && (root.fingerprint256 === top.fingerprint256 || (top.checkIssued(root) && top.verify(root.publicKey))))) fail('TLS_CERT_UNTRUSTED');
  const options = { cert: certificate, key: privateKey, minVersion: 'TLSv1.2' };
  let context;
  try { context = tls.createSecureContext(options); } catch { fail('TLS_CONTEXT_INVALID'); }
  return { options, context, domains, fingerprint: leaf.fingerprint256, validTo: leaf.validTo, version: createHash('sha256').update(certificate).digest('hex') };
}
function writeNew(file, bytes) {
  const descriptor = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(descriptor, bytes); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}
function atomic(file, bytes) {
  const tmp = `${file}.${randomUUID()}.tmp`;
  writeNew(tmp, bytes);
  try { fs.renameSync(tmp, file); } finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
}
function importPair(root, certificate, privateKey, domains) {
  const checked = validatePair(certificate, privateKey, domains);
  root = path.resolve(root);
  directory(root); directory(path.join(root, 'versions'));
  const destination = path.join(root, 'versions', checked.version);
  if (fs.existsSync(destination)) {
    if (fs.lstatSync(destination).isSymbolicLink() || !readFile(path.join(destination, 'fullchain.pem')).equals(certificate) || !readFile(path.join(destination, 'privkey.pem')).equals(privateKey)) fail('TLS_VERSION_CONFLICT');
  } else {
    const staging = path.join(root, 'versions', `${checked.version}.${randomUUID()}.staging`);
    directory(staging);
    try {
      writeNew(path.join(staging, 'fullchain.pem'), certificate);
      writeNew(path.join(staging, 'privkey.pem'), privateKey);
      fs.renameSync(staging, destination);
    } finally {
      if (fs.existsSync(staging)) {
        for (const name of ['fullchain.pem', 'privkey.pem']) if (fs.existsSync(path.join(staging, name))) fs.unlinkSync(path.join(staging, name));
        fs.rmdirSync(staging);
      }
    }
  }
  const pointer = { schema: 1, version: checked.version, domains: checked.domains, fingerprint: checked.fingerprint, validTo: checked.validTo };
  atomic(path.join(root, 'current.json'), JSON.stringify(pointer));
  return pointer;
}
function readCurrent(root) {
  root = path.resolve(root);
  if (fs.lstatSync(root).isSymbolicLink()) fail('TLS_DIRECTORY_UNSAFE');
  let pointer;
  try { pointer = JSON.parse(readFile(path.join(root, 'current.json')).toString('utf8')); } catch { fail('TLS_POINTER_INVALID'); }
  if (pointer.schema !== 1 || !/^[a-f0-9]{64}$/.test(pointer.version || '')) fail('TLS_POINTER_INVALID');
  validDomains(pointer.domains);
  const versions = path.join(root, 'versions'), dir = path.join(versions, pointer.version);
  if (fs.lstatSync(versions).isSymbolicLink() || fs.lstatSync(dir).isSymbolicLink()) fail('TLS_DIRECTORY_UNSAFE');
  const checked = validatePair(readFile(path.join(dir, 'fullchain.pem')), readFile(path.join(dir, 'privkey.pem')), pointer.domains);
  if (checked.version !== pointer.version || checked.fingerprint !== pointer.fingerprint) fail('TLS_POINTER_IDENTITY');
  return checked;
}
module.exports = { importPair, readCurrent, validatePair, readFile, validDomains };
