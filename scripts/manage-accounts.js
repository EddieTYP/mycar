const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  readAccountsFromEnvFile,
  upsertAccount,
  deleteAccount,
} = require('../lib/accounts-file');
const {
  normalizeCommand,
  shouldSync,
  shouldDeploy,
  formatAccountRows,
} = require('../lib/manage-accounts');

const repoRoot = path.resolve(__dirname, '..');
const envPath = path.join(repoRoot, '.env');
const syncStatePath = path.join(repoRoot, '.cloudflare-sync-state.json');
const projectName = process.env.CLOUDFLARE_PAGES_PROJECT || 'mycar';

function usage() {
  console.log(`Usage:
  node scripts/manage-accounts.js view [--verbose]
  node scripts/manage-accounts.js add <username> <password> [--no-sync] [--no-deploy]
  node scripts/manage-accounts.js set-password <username> <password> [--no-sync] [--no-deploy]
  node scripts/manage-accounts.js delete <username> [--no-sync] [--no-deploy]

Behavior:
- add/set-password/delete update AUTH_ACCOUNTS_JSON inside .env
- add/delete/set-password attempt Cloudflare sync unless --no-sync is set
- after successful sync, deploy is attempted unless --no-deploy is set
- view --verbose shows last known Cloudflare sync state from .cloudflare-sync-state.json
`);
}

function printAccounts(accounts, verbose = false) {
  let cloudflareAccounts = null;
  if (verbose && fs.existsSync(syncStatePath)) {
    try {
      const state = JSON.parse(fs.readFileSync(syncStatePath, 'utf8'));
      cloudflareAccounts = Object.fromEntries((state.accounts || []).map((name) => [name, true]));
      console.log(`Cloudflare sync state: ${state.project || projectName} @ ${state.synced_at_utc || 'unknown time'}`);
    } catch {
      console.log('Cloudflare sync state: unreadable');
    }
  }
  for (const line of formatAccountRows(accounts, cloudflareAccounts)) {
    console.log(line);
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

function deployCloudflare() {
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
    console.log('Cloudflare deploy skipped: CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID not set.');
    return 0;
  }

  const result = spawnSync('wrangler', ['pages', 'deploy', '.', '--project-name', projectName, '--commit-dirty=true'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  });
  return result.status || 0;
}

function main() {
  const args = process.argv.slice(2);
  const rawCommand = args[0];
  const command = normalizeCommand(rawCommand);

  if (!rawCommand || ['-h', '--help', 'help'].includes(rawCommand)) {
    usage();
    process.exit(0);
  }

  if (command === 'view') {
    printAccounts(readAccountsFromEnvFile(envPath), args.includes('--verbose'));
    return;
  }

  if (command === 'add') {
    const username = args[1];
    const password = args[2];
    if (!username || !password) {
      console.error(`Usage: node scripts/manage-accounts.js ${rawCommand} <username> <password>`);
      process.exit(1);
    }
    const updated = upsertAccount(envPath, username, password);
    console.log(`${rawCommand === 'set-password' ? 'Set password for' : 'Added/updated'} account: ${username}`);
    printAccounts(updated, args.includes('--verbose'));
    if (shouldSync(args)) {
      const syncStatus = syncCloudflare();
      if (syncStatus !== 0) process.exit(syncStatus);
      if (shouldDeploy(args)) process.exit(deployCloudflare());
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
    printAccounts(updated, args.includes('--verbose'));
    if (shouldSync(args)) {
      const syncStatus = syncCloudflare();
      if (syncStatus !== 0) process.exit(syncStatus);
      if (shouldDeploy(args)) process.exit(deployCloudflare());
    }
    return;
  }

  console.error(`Unknown command: ${rawCommand}`);
  usage();
  process.exit(1);
}

main();
