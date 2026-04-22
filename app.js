/**
 * Tesla HK Route Planner - Optimized Logic
 */

let map, ds, drGo, drBack;
let returnMode = false;

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
    const opt = { 
        componentRestrictions: { country: "hk" },
        fields: ["formatted_address", "geometry", "name"]
    };

    const startInp = document.getElementById('start-node');
    const endInp = document.getElementById('end-node');

    try {
        const acStart = new google.maps.places.Autocomplete(startInp, opt);
        const acEnd = new google.maps.places.Autocomplete(endInp, opt);

        acStart.addListener('place_changed', onAddressChange);
        acEnd.addListener('place_changed', onAddressChange);
    } catch (e) {
        console.error("Google Places Error:", e);
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

/**
 * 強力清空函數：確保 UI 與數據同步
 */
function clearInput(id) {
    const inputElement = document.getElementById(id);
    if (!inputElement) return;

    // 1. 直接清空值
    inputElement.value = '';

    // 2. 觸發輸入事件，確保 CSS 的 "X" 按鈕能正確隱藏
    inputElement.dispatchEvent(new Event('input'));

    // 3. 重新聚焦，方便用戶再次打字
    inputElement.focus();

    // 4. 重置地圖數據與隧道選擇
    // 如果起點或終點任何一個被清空，重置地圖與隧道按鈕
    smartFilterTunnels(); 
    
    // 5. 如果你想清空後立即重置數據顯示，可以取消下面這行註釋
    // updateUI(0, 0); 
}

function smartFilterTunnels() {
    const start = document.getElementById('start-node').value.toLowerCase();
    const end = document.getElementById('end-node').value.toLowerCase();
    
    if (start.length < 2 && end.length < 2) {
        document.querySelectorAll('.t-btn').forEach(b => b.classList.remove('visible', 'active'));
        return;
    }

    const combined = start + " " + end;
    const isIslandTrip = combined.includes('island') || combined.includes('central') || 
                         combined.includes('wan chai') || combined.includes('causeway bay');

    const filterGrid = (gridId) => {
        document.querySelectorAll(`#${gridId} .t-btn`).forEach(btn => {
            const data = TUNNEL_DATA.find(d => d.loc === btn.getAttribute('data-loc'));
            const matchTerms = data.match.toLowerCase().split('|');
            const isMatched = matchTerms.some(term => combined.includes(term));
            
            if (isMatched || (isIslandTrip && data.type === 'cross')) {
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
    if (!data) return 0;
    if (data.toll === "h") {
        const h = new Date().getHours();
        if ((h >= 7 && h < 10) || (h >= 17 && h < 19)) return 60;
        if (h >= 10 && h < 17) return 40;
        return 20;
    }
    return data.toll;
}

async function calculate() {
    const start = document.getElementById('start-node').value;
    const end = document.getElementById('end-node').value;
    if (start.length < 3 || end.length < 3) return;

    if (!map) {
        map = new google.maps.Map(document.getElementById('map'), { 
            zoom: 12, 
            disableDefaultUI: true, 
            styles: [{stylers:[{invert_lightness:true}]}] 
        });
        drGo.setMap(map);
        drBack.setMap(map);
        document.getElementById('map').style.display = 'block';
    }

    let totalToll = 0, totalKm = 0;

    // 去程計算
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
        }
    });
}

function updateUI(km, toll) {
    const energy = km * 0.157 * 2.1;
    document.getElementById('km').innerText = km.toFixed(1) + " km";
    document.getElementById('t-fee').innerText = "$" + toll;
    document.getElementById('e-cost').innerText = "$" + energy.toFixed(1);
    document.getElementById('total').innerText = (energy + toll).toFixed(1);
	document.getElementById('map').style.display = 'none';
}