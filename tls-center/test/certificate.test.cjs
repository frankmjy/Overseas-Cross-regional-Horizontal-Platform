const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { importPair, readCurrent, validatePair } = require('../certificate.cjs');
const fixtures = process.env.VNET_TLS_TEST_FIXTURES;
const domains = ['sm.sjhl.online', 'www.sm.sjhl.online'];
const pair = name => [fs.readFileSync(path.join(fixtures, `${name}.pem`)), fs.readFileSync(path.join(fixtures, `${name}.key`))];

test('validated versions survive reload; failed candidates cannot replace the current certificate', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vnet-tls-store-'));
  try {
    const first = importPair(root, ...pair('first'), domains);
    assert.equal(readCurrent(root).version, first.version);
    assert.equal(importPair(root, ...pair('first'), domains).version, first.version);
    assert.throws(() => importPair(root, pair('second')[0], pair('first')[1], domains), /TLS_CERT_KEY_MISMATCH/);
    assert.throws(() => importPair(root, ...pair('expired'), domains), /TLS_CERT_TIME/);
    assert.throws(() => importPair(root, ...pair('first'), ['wrong.example']), /TLS_CERT_DOMAIN/);
    assert.equal(readCurrent(root).version, first.version);
    const second = importPair(root, ...pair('second'), domains);
    assert.notEqual(second.version, first.version);
    assert.equal(readCurrent(root).fingerprint, second.fingerprint);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('malformed input, forged trust, and pointer traversal are rejected without exposing private key contents', () => {
  const [cert, key] = pair('first');
  assert.throws(() => validatePair(Buffer.from('invalid'), key, domains), /TLS_CERT_FORMAT/);
  assert.throws(() => validatePair(cert, Buffer.from('invalid secret material'), domains), error => !error.message.includes('secret material'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vnet-tls-pointer-'));
  try {
    fs.writeFileSync(path.join(root, 'current.json'), JSON.stringify({ schema: 1, version: '../other', domains }));
    assert.throws(() => readCurrent(root), /TLS_POINTER/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
