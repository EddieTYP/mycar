const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createSessionValue,
  verifySessionValue,
  parseCookies,
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
