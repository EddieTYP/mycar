const fs = require('node:fs');

function parseEnvLines(text) {
  return String(text).split(/\r?\n/);
}

function readAccountsFromEnvFile(envPath) {
  const text = fs.readFileSync(envPath, 'utf8');
  const line = parseEnvLines(text).find((entry) => entry.startsWith('AUTH_ACCOUNTS_JSON='));
  if (!line) return {};
  const raw = line.slice('AUTH_ACCOUNTS_JSON='.length).trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function serializeAccounts(accounts) {
  return JSON.stringify(Object.fromEntries(Object.entries(accounts).sort(([a], [b]) => a.localeCompare(b))));
}

function writeAccountsToEnvFile(envPath, accounts) {
  const text = fs.readFileSync(envPath, 'utf8');
  const lines = parseEnvLines(text).filter((line, idx, arr) => !(idx === arr.length - 1 && line === ''));
  const accountLine = `AUTH_ACCOUNTS_JSON=${serializeAccounts(accounts)}`;
  const index = lines.findIndex((line) => line.startsWith('AUTH_ACCOUNTS_JSON='));
  if (index >= 0) lines[index] = accountLine;
  else lines.push(accountLine);
  fs.writeFileSync(envPath, `${lines.join('\n')}\n`);
}

function upsertAccount(envPath, username, password) {
  const accounts = readAccountsFromEnvFile(envPath);
  accounts[String(username).trim()] = String(password);
  writeAccountsToEnvFile(envPath, accounts);
  return readAccountsFromEnvFile(envPath);
}

function deleteAccount(envPath, username) {
  const accounts = readAccountsFromEnvFile(envPath);
  delete accounts[String(username).trim()];
  writeAccountsToEnvFile(envPath, accounts);
  return readAccountsFromEnvFile(envPath);
}

module.exports = {
  readAccountsFromEnvFile,
  writeAccountsToEnvFile,
  upsertAccount,
  deleteAccount,
};
