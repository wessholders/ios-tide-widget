const API_CONFIG = {
    station: '8771450',
    app: 'IOS_Tides_App',
    base: 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'
};

async function getComparisonData() {
    const common = `&station=${API_CONFIG.station}&time_zone=lst&units=english&datum=MLLW&format=json&application=${API_CONFIG.app}`;
    
    const urls = [
        `${API_CONFIG.base}?product=predictions&interval=hilo&date=today${common}`, // For List
        `${API_CONFIG.base}?product=predictions&date=today${common}`,               // Continuous Pred
        `${API_CONFIG.base}?product=water_level&date=today${common}`               // Observed
    ];

    try {
        const [hiloRes, predRes, obsRes] = await Promise.all(urls.map(u => fetch(u)));
        return {
            hilo: (await hiloRes.json()).predictions,
            pred: (await predRes.json()).predictions,
            obs: (await obsRes.json()).data
        };
    } catch (e) {
        console.error("Fetch Error:", e);
        return null;
    }
}

function generatePath(points) {
    if (!points.length) return "";
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
        const xc = (points[i].x + points[i + 1].x) / 2;
        const yc = (points[i].y + points[i + 1].y) / 2;
        d += ` Q ${points[i].x} ${points[i].y} ${xc} ${yc}`;
    }
    d += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;
    return d;
}

function drawChart(obsData, predData) {
    const container = document.getElementById('chart-container');
    const width = 400, height = 150, padding = 15;

    // Combine all values to find a universal scale
    const allValues = [...obsData.map(d => parseFloat(d.v)), ...predData.map(d => parseFloat(d.v))];
    const min = Math.min(...allValues), max = Math.max(...allValues), range = max - min || 1;

    const mapPoints = (data) => data.map((d, i) => ({
        x: (i / (data.length - 1)) * (width - padding * 2) + padding,
        y: height - ((parseFloat(d.v) - min) / range) * (height - padding * 2) - padding
    }));

    const obsPoints = mapPoints(obsData);
    const predPoints = mapPoints(predData);

    container.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
            <path class="path-pred" d="${generatePath(predPoints)}" />
            <path class="path-obs" d="${generatePath(obsPoints)}" />
        </svg>
    `;
}

function renderList(hilo) {
    const el = document.getElementById('tide-display');
    if (!hilo) return;
    el.innerHTML = hilo.map(p => `
        <div class="tide-row">
            <div>
                <span class="tide-label ${p.type}">${p.type === 'H' ? '▲ High' : '▼ Low'}</span>
                <span class="tide-time">${p.t}</span>
            </div>
            <div class="tide-val">${p.v} ft</div>
        </div>
    `).join('');
}

document.addEventListener('DOMContentLoaded', async () => {
    const data = await getComparisonData();
    if (data) {
        drawChart(data.obs, data.pred);
        renderList(data.hilo);
    }
});
