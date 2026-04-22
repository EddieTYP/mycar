#!/usr/bin/env node
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  readAccountsFromEnvFile,
  upsertAccount,
  deleteAccount,
} = require('../lib/accounts-file');

const repoRoot = path.resolve(__dirname, '..');
const envPath = path.join(repoRoot, '.env');
const projectName = process.env.CLOUDFLARE_PAGES_PROJECT || 'mycar';

function usage() {
  console.log(`Usage:
  node scripts/manage-accounts.js view
  node scripts/manage-accounts.js add <username> <password>
  node scripts/manage-accounts.js delete <username>

Behavior:
- add/delete update AUTH_ACCOUNTS_JSON inside .env
- if CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are set, add/delete will also attempt sync to Cloudflare Pages via scripts/sync-cloudflare-secrets.sh
- set --no-sync to skip Cloudflare sync for add/delete
`);
}

function shouldSync(args) {
  return !args.includes('--no-sync');
}

function printAccounts(accounts) {
  const names = Object.keys(accounts).sort();
  if (!names.length) {
    console.log('No accounts configured.');
    return;
  }
  console.log('Configured accounts:');
  for (const name of names) {
    console.log(`- ${name}`);
  }
}

function syncCloudflare() {
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
    console.log('Cloudflare sync skipped: CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID not set.');
    return 0;
  }

  const result = spawnSync(path.join(repoRoot, 'scripts', 'sync-cloudflare-secrets.sh'), [projectName], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  });
  return result.status || 0;
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || ['-h', '--help', 'help'].includes(command)) {
    usage();
    process.exit(0);
  }

  if (command === 'view') {
    printAccounts(readAccountsFromEnvFile(envPath));
    return;
  }

  if (command === 'add') {
    const username = args[1];
    const password = args[2];
    if (!username || !password) {
      console.error('Usage: node scripts/manage-accounts.js add <username> <password>');
      process.exit(1);
    }
    const updated = upsertAccount(envPath, username, password);
    console.log(`Added/updated account: ${username}`);
    printAccounts(updated);
    if (shouldSync(args)) {
      process.exit(syncCloudflare());
    }
    return;
  }

  if (command === 'delete') {
    const username = args[1];
    if (!username) {
      console.error('Usage: node scripts/manage-accounts.js delete <username>');
      process.exit(1);
    }
    const updated = deleteAccount(envPath, username);
    console.log(`Deleted account: ${username}`);
    printAccounts(updated);
    if (shouldSync(args)) {
      process.exit(syncCloudflare());
    }
    return;
  }

  console.error(`Unknown command: ${command}`);
  usage();
  process.exit(1);
}

main();
