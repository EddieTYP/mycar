const crypto = require('node:crypto');

function parseCookies(header = '') {
  return String(header)
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const idx = part.indexOf('=');
      if (idx === -1) return acc;
      const key = part.slice(0, idx).trim();
      const value = part.slice(idx + 1).trim();
      if (key) acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function createSessionValue(username, secret) {
  const payload = Buffer.from(JSON.stringify({ username }), 'utf8').toString('base64url');
  const signature = sign(payload, secret);
  return `${payload}.${signature}`;
}

function verifySessionValue(value, secret) {
  if (!value || !secret) return null;
  const [payload, signature] = String(value).split('.');
  if (!payload || !signature) return null;
  const expected = sign(payload, secret);
  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const json = Buffer.from(payload, 'base64url').toString('utf8');
    const data = JSON.parse(json);
    if (!data || typeof data.username !== 'string' || !data.username.trim()) return null;
    return data;
  } catch {
    return null;
  }
}

function getAuthAccounts(env = process.env) {
  const raw = String(env.AUTH_ACCOUNTS_JSON || '').trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return Object.fromEntries(
          Object.entries(parsed)
            .map(([username, password]) => [String(username).trim(), String(password)])
            .filter(([username, password]) => username && password)
        );
      }
    } catch {
      return {};
    }
  }

  const username = String(env.AUTH_USERNAME || '').trim();
  const password = String(env.AUTH_PASSWORD || '');
  if (!username || !password) return {};
  return { [username]: password };
}

function getAuthConfig(env = process.env) {
  return {
    accounts: getAuthAccounts(env),
    sessionSecret: String(env.SESSION_SECRET || '').trim(),
  };
}

module.exports = {
  parseCookies,
  createSessionValue,
  verifySessionValue,
  getAuthAccounts,
  getAuthConfig,
};
