// --- LEAFLET & MAP SETUP ---
const map = L.map('map', { zoomControl: false, preferCanvas: true }).setView([39.8283, -98.5795], 4);
L.control.zoom({ position: 'bottomright' }).addTo(map);
// L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
//     maxZoom: 19,
//     attribution: '&copy; CARTO'
// }).addTo(map);
// Replace the CARTO tileLayer with standard OSM for testing:
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
}).addTo(map);//TEST


const searchableStations = [];
const searchInput = document.getElementById('station-search');
const resultsContainer = document.getElementById('search-results');
let activeStationPopup = null;

// --- TIDE WIDGET LOGIC ---
const TIDE_CONFIG = {
    app: 'WebGIS_Tide_App',
    base: 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'
};

function getNOAADateRange() {
    const now = new Date();
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    const format = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return { begin: format(yesterday), end: format(tomorrow) };
}

function parseNOAATime(timeStr) {
    if (!timeStr) return 0;
    const [datePart, timePart] = timeStr.split(' ');
    const [y, m, d] = datePart.split('-').map(Number);
    const [hr, min] = timePart.split(':').map(Number);
    return new Date(y, m - 1, d, hr, min).getTime();
}

async function getTideData(stationId, container) {
    const dates = getNOAADateRange();
    const common = `&time_zone=lst&units=english&datum=MLLW&format=json&application=${TIDE_CONFIG.app}`;
    const station = `&station=${stationId}`;

    const urls = {
        hilo: `${TIDE_CONFIG.base}?product=predictions&interval=hilo&begin_date=${dates.begin}&end_date=${dates.end}${station}${common}`,
        pred: `${TIDE_CONFIG.base}?product=predictions&begin_date=${dates.begin}&end_date=${dates.end}${station}${common}`,
        obs: `${TIDE_CONFIG.base}?product=water_level&begin_date=${dates.begin}&end_date=${dates.end}${station}${common}`
    };

    try {
        const [hRes, pRes, oRes] = await Promise.all([
            fetch(urls.hilo).then(r => r.json()),
            fetch(urls.pred).then(r => r.json()),
            fetch(urls.obs).then(r => r.json()).catch(() => ({ data: [] }))
        ]);

        for (const res of [hRes, pRes]) {
            if (res.error) throw new Error(res.error.message || `Failed to fetch prediction data for station ${stationId}`);
        }

        const nowMs = new Date().getTime();
        const twelveHoursMs = 12 * 60 * 60 * 1000;
        const startWindow = nowMs - twelveHoursMs;
        const endWindow = nowMs + twelveHoursMs;

        const filterToWindow = (dataArray) => (Array.isArray(dataArray) ? dataArray.filter(d => {
            const t = parseNOAATime(d.t);
            return t >= startWindow && t <= endWindow;
        }) : []);

        return {
            hilo: filterToWindow(hRes.predictions),
            pred: filterToWindow(pRes.predictions),
            obs: filterToWindow(oRes.data || []),
            window: { start: startWindow, end: endWindow, total: endWindow - startWindow }
        };
    } catch (e) {
        renderError(e.message, container.querySelector('.chart-container'));
        return null;
    }
}

function drawChart(data, container) {
    const { obs, pred, window } = data;
    if (!pred || pred.length < 2) {
        container.innerHTML = "<p style='text-align:center; padding-top:40px;'>No prediction data available.</p>";
        return;
    }

    const width = 370, height = 150, padL = 40, padB = 25, padT = 10, padR = 15;
    const drawW = width - padL - padR, drawH = height - padT - padB;
    const allVals = [...obs.map(d => parseFloat(d.v)), ...pred.map(d => parseFloat(d.v))];
    const min = Math.min(...allVals), max = Math.max(...allVals), range = (max - min) || 1;

    const mapToTimeline = (array) => array.map(d => ({
        x: ((parseNOAATime(d.t) - window.start) / window.total) * drawW + padL,
        y: drawH - ((parseFloat(d.v) - min) / range) * drawH + padT
    }));
    
    const obsPoints = mapToTimeline(obs);
    const predPoints = mapToTimeline(pred);

    const getPath = (p) => {
        if (!p.length) return "";
        let d = `M ${p[0].x} ${p[0].y}`;
        for (let i = 0; i < p.length - 1; i++) {
            const xc = (p[i].x + p[i + 1].x) / 2;
            const yc = (p[i].y + p[i + 1].y) / 2;
            d += ` Q ${p[i].x} ${p[i].y} ${xc} ${yc}`;
        }
        d += ` L ${p[p.length-1].x} ${p[p.length-1].y}`;
        return d;
    };

    container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
        ${[min, (min+max)/2, max].map(v => {
            const y = drawH - ((v - min) / range) * drawH + padT;
            return `<line class="grid-line" x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" /><text class="axis-label" x="${padL-5}" y="${y+3}" text-anchor="end">${v.toFixed(2)}</text>`;
        }).join('')}
        ${[0, 1, 2, 3, 4].map(i => {
            const tickT = new Date(window.start + i * (6 * 60 * 60 * 1000));
            const x = (i / 4) * drawW + padL;
            const label = (i === 2) ? "NOW" : `${String(tickT.getHours()).padStart(2, '0')}:00`;
            return `<text class="axis-label" x="${x}" y="${height - 5}" text-anchor="middle">${label}</text>`;
        }).join('')}
        <line x1="${padL + drawW/2}" y1="${padT}" x2="${padL + drawW/2}" y2="${drawH + padT}" stroke="#e2e8f0" stroke-dasharray="2 2" />
        <path d="${getPath(predPoints)}" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4 4" />
        <path d="${getPath(obsPoints)}" fill="none" stroke="#3b82f6" stroke-width="3" />
    </svg>`;
}

function renderList(hilo, container) {
    if (!hilo || hilo.length === 0) { container.innerHTML = "<p style='text-align:center; padding:10px;'>No high/low tides in window.</p>"; return; }
    container.innerHTML = hilo.map(p => `
        <div class="tide-row">
            <div>
                <span class="tide-type ${p.type}">${p.type === 'H' ? '▲ High' : '▼ Low'}</span>
                <span class="tide-time">${p.t.split(' ')[1]}</span>
            </div>
            <div class="tide-val">${parseFloat(p.v).toFixed(2)} <small>ft</small></div>
        </div>
    `).join('');
}

function renderError(msg, container) {
    container.innerHTML = `<div style="color:red; font-size:12px; text-align:center; padding:20px;">⚠️ Error: ${msg}</div>`;
}

async function initTideWidget(stationId, stationName, container) {
    container.innerHTML = `
        <div class="app-container">
            <header>
                <h1>${stationName}</h1>
                <p class="subtitle">Observed vs. Predicted (MLLW)</p>
            </header>
            <div class="card-content">
                <div class="legend">
                    <span class="legend-item"><span class="dot obs"></span> Observed</span>
                    <span class="legend-item"><span class="dot pred"></span> Predicted</span>
                </div>
                <div class="chart-container"><div class="loader"></div></div>
                <div class="tide-display"></div>
            </div>
        </div>`;

    const data = await getTideData(stationId, container);
    if (data) {
        drawChart(data, container.querySelector('.chart-container'));
        renderList(data.hilo, container.querySelector('.tide-display'));
    }
}

// --- CUSTOM MAP CENTERING LOGIC ---
function centerMapOnPopup(latlng, zoomLevel) {
    const targetZoom = zoomLevel || map.getZoom();
    const pxPoint = map.project(latlng, targetZoom);
    
    // Y is subtracted to move the camera UP, which pushes the marker DOWN on screen.
    // ~190px is about half the popup height plus some padding.
    pxPoint.y -= 190; 
    
    const targetLatLng = map.unproject(pxPoint, targetZoom);
    map.flyTo(targetLatLng, targetZoom, { animate: true, duration: 0.8 });
}


// --- GEOJSON FETCH & MAP INTERACTION ---
fetch('./data/stationIndex.geojson')
    .then(response => {
        if (!response.ok) {
            throw new Error("Failed to load GeoJSON. Please ensure you are running this from a local web server (like VS Code's 'Live Server' extension), not by opening the HTML file directly.");
        }
        return response.json();
    })
    .then(data => {
        L.geoJSON(data, {
            pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
                radius: 5.5, fillColor: "#3b82f6", color: "#ffffff",
                weight: 1.5, opacity: 1, fillOpacity: 0.85
            }),
            onEachFeature: (feature, layer) => {
                const props = feature.properties;
                if (props) {
                    const id = props.stationId || props.id;
                    const name = props.name;

                    searchableStations.push({ id: String(id), name: String(name), layer: layer });
                    
                    layer.on('click', (e) => {
                        centerMapOnPopup(e.latlng);
                        
                        const popupContent = document.createElement('div');
                        activeStationPopup = L.popup({
                                className: 'tide-widget-popup',
                                minWidth: 420,
                                autoPan: false // Prevent Leaflet from overriding our pan
                            })
                            .setLatLng(e.latlng)
                            .setContent(popupContent)
                            .openOn(map);
                        
                        initTideWidget(id, name, popupContent);
                    });
                }
            }
        }).addTo(map);
    })
    .catch(error => {
        console.error(error);
        alert(error.message); // Make the error highly visible
    });

// --- SEARCH LOGIC ---
function openStationPopup(match) {
    const latlng = match.layer.getLatLng();
    centerMapOnPopup(latlng, 8);

    setTimeout(() => {
        const popupContent = document.createElement('div');
        activeStationPopup = L.popup({
                className: 'tide-widget-popup',
                minWidth: 420,
                autoPan: false
            })
            .setLatLng(latlng)
            .setContent(popupContent)
            .openOn(map);
        
        initTideWidget(match.id, match.name, popupContent);
    }, 800);

    searchInput.value = match.name;
    resultsContainer.style.display = 'none';
}

searchInput.addEventListener('input', function(e) {
    const query = e.target.value.toLowerCase();
    resultsContainer.innerHTML = '';
    if (!query) { resultsContainer.style.display = 'none'; return; }

    const matches = searchableStations.filter(s => 
        s.name.toLowerCase().includes(query) || s.id.toLowerCase().includes(query)
    ).slice(0, 6);

    if (matches.length > 0) {
        resultsContainer.style.display = 'block';
        matches.forEach(match => {
            const div = document.createElement('div');
            div.className = 'result-item';
            div.innerHTML = `<span class="result-name">${match.name}</span><span class="result-id">ID: ${match.id}</span>`;
            div.onclick = () => openStationPopup(match);
            resultsContainer.appendChild(div);
        });
    } else {
        resultsContainer.style.display = 'none';
    }
});

document.addEventListener('click', (e) => {
    if (!document.getElementById('ui-header').contains(e.target)) {
        resultsContainer.style.display = 'none';
    }
});
