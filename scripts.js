const API_CONFIG = {
    station: '8771450',
    app: 'IOS_Tides_App',
    base: 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'
};

async function getComparisonData() {
    const common = `&station=${API_CONFIG.station}&time_zone=lst&units=english&datum=MLLW&format=json&application=${API_CONFIG.app}`;
    const urls = [
        `${API_CONFIG.base}?product=predictions&interval=hilo&date=today${common}`,
        `${API_CONFIG.base}?product=predictions&date=today${common}`,
        `${API_CONFIG.base}?product=water_level&date=today${common}`
    ];

    try {
        const [hiloRes, predRes, obsRes] = await Promise.all(urls.map(u => fetch(u)));
        return {
            hilo: (await hiloRes.json()).predictions,
            pred: (await predRes.json()).predictions,
            obs: (await obsRes.json()).data
        };
    } catch (e) { return null; }
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
    const width = 400, height = 150;
    // Increased padding for labels
    const padL = 35, padB = 25, padT = 10, padR = 10; 
    const drawW = width - padL - padR;
    const drawH = height - padT - padB;

    const allValues = [...obsData.map(d => parseFloat(d.v)), ...predData.map(d => parseFloat(d.v))];
    const min = Math.min(...allValues), max = Math.max(...allValues), range = max - min || 1;

    const mapPoints = (data) => data.map((d, i) => ({
        x: (i / (data.length - 1)) * drawW + padL,
        y: drawH - ((parseFloat(d.v) - min) / range) * drawH + padT
    }));

    const obsPoints = mapPoints(obsData);
    const predPoints = mapPoints(predData);

    // Generate Y-Axis Ticks (Min, Mid, Max)
    const yTicks = [min, (min + max) / 2, max].map(v => ({
        val: `${v.toFixed(1)}ft`,
        y: drawH - ((v - min) / range) * drawH + padT
    }));

    // Generate X-Axis Ticks (4 Time Intervals)
    const xIdx = [0, Math.floor(predData.length/3), Math.floor(2*predData.length/3), predData.length-1];
    const xTicks = xIdx.map(idx => ({
        label: predData[idx].t.split(' ')[1], // Get HH:MM
        x: (idx / (predData.length - 1)) * drawW + padL
    }));

    container.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
            <!-- Grid Lines -->
            ${yTicks.map(t => `<line class="grid-line" x1="${padL}" y1="${t.y}" x2="${width - padR}" y2="${t.y}" />`).join('')}
            
            <!-- Axis Labels -->
            ${yTicks.map(t => `<text class="axis-text" x="${padL - 5}" y="${t.y + 3}" text-anchor="end">${t.val}</text>`).join('')}
            ${xTicks.map(t => `<text class="axis-text" x="${t.x}" y="${height - 5}" text-anchor="middle">${t.label}</text>`).join('')}
            
            <!-- Data Paths -->
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
