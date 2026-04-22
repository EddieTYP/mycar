const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeCommand,
  shouldSync,
  shouldDeploy,
  formatAccountRows,
} = require('../lib/manage-accounts');

test('normalizeCommand maps set-password to add', () => {
  assert.equal(normalizeCommand('set-password'), 'add');
  assert.equal(normalizeCommand('add'), 'add');
  assert.equal(normalizeCommand('delete'), 'delete');
});

test('shouldSync and shouldDeploy respect flags', () => {
  assert.equal(shouldSync([]), true);
  assert.equal(shouldSync(['--no-sync']), false);
  assert.equal(shouldDeploy([]), true);
  assert.equal(shouldDeploy(['--no-deploy']), false);
  assert.equal(shouldDeploy(['--no-sync']), false);
});

test('formatAccountRows shows local and cloudflare sync state', () => {
  const rows = formatAccountRows(
    { 'demo-admin': 'x', 'demo-guest': 'y' },
    { 'demo-admin': 'x' }
  );
  assert.deepEqual(rows, [
    'Configured accounts:',
    '- demo-admin [local+cloudflare]',
    '- demo-guest [local-only]',
  ]);
});
