async function postJson(url, payload) {
  const res = await fetch(apiUrl(url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({ ok: false, error: 'Unexpected server response' }));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || 'Login failed');
  }
  return data;
}

function setStatus(message) {
  const el = document.getElementById('login-status');
  el.textContent = message;
  el.className = 'status-message error';
}

function clearStatus() {
  const el = document.getElementById('login-status');
  el.textContent = '';
  el.className = 'status-message hidden';
}

document.getElementById('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearStatus();

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  try {
    await postJson('/api/login', { username, password });
    window.location.assign('/');
  } catch (err) {
    setStatus(err.message || 'Login failed');
  }
});
