let map, ds, drGo, drBack, trafficLayer;
let returnMode = false;
const acOptions = { componentRestrictions: { country: "hk" }, fields: ["formatted_address", "geometry", "name"] };

const TUNNEL_DATA = [
    { id: "whc", name: "西隧", loc: "Western Harbour Crossing", match: "Island|Central|West|香港|中環|西環", type: "cross", toll: "h" },
    { id: "cht", name: "紅隧", loc: "Cross-Harbour Tunnel", match: "Island|Kowloon|Central|香港|尖沙咀|灣仔", type: "cross", toll: "h" },
    { id: "ehc", name: "東隧", loc: "Eastern Harbour Crossing", match: "Island|East|Kwun Tong|香港|觀塘|鰂魚涌", type: "cross", toll: "h" },
    { id: "tlt", name: "大欖", loc: "Tai Lam Tunnel", match: "Yuen Long|Tuen Mun|NT|元朗|屯門|天水圍", type: "hill", toll: 58 },
    { id: "lrt", name: "獅子山", loc: "Lion Rock Tunnel", match: "Sha Tin|Tai Po|Kowloon|沙田|大埔|九龍", type: "hill", toll: 8 },
    { id: "ent", name: "尖山", loc: "Eagle's Nest Tunnel", match: "Sha Tin|Kowloon|West|沙田|長沙灣|荔枝角", type: "hill", toll: 8 },
    { id: "tpr", name: "大埔道", loc: "Tai Po Road Piper's Hill", match: "Sha Tin|Tai Po|Sham Shui Po|大埔道", type: "hill", toll: 0 }
];

function initApp() {
    ds = new google.maps.DirectionsService();
    drGo = new google.maps.DirectionsRenderer({ polylineOptions: { strokeColor: "#e3193f", strokeWeight: 6 } });
    drBack = new google.maps.DirectionsRenderer({ polylineOptions: { strokeColor: "#00aaff", strokeWeight: 4 } });

    document.querySelectorAll('.node-input').forEach(bindAutocomplete);
    renderTunnelButtons('goTunnels');
    renderTunnelButtons('backTunnels');
}

function bindAutocomplete(inp) {
    const ac = new google.maps.places.Autocomplete(inp, acOptions);
    ac.addListener('place_changed', () => { smartFilterTunnels(); calculate(); });
}

function addNode() {
    const container = document.getElementById('nodes-container');
    const div = document.createElement('div');
    div.className = 'input-wrapper node-item';
    div.innerHTML = `<input class="node-input" placeholder="中途站" autocomplete="off"><span class="clear-btn" onclick="removeNode(this)">✕</span>`;
    container.insertBefore(div, container.lastElementChild);
    bindAutocomplete(div.querySelector('.node-input'));
}

function removeNode(btn) {
    const container = document.getElementById('nodes-container');
    if (container.querySelectorAll('.node-item').length > 2) {
        btn.parentElement.remove();
        calculate();
    } else {
        btn.parentElement.querySelector('input').value = '';
        document.getElementById('map').style.display = 'none';
        updateUI(0, 0, 0);
    }
}

function renderTunnelButtons(containerId) {
    const container = document.getElementById(containerId);
    TUNNEL_DATA.forEach(t => {
        const div = document.createElement('div');
        div.className = 't-btn';
        div.innerText = t.name;
        div.setAttribute('data-loc', t.loc);
        div.onclick = function() { this.classList.toggle('active'); calculate(); };
        container.appendChild(div);
    });
}

function smartFilterTunnels() {
    const showAll = document.getElementById('show-all-tunnels').checked;
    const inputs = document.querySelectorAll('.node-input');
    const combined = Array.from(inputs).map(i => i.value.toLowerCase()).join(" ");
    
    const filterGrid = (gridId) => {
        document.querySelectorAll(`#${gridId} .t-btn`).forEach(btn => {
            const data = TUNNEL_DATA.find(d => d.loc === btn.getAttribute('data-loc'));
            if (showAll) {
                btn.classList.add('visible');
            } else {
                const isMatched = data.match.toLowerCase().split('|').some(term => combined.includes(term));
                const isIsland = combined.includes('island') || combined.includes('香港') || combined.includes('central') || combined.includes('灣仔');
                if (isMatched || (isIsland && data.type === 'cross')) btn.classList.add('visible');
                else btn.classList.remove('visible', 'active');
            }
        });
    };
    filterGrid('goTunnels');
    if (returnMode) filterGrid('backTunnels');
    if (document.getElementById('map').style.display === 'block') calculate();
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

async function calculate() {
    const inputs = document.querySelectorAll('.node-input');
    const locs = Array.from(inputs).map(i => i.value).filter(v => v.length > 3);
    if (locs.length < 2) return;

    const mapDiv = document.getElementById('map');
    if (!map) {
        map = new google.maps.Map(mapDiv, { zoom: 12, center: { lat: 22.3442, lng: 114.1228 }, disableDefaultUI: true, styles: [{stylers:[{invert_lightness:true}]}] });
        trafficLayer = new google.maps.TrafficLayer(); trafficLayer.setMap(map);
        drGo.setMap(map); drBack.setMap(map);
    }

    let totalToll = 0, totalKm = 0, totalSec = 0;
    const tunnelWays = Array.from(document.querySelectorAll('#goTunnels .active')).map(b => {
        totalToll += getToll(b.getAttribute('data-loc'));
        return { location: b.getAttribute('data-loc'), stopover: false };
    });

    const stagingWays = locs.slice(1, -1).map(p => ({ location: p, stopover: true }));
    const finalWays = [...tunnelWays, ...stagingWays];

    ds.route({ 
        origin: locs[0], destination: locs[locs.length-1], waypoints: finalWays, 
        travelMode: 'DRIVING', drivingOptions: { departureTime: new Date(), trafficModel: 'bestguess' }
    }, (res, stat) => {
        if (stat === 'OK') {
            mapDiv.style.display = 'block'; google.maps.event.trigger(map, 'resize');
            drGo.setDirections(res);
            totalKm += res.routes[0].legs.reduce((acc, l) => acc + l.distance.value, 0) / 1000;
            totalSec += res.routes[0].legs.reduce((acc, l) => acc + (l.duration_in_traffic ? l.duration_in_traffic.value : l.duration.value), 0);
            
            if (returnMode) {
                const backTunnelWays = Array.from(document.querySelectorAll('#backTunnels .active')).map(b => {
                    totalToll += getToll(b.getAttribute('data-loc'));
                    return { location: b.getAttribute('data-loc'), stopover: false };
                });
                const backLocs = [...locs].reverse();
                const backStaging = backLocs.slice(1, -1).map(p => ({ location: p, stopover: true }));
                ds.route({ origin: backLocs[0], destination: backLocs[backLocs.length-1], waypoints: [...backTunnelWays, ...backStaging], travelMode: 'DRIVING', drivingOptions: { departureTime: new Date() } }, (resB, statB) => {
                    if (statB === 'OK') {
                        drBack.setDirections(resB);
                        totalKm += resB.routes[0].legs.reduce((acc, l) => acc + l.distance.value, 0) / 1000;
                        totalSec += resB.routes[0].legs.reduce((acc, l) => acc + (l.duration_in_traffic ? l.duration_in_traffic.value : l.duration.value), 0);
                        updateUI(totalKm, totalToll, totalSec);
                    }
                });
            } else { updateUI(totalKm, totalToll, totalSec); }
        }
    });
}

function updateUI(km, toll, sec) {
    const carData = document.getElementById('car-model').value.split('|');
    const efficiency = parseFloat(carData[0]); 
    const rate = parseFloat(carData[1]);       
    
    const energy = km * efficiency * rate;
    document.getElementById('km').innerText = km.toFixed(1) + " km";
    document.getElementById('duration').innerText = Math.round(sec / 60) + " min";
    document.getElementById('t-fee').innerText = "$" + toll;
    document.getElementById('e-cost').innerText = "$" + energy.toFixed(1);
    document.getElementById('total').innerText = (energy + toll).toFixed(1);
}