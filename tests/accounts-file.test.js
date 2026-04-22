const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  readAccountsFromEnvFile,
  writeAccountsToEnvFile,
  upsertAccount,
  deleteAccount,
} = require('../lib/accounts-file');

function withTempEnvFile(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mycar-accounts-'));
  const file = path.join(dir, '.env');
  fs.writeFileSync(file, 'PORT=8000\nAUTH_ACCOUNTS_JSON={"demo-admin":"demo-password-1"}\nSESSION_SECRET=test\n');
  try {
    fn(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('readAccountsFromEnvFile returns parsed account map', () => {
  withTempEnvFile((file) => {
    assert.deepEqual(readAccountsFromEnvFile(file), { 'demo-admin': 'demo-password-1' });
  });
});

test('upsertAccount adds a new account and preserves others', () => {
  withTempEnvFile((file) => {
    const updated = upsertAccount(file, 'demo-guest', 'demo-password-2');
    assert.deepEqual(updated, {
      'demo-admin': 'demo-password-1',
      'demo-guest': 'demo-password-2',
    });
  });
});

test('deleteAccount removes existing account', () => {
  withTempEnvFile((file) => {
    upsertAccount(file, 'demo-guest', 'demo-password-2');
    const updated = deleteAccount(file, 'demo-admin');
    assert.deepEqual(updated, { 'demo-guest': 'demo-password-2' });
  });
});

test('writeAccountsToEnvFile rewrites AUTH_ACCOUNTS_JSON line', () => {
  withTempEnvFile((file) => {
    writeAccountsToEnvFile(file, { 'demo-guest': 'demo-password-2' });
    const text = fs.readFileSync(file, 'utf8');
    assert.match(text, /AUTH_ACCOUNTS_JSON=\{"demo-guest":"demo-password-2"\}/);
    assert.match(text, /PORT=8000/);
    assert.match(text, /SESSION_SECRET=test/);
  });
});
