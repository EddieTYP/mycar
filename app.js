let returnMode = false;

const TUNNEL_DATA = [
  { id: "whc", name: "西隧", loc: "Western Harbour Crossing", match: "Island|Central|West|香港|中環|西環", type: "cross", toll: "h" },
  { id: "cht", name: "紅隧", loc: "Cross-Harbour Tunnel", match: "Island|Kowloon|Central|香港|尖沙咀|灣仔", type: "cross", toll: "h" },
  { id: "ehc", name: "東隧", loc: "Eastern Harbour Crossing", match: "Island|East|Kwun Tong|香港|觀塘|鰂魚涌", type: "cross", toll: "h" },
  { id: "tlt", name: "大欖", loc: "Tai Lam Tunnel", match: "Yuen Long|Tuen Mun|NT|元朗|屯門|天水圍", type: "hill", toll: "tlt" },
  { id: "lrt", name: "獅子山", loc: "Lion Rock Tunnel", match: "Sha Tin|Tai Po|Kowloon|沙田|大埔|九龍", type: "hill", toll: 8 },
  { id: "ent", name: "尖山", loc: "Eagle's Nest Tunnel", match: "Sha Tin|Kowloon|West|沙田|長沙灣|荔枝角", type: "hill", toll: 8 },
  { id: "tpr", name: "大埔道", loc: "Tai Po Road Piper's Hill", match: "Sha Tin|Tai Po|Sham Shui Po|大埔道", type: "hill", toll: 0 }
];

function redirectToLogin() {
  window.location.assign('/login.html');
}

async function apiFetchJson(resource, options = {}) {
  const res = await fetch(resource, options);
  if (res.status === 401) {
    redirectToLogin();
    throw new Error('Login required');
  }

  const data = await res.json().catch(() => ({ ok: false, error: 'Unexpected server response' }));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

async function initApp() {
  try {
    const session = await apiFetchJson('/api/session');
    document.getElementById('session-user').textContent = session.username;
  } catch (err) {
    if (err.message !== 'Login required') {
      setStatus(err.message || 'Unable to load session');
    }
    return;
  }

  const now = new Date();
  document.getElementById('start-time').value = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  document.querySelectorAll('.node-input').forEach(attachInputLogic);
  document.querySelectorAll('.setting-input').forEach((el) => {
    el.addEventListener('change', calculate);
  });
  document.getElementById('start-time').addEventListener('change', calculate);
  document.getElementById('logout-btn').addEventListener('click', logout);
  renderTunnelButtons('goTunnels');
  renderTunnelButtons('backTunnels');
  calculate();
}

async function logout() {
  try {
    await fetch('/api/logout', { method: 'POST' });
  } finally {
    redirectToLogin();
  }
}

function attachInputLogic(input) {
  const wrapper = input.parentElement;
  if (!wrapper || wrapper.querySelector('.suggestions')) {
    return;
  }

  const container = document.createElement('div');
  container.className = 'suggestions hidden';
  wrapper.appendChild(container);

  let timer;
  let queryId = 0;

  input.addEventListener('input', () => {
    const query = input.value.trim();
    const valueId = ++queryId;

    if (query.length < 3) {
      hideSuggestions(container);
      return;
    }

    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (queryId !== valueId) return;
      await loadSuggestions(input, container, query);
    }, 400);
  });

  input.addEventListener('focus', () => {
    if (container.children.length > 0 && input.value.trim().length >= 3) {
      container.classList.remove('hidden');
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(() => hideSuggestions(container), 180);
  });

  input.addEventListener('change', () => {
    hideSuggestions(container);
    smartFilterTunnels();
    calculate();
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      hideSuggestions(container);
      calculate();
    }
  });
}

async function loadSuggestions(input, container, query) {
  try {
    const queryParam = encodeURIComponent(query);
    const data = await apiFetchJson(`/api/geocode?q=${queryParam}`);
    renderSuggestionItems(input, container, data.results.slice(0, 5));
  } catch (err) {
    hideSuggestions(container);
  }
}

function renderSuggestionItems(input, container, items) {
  container.innerHTML = '';

  if (items.length === 0) {
    hideSuggestions(container);
    return;
  }

  items.forEach((item) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'suggestion-item';
    option.textContent = item.label;
    option.addEventListener('mousedown', (event) => {
      event.preventDefault();
      input.value = item.label;
      hideSuggestions(container);
      smartFilterTunnels();
      calculate();
    });

    container.appendChild(option);
  });

  container.classList.remove('hidden');
}

function hideSuggestions(container) {
  container.innerHTML = '';
  container.classList.add('hidden');
}

function addNode() {
  const container = document.getElementById('nodes-container');
  const div = document.createElement('div');
  div.className = 'input-group';
  div.innerHTML = '<input class="node-input" placeholder="中途站" autocomplete="off"><span class="clear-btn" onclick="removeNode(this)">✕</span>';
  container.insertBefore(div, container.lastElementChild);
  attachInputLogic(div.querySelector('.node-input'));
}

function removeNode(btn) {
  const container = document.getElementById('nodes-container');
  if (container.querySelectorAll('.input-group').length > 2) {
    btn.parentElement.remove();
    calculate();
  }
}

function renderTunnelButtons(containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  TUNNEL_DATA.forEach((t) => {
    const div = document.createElement('div');
    div.className = 't-btn';
    div.innerText = t.name;
    div.setAttribute('data-loc', t.loc);
    div.onclick = function () {
      this.classList.toggle('active');
      calculate();
    };
    container.appendChild(div);
  });

  smartFilterTunnels();
}

function smartFilterTunnels() {
  const showAll = document.getElementById('show-all-tunnels').checked;
  const inputs = document.querySelectorAll('.node-input');
  const combined = Array.from(inputs).map((i) => i.value.toLowerCase()).join(' ');

  const filterGrid = (gridId) => {
    document.querySelectorAll(`#${gridId} .t-btn`).forEach((btn) => {
      const data = TUNNEL_DATA.find((d) => d.loc === btn.getAttribute('data-loc'));
      if (!data) {
        return;
      }

      if (showAll) {
        btn.classList.add('visible');
        return;
      }

      const isMatched = data.match.toLowerCase().split('|').some((term) => combined.includes(term.toLowerCase()));
      if (isMatched) {
        btn.classList.add('visible');
      } else {
        btn.classList.remove('visible', 'active');
      }
    });
  };

  filterGrid('goTunnels');
  if (returnMode) {
    filterGrid('backTunnels');
  }
}

function getSelectedDepartureTime() {
  const timeVal = document.getElementById('start-time').value;
  const date = new Date();
  if (timeVal) {
    const [hrs, mins] = timeVal.split(':');
    date.setHours(parseInt(hrs, 10), parseInt(mins, 10), 0, 0);
  }
  return date;
}

function getToll(loc, targetDate) {
  const data = TUNNEL_DATA.find((d) => d.loc === loc);
  if (!data) {
    return 0;
  }

  const h = targetDate.getHours() + targetDate.getMinutes() / 60;

  if (data.toll === "h") {
    if ((h >= 8.13 && h < 10.25) || (h >= 16.96 && h < 19)) return (loc === "Western Harbour Crossing") ? 60 : 40;
    if (h >= 10.7 && h < 16.5) return 30;
    return 20;
  }

  if (data.toll === "tlt") {
    if ((h >= 7.68 && h < 9.75) || (h >= 17.48 && h < 19)) return 45;
    if (h >= 10 && h < 17.25) return 30;
    return 18;
  }

  return data.toll;
}

function toggleReturn() {
  returnMode = !returnMode;
  document.getElementById('retBtn').classList.toggle('active-blue', returnMode);
  document.getElementById('backTunnelSection').classList.toggle('hidden-section', !returnMode);
  calculate();
}

function getSelectedTunnelWaypoints(sectionId) {
  return Array.from(document.querySelectorAll(`#${sectionId} .active`)).map((btn) => btn.getAttribute('data-loc'));
}

function collectInputs() {
  const raw = Array.from(document.querySelectorAll('.node-input')).map((i) => i.value.trim());
  return raw.filter(Boolean);
}

function renderRouteSummary(goRoute, backRoute) {
  const mapDiv = document.getElementById('map');

  const formatKm = (km) => `${(km || 0).toFixed(1)} km`;
  const formatTime = (minutes) => `${Math.round(minutes || 0)} min`;

  mapDiv.innerHTML = `
    <div class="summary-title">路線摘要</div>
    <div class="route-summary-card">
      <div class="summary-header">
        <span>去程</span>
        <b>${goRoute.provider}</b>
      </div>
      <div class="summary-line">路徑: ${formatKm(goRoute.distanceKm)} · ${formatTime(goRoute.durationMinutes)}</div>
      <div class="summary-line muted">${goRoute.resolvedOrigin} → ${goRoute.resolvedDestination}</div>
      ${goRoute.warnings?.length ? `<div class="summary-line warning">${goRoute.warnings.join('；')}</div>` : ''}
    </div>
    ${backRoute ? `
      <div class="route-summary-card">
        <div class="summary-header">
          <span>回程</span>
          <b>${backRoute.provider}</b>
        </div>
        <div class="summary-line">路徑: ${formatKm(backRoute.distanceKm)} · ${formatTime(backRoute.durationMinutes)}</div>
        <div class="summary-line muted">${backRoute.resolvedOrigin} → ${backRoute.resolvedDestination}</div>
        ${backRoute.warnings?.length ? `<div class="summary-line warning">${backRoute.warnings.join('；')}</div>` : ''}
      </div>
    ` : ''}
  `;
}

function setStatus(message, type = 'error') {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = `status-message ${type}`;
}

function clearStatus() {
  const status = document.getElementById('status');
  status.textContent = '';
  status.className = 'status-message hidden';
}

async function requestRoute(params) {
  return apiFetchJson('/api/route', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
}

async function calculate() {
  const locs = collectInputs();
  if (locs.length < 2) {
    setStatus('請輸入起點和目的地');
    return;
  }

  clearStatus();

  const time = getSelectedDepartureTime();
  const middle = locs.slice(1, -1);
  const goTunnelWays = getSelectedTunnelWaypoints('goTunnels');
  const goToll = goTunnelWays.reduce((sum, loc) => sum + getToll(loc, time), 0);

  try {
    const goRoute = await requestRoute({
      origin: locs[0],
      destination: locs[locs.length - 1],
      waypoints: [...goTunnelWays, ...middle],
      departureTime: time.toISOString(),
    });

    let totalKm = Number(goRoute.distanceKm) || 0;
    let totalSec = Number(goRoute.durationMinutes) * 60 || 0;
    let totalToll = goToll;

    let backRoute = null;
    if (returnMode) {
      const reverseLocs = [...locs].reverse();
      const reverseMiddle = reverseLocs.slice(1, -1);
      const backTunnelWays = getSelectedTunnelWaypoints('backTunnels');
      const backToll = backTunnelWays.reduce((sum, loc) => sum + getToll(loc, new Date(time.getTime() + totalSec * 1000)), 0);
      totalToll += backToll;

      backRoute = await requestRoute({
        origin: reverseLocs[0],
        destination: reverseLocs[reverseLocs.length - 1],
        waypoints: [...backTunnelWays, ...reverseMiddle],
        departureTime: new Date(time.getTime() + totalSec * 1000).toISOString(),
      });

      totalKm += Number(backRoute.distanceKm) || 0;
      totalSec += Number(backRoute.durationMinutes) * 60 || 0;
    }

    updateUI(totalKm, totalToll, totalSec);
    renderRouteSummary(goRoute, backRoute);
  } catch (err) {
    setStatus(err.message || '無法完成路線估算');
  }
}

function updateUI(km, toll, sec) {
  const carData = document.getElementById('car-model').value.split('|');
  const energy = km * parseFloat(carData[0]) * parseFloat(carData[1]);

  document.getElementById('km').innerText = `${km.toFixed(1)} km`;
  document.getElementById('duration').innerText = `${Math.round(sec / 60)} min`;
  document.getElementById('t-fee').innerText = `$${toll}`;
  document.getElementById('e-cost').innerText = `$${energy.toFixed(1)}`;
  document.getElementById('total').innerText = (energy + toll).toFixed(1);
}

window.addEventListener('DOMContentLoaded', initApp);
