// --- LEAFLET & MAP SETUP ---
const map = L.map('map', { zoomControl: false }).setView([39.5, -98.5], 5);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '&copy; CARTO'
}).addTo(map);

const searchableStations = [];
const searchInput = document.getElementById('station-search');
const resultsContainer = document.getElementById('search-results');
let activeStationPopup = null;

// --- TIDE WIDGET LOGIC (REFACTORED) ---
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
            fetch(urls.obs).then(r => r.json())
        ]);

        for (const res of [hRes, pRes, oRes]) {
            if (res.error) throw new Error(res.error.message || `Failed to fetch data for station ${stationId}`);
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
            obs: filterToWindow(oRes.data),
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
        x: ((parseNOAATime(d.t) - wind
