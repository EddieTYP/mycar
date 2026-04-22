/**
 * Tesla HK Route Planner - Full Optimized Logic
 * Version: 2026.04.22
 */

let map, ds, drGo, drBack;
let returnMode = false;

// 隧道數據配置
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
 * 1. 全域清空函數 (放在最頂層確保 HTML 呼叫成功)
 */
function clearInput(id) {
    const inputElement = document.getElementById(id);
    if (inputElement) {
        inputElement.value = '';
        inputElement.focus();
        // 觸發智能過濾重置
        smartFilterTunnels();
        // 如果地圖已存在，嘗試清空路徑
        if (drGo) drGo.setDirections({routes: []});
        if (drBack) drBack.setDirections({routes: []});
    }
}

/**
 * 2. 初始化 Google Maps 服務
 */
function initApp() {
    console.log("Google Maps API Initializing...");
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
        console.error("Autocomplete Error:", e);
    }

    ds = new google.maps.DirectionsService();
    drGo = new google.maps.DirectionsRenderer({ polylineOptions: { strokeColor: "#e3193f", strokeWeight: 6 } });
    drBack = new google.maps.DirectionsRenderer({ polylineOptions: { strokeColor: "#00aaff", strokeWeight: 4 } });

    renderTunnelButtons('goTunnels');
    renderTunnelButtons('backTunnels');
}

/**
 * 3. 渲染隧道按鈕
 */
function renderTunnelButtons(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
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
 * 4. 智能過濾邏輯
 */
function smartFilterTunnels() {
    const start = document.getElementById('start-node').value.toLowerCase();
    const end = document.getElementById('end-node').value.toLowerCase();
    
    if (start.length < 2 && end.length < 2) {
        document.querySelectorAll('.t-btn').forEach(b => b.classList.remove('visible', 'active'));
        return;
    }

    const combined = start + " " + end;
    const isIslandTrip = combined.includes('island') || combined.includes('central') || 
                         combined.includes('wan chai') || combined.includes('causeway bay') || 
                         combined.includes('victoria');

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

/**
 * 5. 核心計算與地圖渲染
 */
async function calculate() {
    const start = document.getElementById('start-node').value;
    const end = document.getElementById('end-node').value;
    
    // 檢查輸入長度
    if (start.length < 3 || end.length < 3) return;

    // 確保地圖容器高度並初始化
    const mapDiv = document.getElementById('map');
    if (mapDiv.style.display === 'none' || !mapDiv.style.display) {
        mapDiv.style.display = 'block';
    }

    if (!map) {
        console.log("Map Object Creating...");
        map = new google.maps.Map(mapDiv, { 
            zoom: 12, 
            center: { lat: 22.3442, lng: 114.1228 }, // 香港葵青附近作中心點
            disableDefaultUI: true, 
            styles: [{stylers:[{invert_lightness:true}]}] // 模擬黑魂模式
        });
        drGo.setMap(map);
        drBack.setMap(map);
    }

    let totalToll = 0, totalKm = 0;

    // 去程計算
    const goWays = Array.from(document.querySelectorAll('#goTunnels .active')).map(b => {
        totalToll += getToll(b.getAttribute('data-loc'));
        return { location: b.getAttribute('data-loc'), stopover: false };
    });

    ds.route({ 
        origin: start, 
        destination: end, 
        waypoints: goWays, 
        travelMode: 'DRIVING',
        optimizeWaypoints: false 
    }, (res, stat) => {
        if (stat === 'OK') {
            drGo.setDirections(res);
            totalKm += res.routes[0].legs.reduce((acc, l) => acc + l.distance.value, 0) / 1000;
            
            if (returnMode) {
                const backWays = Array.from(document.querySelectorAll('#backTunnels .active')).map(b => {
                    totalToll += getToll(b.getAttribute('data-loc'));
                    return { location: b.getAttribute('data-loc'), stopover: false };
                });
                ds.route({ 
                    origin: end, 
                    destination: start, 
                    waypoints: backWays, 
                    travelMode: 'DRIVING' 
                }, (resB, statB) => {
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
        } else {
            console.error("Directions Request Failed: " + stat);
        }
    });
}

/**
 * 6. 更新數據 UI
 */
function updateUI(km, toll) {
    // 假設 Tesla 每公里耗電 0.157 kWh，超充每度電 $2.1
    const energy = km * 0.157 * 2.1;
    
    document.getElementById('km').innerText = km.toFixed(1) + " km";
    document.getElementById('t-fee').innerText = "$" + toll;
    document.getElementById('e-cost').innerText = "$" + energy.toFixed(1);
    
    // 平滑動畫數字更新
    const totalEl = document.getElementById('total');
    totalEl.innerText = (energy + toll).toFixed(1);
}