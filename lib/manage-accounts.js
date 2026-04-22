function normalizeCommand(command) {
  return command === 'set-password' ? 'add' : command;
}

function shouldSync(args) {
  return !args.includes('--no-sync');
}

function shouldDeploy(args) {
  return shouldSync(args) && !args.includes('--no-deploy');
}

function formatAccountRows(localAccounts, cloudflareAccounts = null) {
  const names = Object.keys(localAccounts || {}).sort();
  if (!names.length) return ['No accounts configured.'];
  const rows = ['Configured accounts:'];
  for (const name of names) {
    if (!cloudflareAccounts) {
      rows.push(`- ${name}`);
      continue;
    }
    const status = Object.prototype.hasOwnProperty.call(cloudflareAccounts, name)
      ? 'local+cloudflare'
      : 'local-only';
    rows.push(`- ${name} [${status}]`);
  }
  return rows;
}

module.exports = {
  normalizeCommand,
  shouldSync,
  shouldDeploy,
  formatAccountRows,
};
