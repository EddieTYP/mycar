const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createSessionValue,
  verifySessionValue,
  parseCookies,
  getAuthAccounts,
} = require('../lib/auth');

test('createSessionValue + verifySessionValue round-trip', () => {
  const secret = 'test-secret';
  const value = createSessionValue('demo-admin', secret);
  const session = verifySessionValue(value, secret);

  assert.ok(session);
  assert.equal(session.username, 'demo-admin');
});

test('verifySessionValue rejects tampered cookie', () => {
  const secret = 'test-secret';
  const value = createSessionValue('demo-admin', secret);
  const [payload, signature] = value.split('.');
  const tampered = `${payload.slice(0, -1)}x.${signature}`;

  assert.equal(verifySessionValue(tampered, secret), null);
});

test('parseCookies parses cookie header pairs', () => {
  const cookies = parseCookies('a=1; session=abc123; theme=dark');
  assert.deepEqual(cookies, {
    a: '1',
    session: 'abc123',
    theme: 'dark',
  });
});

test('getAuthAccounts reads multiple accounts from AUTH_ACCOUNTS_JSON', () => {
  const accounts = getAuthAccounts({
    AUTH_ACCOUNTS_JSON: JSON.stringify({
      'demo-admin': 'demo-password-1',
      'demo-guest': 'demo-password-2',
    }),
  });

  assert.deepEqual(accounts, {
    'demo-admin': 'demo-password-1',
    'demo-guest': 'demo-password-2',
  });
});

test('getAuthAccounts falls back to single AUTH_USERNAME/AUTH_PASSWORD pair', () => {
  const accounts = getAuthAccounts({
    AUTH_USERNAME: 'demo-admin',
    AUTH_PASSWORD: 'demo-password-1',
  });

  assert.deepEqual(accounts, {
    'demo-admin': 'demo-password-1',
  });
});
