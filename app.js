/**
 * Tesla HK Route Planner - Ultimate Stable Version
 */

let map, ds, drGo, drBack;
let returnMode = false;

// 隧道配置數據
const TUNNEL_DATA = [
    { id: "whc", name: "西隧", loc: "Western Harbour Crossing", match: "Island|Central|West", type: "cross", toll: "h" },
    { id: "cht", name: "紅隧", loc: "Cross-Harbour Tunnel", match: "Island|Kowloon|Central", type: "cross", toll: "h" },
    { id: "ehc", name: "東隧", loc: "Eastern Harbour Crossing", match: "Island|East|Kwun Tong", type: "cross", toll: "h" },
    { id: "tlt", name: "大欖", loc: "Tai Lam Tunnel", match: "Yuen Long|Tuen Mun|Tin Shui Wai|NT", type: "hill", toll: 58 },
    { id: "lrt", name: "獅子山", loc: "Lion Rock Tunnel", match: "Sha Tin|Tai Po|Fanling|Kowloon", type: "hill", toll: 8 },
    { id: "ent", name: "尖山", loc: "Eagle's Nest Tunnel", match: "Sha Tin|Kowloon|West", type: "hill", toll: 8 },
    { id: "tpr", name: "大埔道", loc: "Tai Po Road Piper's Hill", match: "Sha Tin|Tai Po|Sham Shui Po", type: "hill", toll: 0 }
];

/**
 * 全域清空函數
 */
function clearInput(id) {
    const el = document.getElementById(id);
    if (el) {
        el.value = '';
        el.focus();
        smartFilterTunnels();
        if (drGo) drGo.setDirections({routes: []});
        if (drBack) drBack.setDirections({routes: []});
    }
}

/**
 * 初始化 API 服務
 */
function initApp() {
    console.log("Initializing Tesla Route Planner...");
    const opt = { componentRestrictions: { country: "hk" }, fields: ["formatted_address", "geometry", "name"] };
    
    try {
        const acStart = new google.maps.places.Autocomplete(document.getElementById('start-node'), opt);
        const acEnd = new google.maps.places.Autocomplete(document.getElementById('end-node'), opt);
        acStart.addListener('place_changed', onAddressChange);
        acEnd.addListener('place_changed', onAddressChange);
    } catch (e) {
        console.warn("Autocomplete Init Error:", e);
    }

    ds = new google.maps.DirectionsService();
    drGo = new google.maps.DirectionsRenderer({ polylineOptions: { strokeColor: "#e3193f", strokeWeight: 6 } });
    drBack = new google.maps.DirectionsRenderer({ polylineOptions: { strokeColor: "#00aaff", strokeWeight: 4 } });

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
    const combined = start + " " + end;
    
    const filterGrid = (gridId) => {
        document.querySelectorAll(`#${gridId} .t-btn`).forEach(btn => {
            const data = TUNNEL_DATA.find(d => d.loc === btn.getAttribute('data-loc'));
            const isMatched = data.match.toLowerCase().split('|').some(term => combined.includes(term));
            const isIsland = combined.includes('island') || combined.includes('central') || combined.includes('bay');
            
            if (isMatched || (isIsland && data.type === 'cross')) {
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
    document.getElementById('backTunnelSection').classList.toggle('hidden-section', !returnMode);
    smartFilterTunnels();
    calculate();
}

function getToll(loc) {
    const data = TUNNEL_DATA.find(d => d.loc === loc);
    if (data && data.toll === "h") {
        const h = new Date().getHours();
        if ((h >= 7 && h < 10) || (h >= 17 && h < 19)) return 60;
        if (h >= 10 && h < 17) return 40;
        return 20;
    }
    return data ? data.toll : 0;
}

/**
 * 核心計算與地圖繪製
 */
async function calculate() {
    const start = document.getElementById('start-node').value;
    const end = document.getElementById('end-node').value;
    
    if (start.length < 3 || end.length < 3) return;

    // 建立地圖實例 (只建立一次)
    if (!map) {
        map = new google.maps.Map(document.getElementById('map'), { 
            zoom: 12, 
            center: { lat: 22.3442, lng: 114.1228 }, 
            disableDefaultUI: true, 
            styles: [{stylers:[{invert_lightness:true}]}] 
        });
        drGo.setMap(map);
        drBack.setMap(map);
    }

    let totalToll = 0, totalKm = 0;

    const goWays = Array.from(document.querySelectorAll('#goTunnels .active')).map(b => {
        totalToll += getToll(b.getAttribute('data-loc'));
        return { location: b.getAttribute('data-loc'), stopover: false };
    });

    ds.route({ origin: start, destination: end, waypoints: goWays, travelMode: 'DRIVING' }, (res, stat) => {
        if (stat === 'OK') {
            drGo.setDirections(res);
            totalKm += res.routes[0].legs.reduce((acc, l) => acc + l.distance.value, 0) / 1000;
            
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
            // 觸發地圖重新調整，確保地圖顯示正常
            google.maps.event.trigger(map, 'resize');
        }
    });
}

function updateUI(km, toll) {
    const energy = km * 0.157 * 2.1;
    document.getElementById('km').innerText = km.toFixed(1) + " km";
    document.getElementById('t-fee').innerText = "$" + toll;
    document.getElementById('e-cost').innerText = "$" + energy.toFixed(1);
    document.getElementById('total').innerText = (energy + toll).toFixed(1);
}