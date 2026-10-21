'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { importPair, readCurrent, readFile, validatePair } = require('./certificate.cjs');
const [command, rootArg, ...args] = process.argv.slice(2);
const root = path.resolve(rootArg || path.join(process.env.ProgramData || 'C:\\ProgramData', 'VNET', 'TLSCenter'));
const domains = ['sm.sjhl.online', 'www.sm.sjhl.online'];
function report(checked) {
  console.log(JSON.stringify({ active: true, version: checked.version, fingerprint: checked.fingerprint, validTo: checked.validTo, domains: checked.domains }));
}
try {
  if (command === 'validate') report(validatePair(readFile(args[0]), readFile(args[1]), domains));
  else if (command === 'import') {
    report(importPair(root, readFile(args[0]), readFile(args[1]), domains));
  } else if (command === 'status') report(readCurrent(root));
  else if (command === 'watch') {
    let lastInput = '', lastError = '';
    const status = value => {
      const destination = path.join(root, 'watch-status.json'), temporary = `${destination}.${process.pid}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify({ updatedAt: new Date().toISOString(), pid: process.pid, ...value }), { mode: 0o600 }); fs.renameSync(temporary, destination);
    };
    const check = () => {
      try {
        const certFile = path.join(root, 'inbox', 'fullchain.pem'), keyFile = path.join(root, 'inbox', 'privkey.pem');
        if (!fs.existsSync(certFile) || !fs.existsSync(keyFile)) return;
        const cert = readFile(certFile), key = readFile(keyFile);
        const signature = createHash('sha256').update(cert).update(key).digest('hex');
        if (signature === lastInput) return;
        const checked = importPair(root, cert, key, domains);
        lastInput = signature; lastError = ''; report(checked); status({ state: 'ready', fingerprint: checked.fingerprint, validTo: checked.validTo });
      } catch (error) {
        const code = error.code?.startsWith('TLS_') ? error.code : 'TLS_IMPORT_REJECTED';
        if (code !== lastError) { console.error(`${code}: active certificate retained; correct the inbox pair to retry.`); lastError = code; status({ state: 'error', error: code, existingCertificateRetained: true }); }
      }
    };
    check(); setInterval(check, 2000);
  } else throw Object.assign(new Error('TLS_COMMAND_INVALID'), { code: 'TLS_COMMAND_INVALID' });
} catch (error) {
  console.error(error.code?.startsWith('TLS_') ? error.code : 'TLS_CENTER_OPERATION_FAILED');
  process.exitCode = 1;
}
