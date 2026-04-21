/**
 * Tesla HK Route Planner - Logic
 */

let map, ds, drGo, drBack;
let returnMode = false;

// 隧道數據庫 (可根據 PRD 隨時擴展)
const TUNNEL_DATA = [
    { id: "whc", name: "西隧", loc: "Western Harbour Crossing", match: "Island|Central|West", type: "cross", toll: "h" },
    { id: "cht", name: "紅隧", loc: "Cross-Harbour Tunnel", match: "Island|Kowloon|Central", type: "cross", toll: "h" },
    { id: "ehc", name: "東隧", loc: "Eastern Harbour Crossing", match: "Island|East|Kwun Tong", type: "cross", toll: "h" },
    { id: "tlt", name: "大欖", loc: "Tai Lam Tunnel", match: "Yuen Long|Tuen Mun|Tin Shui Wai|NT", type: "hill", toll: 58 },
    { id: "lrt", name: "獅子山", loc: "Lion Rock Tunnel", match: "Sha Tin|Tai Po|Fanling|Kowloon", type: "hill", toll: 8 },
    { id: "ent", name: "尖山", loc: "Eagle's Nest Tunnel", match: "Sha Tin|Kowloon|West", type: "hill", toll: 8 },
    { id: "tpr", name: "大埔道", loc: "Tai Po Road Piper's Hill", match: "Sha Tin|Tai Po|Sham Shui Po", type: "hill", toll: 0 }
];

function initApp() {
    // 初始化 Autocomplete
    const opt = { componentRestrictions: { country: "hk" } };
    const acStart = new google.maps.places.Autocomplete(document.getElementById('start-node'), opt);
    const acEnd = new google.maps.places.Autocomplete(document.getElementById('end-node'), opt);

    acStart.addListener('place_changed', onAddressChange);
    acEnd.addListener('place_changed', onAddressChange);

    // 初始化地圖服務
    ds = new google.maps.DirectionsService();
    drGo = new google.maps.DirectionsRenderer({ polylineOptions: { strokeColor: "#e3193f", strokeWeight: 6 } });
    drBack = new google.maps.DirectionsRenderer({ polylineOptions: { strokeColor: "#00aaff", strokeWeight: 4 } });

    // 渲染隧道按鈕
    renderTunnelButtons('goTunnels');
    renderTunnelButtons('backTunnels');
}

function renderTunnelButtons(containerId) {
    const container = document.getElementById(containerId);
    TUNNEL_DATA.forEach(t => {
        const div = document.createElement('div');
        div.className = 't-btn';
        div.innerText = t.name;
        div.setAttribute('data-loc', t.loc);
        div.setAttribute('data-match', t.match);
        div.onclick = function() {
            this.classList.toggle('active');
            calculate();
        };
        container.appendChild(div);
    });
}

function onAddressChange() {
    smartFilterTunnels();
    calculate();
}

function smartFilterTunnels() {
    const start = document.getElementById('start-node').value.toLowerCase();
    const end = document.getElementById('end-node').value.toLowerCase();
    if (!start || !end) return;

    const combined = start + " " + end;
    const isIslandTrip = (start.includes('island') || start.includes('central') || start.includes('wan chai')) ||
                         (end.includes('island') || end.includes('central') || end.includes('wan chai'));

    const filterGrid = (gridId) => {
        const btns = document.querySelectorAll(`#${gridId} .t-btn`);
        btns.forEach(btn => {
            const matchTerms = btn.getAttribute('data-match').toLowerCase().split('|');
            const isMatched = matchTerms.some(term => combined.includes(term));
            
            // 如果涉及港島，顯示過海隧道
            const isCrossTunnel = TUNNEL_DATA.find(d => d.loc === btn.getAttribute('data-loc')).type === 'cross';
            
            if (isMatched || (isIslandTrip && isCrossTunnel)) {
                btn.classList.add('visible');
            } else {
                btn.classList.remove('visible', 'active');
            }
        });
    };

    filterGrid('goTunnels');
    if (returnMode) filterGrid('backTunnels');
}

function toggleReturn() {
    returnMode = !returnMode;
    document.getElementById('retBtn').classList.toggle('active-blue', returnMode);
    document.getElementById('backTunnelSection').style.display = returnMode ? 'block' : 'none';
    smartFilterTunnels();
    calculate();
}

function getToll(loc) {
    const data = TUNNEL_DATA.find(d => d.loc === loc);
    if (!data) return 0;
    if (data.toll === "h") {
        const h = new Date().getHours();
        if ((h >= 7 && h < 10) || (h >= 17 && h < 19)) return 60; // 繁忙
        if (h >= 10 && h < 17) return 40; // 一般
        return 20; // 非繁忙
    }
    return data.toll;
}

async function calculate() {
    const start = document.getElementById('start-node').value;
    const end = document.getElementById('end-node').value;
    if (!start || !end) return;

    if (!map) {
        map = new google.maps.Map(document.getElementById('map'), { zoom: 12, disableDefaultUI: true, styles: [{stylers:[{invert_lightness:true}]}] });
        drGo.setMap(map);
        drBack.setMap(map);
        document.getElementById('map').style.display = 'block';
    }

    let totalToll = 0, totalKm = 0;

    // 處理去程
    const goWays = Array.from(document.querySelectorAll('#goTunnels .active')).map(b => {
        totalToll += getToll(b.getAttribute('data-loc'));
        return { location: b.getAttribute('data-loc'), stopover: false };
    });

    ds.route({ origin: start, destination: end, waypoints: goWays, travelMode: 'DRIVING' }, (res, stat) => {
        if (stat === 'OK') {
            drGo.setDirections(res);
            totalKm += res.routes[0].legs.reduce((acc, l) => acc + l.distance.value, 0) / 1000;
            
            // 處理回程 (嵌套在回調中以確保同步累加)
            if (returnMode) {
                const backWays = Array.from(document.querySelectorAll('#backTunnels .active')).map(b => {
                    totalToll += getToll(b.getAttribute('data-loc'));
                    return { location: b.getAttribute('data-loc'), stopover: false };
                });
                ds.route({ origin: end, destination: start, waypoints: backWays, travelMode: 'DRIVING' }, (resB, statB) => {
                    if (statB === 'OK') {
                        drBack.setDirections(resB);
                        totalKm += resB.routes[0].legs.reduce((acc, l) => acc + l.distance.value, 0) / 1000;
                        updateUI(totalKm, totalToll);
                    }
                });
            } else {
                drBack.setDirections({routes: []});
                updateUI(totalKm, totalToll);
            }
        }
    });
}

function updateUI(km, toll) {
    const energy = km * 0.157 * 2.1; // Tesla M3/Y Average
    document.getElementById('km').innerText = km.toFixed(1) + " km";
    document.getElementById('t-fee').innerText = "$" + toll;
    document.getElementById('e-cost').innerText = "$" + energy.toFixed(1);
    document.getElementById('total').innerText = (energy + toll).toFixed(1);
}