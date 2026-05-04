const CONFIG = {
    station: '8771450',
    app: 'IOS_Tides_App',
    base: 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'
};

async function getTideData() {
    // Changed time_zone to lst_ldt for Local Standard/Daylight Time
    const common = `&station=${CONFIG.station}&time_zone=lst_ldt&units=english&datum=MLLW&format=json&application=${CONFIG.app}`;
    
    const urls = [
        `${CONFIG.base}?product=predictions&interval=hilo&date=today${common}`,
        `${CONFIG.base}?product=predictions&date=today${common}`,
        `${CONFIG.base}?product=water_level&date=today${common}`
    ];

    try {
        const [hRes, pRes, oRes] = await Promise.all(urls.map(u => fetch(u)));
        const hilo = await hRes.json();
        const pred = await pRes.json();
        const obs = await oRes.json();

        return {
            hilo: hilo.predictions,
            pred: pred.predictions,
            obs: obs.data
        };
    } catch (e) { 
        console.error("Fetch Error:", e);
        return null; 
    }
}

function getSmoothPath(points) {
    if (!points || points.length < 2) return "";
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
    const padL = 35, padB = 25, padT = 10, padR = 10;
    const drawW = width - padL - padR;
    const drawH = height - padT - padB;

    // Safety check for data availability
    if (!obsData || !predData) return;

    const all = [
        ...obsData.map(d => parseFloat(d.v)), 
        ...predData.map(d => parseFloat(d.v))
    ];
    const min = Math.min(...all), max = Math.max(...all), range = (max - min) || 1;

    const map = (data) => data.map((d, i) => ({
        x: (i / (data.length - 1)) * drawW + padL,
        y: drawH - ((parseFloat(d.v) - min) / range) * drawH + padT
    }));

    const obsPoints = map(obsData);
    const predPoints = map(predData);

    // Dynamic Axis Labels
    const yTicks = [min, (min + max) / 2, max];
    // Labels for Start, Noon, and End of day
    const xIdx = [0, Math.floor(predData.length / 2), predData.length - 1];

    container.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
            <!-- Y-Axis Grid & Labels -->
            ${yTicks.map(v => {
                const y = drawH - ((v - min) / range) * drawH + padT;
                return `
                    <line class="grid-line" x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="#f1f5f9" />
                    <text class="axis-label" x="${padL - 5}" y="${y + 3}" text-anchor="end" fill="#64748b" style="font-size:10px;">${v.toFixed(1)}</text>
                `;
            }).join('')}

            <!-- X-Axis Labels (Local Time) -->
            ${xIdx.map(idx => {
                const x = (idx / (predData.length - 1)) * drawW + padL;
                const time = predData[idx].t.split(' ')[1];
                return `<text class="axis-label" x="${x}" y="${height - 5}" text-anchor="middle" fill="#64748b" style="font-size:10px;">${time}</text>`;
            }).join('')}

            <!-- Prediction Line (Dashed) -->
            <path d="${getSmoothPath(predPoints)}" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4 4" />
            
            <!-- Observed Line (Solid) -->
            <path d="${getSmoothPath(obsPoints)}" fill="none" stroke="#3b82f6" stroke-width="3" />
        </svg>
    `;
}

function renderList(hilo) {
    const el = document.getElementById('tide-display');
    if (!hilo) { el.innerHTML = "<p>No predictions available.</p>"; return; }
    el.innerHTML = hilo.map(p => `
        <div class="tide-row">
            <div>
                <span class="tide-type ${p.type}">${p.type === 'H' ? '▲ High' : '▼ Low'}</span>
                <span class="tide-time">${p.t.split(' ')[1]}</span>
            </div>
            <div class="tide-val">${p.v} <small>ft</small></div>
        </div>
    `).join('');
}

document.addEventListener('DOMContentLoaded', async () => {
    const data = await getTideData();
    if (data) {
        drawChart(data.obs, data.pred);
        renderList(data.hilo);
    }
});
