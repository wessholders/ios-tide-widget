const CONFIG = {
    // station ID is now dynamic
    app: 'TideTracker_App', // Changed to a more generic name
    base: 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'
};

let map; // Define map globally

/**
 * Updates the UI and fetches data for a newly selected station.
 * @param {string} stationId - The ID of the station.
 * @param {string} stationName - The name of the station.
 */
async function updateStationData(stationId, stationName) {
    // Update header
    document.getElementById('station-name').textContent = stationName;

    // Show loader and clear old data
    const chartContainer = document.getElementById('chart-container');
    chartContainer.innerHTML = '<div class="loader"></div>';
    document.getElementById('tide-display').innerHTML = '';

    // Fetch new data
    const data = await getTideData(stationId);
    if (data) {
        drawChart(data);
        renderList(data.hilo);
    }
}

/**
 * Initializes the Leaflet map and populates it with stations from GeoJSON.
 */
async function initializeMap() {
    // Initialize map centered on the US
    map = L.map('map').setView([39.8283, -98.5795], 4);

    // Add a tile layer from OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    try {
        // Fetch the GeoJSON data
        const response = await fetch('stationindex.geojson');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const stations = await response.json();

        // Add GeoJSON layer to the map
        L.geoJson(stations, {
            onEachFeature: (feature, layer) => {
                const { name, stationId } = feature.properties;
                layer.bindPopup(`<b>${name}</b><br>ID: ${stationId}`);

                // Add click listener to each marker
                layer.on('click', () => {
                    updateStationData(stationId, name);
                    // Center the map on the clicked marker
                    map.setView(layer.getLatLng(), 10);
                });
            }
        }).addTo(map);

        // Load data for the first station in the list by default
        if (stations.features.length > 0) {
            const firstStation = stations.features[0].properties;
            updateStationData(firstStation.stationId, firstStation.name);
        }

    } catch (e) {
        console.error("Failed to load or process stationindex.geojson:", e);
        renderError("Could not load station data. " + e.message);
    }
}


function getNOAADateRange() {
    const now = new Date();
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    const format = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}${m}${day}`;
    };
    return { begin: format(yesterday), end: format(tomorrow) };
}

function parseNOAATime(timeStr) {
    if (!timeStr) return 0;
    const [datePart, timePart] = timeStr.split(' ');
    const [y, m, d] = datePart.split('-').map(Number);
    const [hr, min] = timePart.split(':').map(Number);
    return new Date(y, m - 1, d, hr, min).getTime();
}

/**
 * Fetches tide data for a specific station.
 * @param {string} stationId - The station ID to fetch data for.
 */
async function getTideData(stationId) {
    const dates = getNOAADateRange();
    const common = `&station=${stationId}&time_zone=lst&units=english&datum=MLLW&format=json&application=${CONFIG.app}`;
    
    const urls = {
        hilo: `${CONFIG.base}?product=predictions&interval=hilo&begin_date=${dates.begin}&end_date=${dates.end}${common}`,
        pred: `${CONFIG.base}?product=predictions&begin_date=${dates.begin}&end_date=${dates.end}${common}`,
        obs: `${CONFIG.base}?product=water_level&begin_date=${dates.begin}&end_date=${dates.end}${common}`
    };

    console.group(`⚓ NOAA API Fetching for Station: ${stationId}`);
    
    try {
        const [hRes, pRes, oRes] = await Promise.all([
            fetch(urls.hilo).then(r => r.json()),
            fetch(urls.pred).then(r => r.json()),
            fetch(urls.obs).then(r => r.json())
        ]);

        // Check for errors in any of the responses
        if (pRes.error) throw new Error(`Prediction Data: ${pRes.error.message}`);
        if (oRes.error) throw new Error(`Observation Data: ${oRes.error.message}`);
        if (hRes.error) throw new Error(`HiLo Data: ${hRes.error.message}`);


        const nowMs = new Date().getTime();
        const twelveHoursMs = 12 * 60 * 60 * 1000;
        const startWindow = nowMs - twelveHoursMs;
        const endWindow = nowMs + twelveHoursMs;

        const filterToWindow = (dataArray) => {
            if (!Array.isArray(dataArray)) return [];
            return dataArray.filter(d => {
                const t = parseNOAATime(d.t);
                return t >= startWindow && t <= endWindow;
            });
        };

        const result = {
            hilo: filterToWindow(hRes.predictions),
            pred: filterToWindow(pRes.predictions),
            obs: filterToWindow(oRes.data),
            window: { start: startWindow, end: endWindow, total: endWindow - startWindow }
        };

        console.groupEnd();
        return result;
    } catch (e) {
        console.groupEnd();
        renderError(e.message);
        return null;
    }
}

function drawChart(data) {
    const container = document.getElementById('chart-container');
    const { obs, pred, window } = data;
    
    // It's possible to get predictions but no observations. The app should still work.
    if (!pred || pred.length < 2) {
        container.innerHTML = "<p style='text-align:center; padding-top:40px;'>No prediction data available for the current window.</p>";
        return;
    }

    const width = 400, height = 150;
    const padL = 40, padB = 25, padT = 10, padR = 15;
    const drawW = width - padL - padR, drawH = height - padT - padB;

    const allVals = [
        ...(obs ? obs.map(d => parseFloat(d.v)) : []),
        ...pred.map(d => parseFloat(d.v))
    ].filter(v => !isNaN(v));

    if (allVals.length === 0) {
        container.innerHTML = "<p style='text-align:center; padding-top:40px;'>No valid tide values in data.</p>";
        return;
    }

    const min = Math.min(...allVals), max = Math.max(...allVals), range = (max - min) || 1;

    const mapToTimeline = (array) => {
        if (!array) return [];
        return array.map(d => {
            const t = parseNOAATime(d.t);
            return {
                x: ((t - window.start) / window.total) * drawW + padL,
                y: drawH - ((parseFloat(d.v) - min) / range) * drawH + padT
            };
        });
    }

    const obsPoints = mapToTimeline(obs);
    const predPoints = mapToTimeline(pred);

    const getPath = (p) => {
        if (!p || p.length < 2) return "";
        let d = `M ${p[0].x} ${p[0].y}`;
        for (let i = 1; i < p.length; i++) {
            d += ` L ${p[i].x} ${p[i].y}`;
        }
        return d;
    };
    
    container.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
            <!-- Y-Axis Ticks and Gridlines -->
            ${[min, (min+max)/2, max].map(v => {
                const y = drawH - ((v - min) / range) * drawH + padT;
                return `
                    <line class="grid-line" x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" />
                    <text class="axis-label" x="${padL-5}" y="${y+3}" text-anchor="end">${v.toFixed(2)}</text>
                `;
            }).join('')}

            <!-- X-Axis Labels (Timeline) -->
            ${[-12, -6, 0, 6, 12].map(hourOffset => {
                const time = new Date(new Date().getTime() + hourOffset * 60 * 60 * 1000);
                const x = ((hourOffset + 12) / 24) * drawW + padL;
                const label = (hourOffset === 0) ? "NOW" : `${String(time.getHours()).padStart(2, '0')}:00`;
                return `<text class="axis-label" x="${x}" y="${height - 5}" text-anchor="middle">${label}</text>`;
            }).join('')}

            <!-- "NOW" line -->
            <line x1="${padL + drawW/2}" y1="${padT}" x2="${padL + drawW/2}" y2="${drawH + padT}" stroke="#e2e8f0" stroke-dasharray="2 2" />

            <!-- Data Paths -->
            <path d="${getPath(predPoints)}" fill="none" stroke="var(--gray)" stroke-width="2" stroke-dasharray="4 4" />
            <path d="${getPath(obsPoints)}" fill="none" stroke="var(--blue)" stroke-width="3" />
        </svg>
    `;
}

function renderError(msg) {
    document.getElementById('chart-container').innerHTML = `<div style="color:red; font-size:12px; text-align:center; padding:20px;">⚠️ Error: ${msg}</div>`;
}

function renderList(hilo) {
    const el = document.getElementById('tide-display');
    if (!hilo || hilo.length === 0) { 
        el.innerHTML = "<p style='text-align:center; padding:10px;'>No high/low tide predictions in the current window.</p>"; 
        return; 
    }
    
    el.innerHTML = hilo.map(p => `
        <div class="tide-row">
            <div>
                <span class="tide-type ${p.type}">${p.type === 'H' ? '▲ High' : '▼ Low'}</span>
                <span class="tide-time">${p.t.split(' ')[1]}</span>
            </div>
            <div class="tide-val">${parseFloat(p.v).toFixed(2)} <small>ft</small></div>
        </div>
    `).join('');
}

// Main execution on DOM content loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeMap();
});
