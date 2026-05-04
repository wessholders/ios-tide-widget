const CONFIG = {
    station: '8771450',
    app: 'IOS_Tides_App',
    base: 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'
};

async function getTideData() {
    const common = `&station=${CONFIG.station}&time_zone=lst&units=english&datum=MLLW&format=json&application=${CONFIG.app}`;
    const urls = [
        `${CONFIG.base}?product=predictions&interval=hilo&date=today${common}`,
        `${CONFIG.base}?product=predictions&date=today${common}`,
        `${CONFIG.base}?product=water_level&date=today${common}`
    ];

    try {
        const [hRes, pRes, oRes] = await Promise.all(urls.map(u => fetch(u)));
        return {
            hilo: (await hRes.json()).predictions,
            pred: (await pRes.json()).predictions,
            obs: (await oRes.json()).data
        };
    } catch (e) { return null; }
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

    if (!obsData || !predData) return;

    const all = [...obsData.map(d => parseFloat(d.v)), ...predData.map(d => parseFloat(d.v))];
    const min = Math.min(...all), max = Math.max(...all), range = (max - min) || 1;

    const map = (data) => data.map((d, i) => ({
        x: (i / (data.length - 1)) * drawW + padL,
        y: drawH - ((parseFloat(d.v) - min) / range) * drawH + padT
    }));

    const obsPoints = map(obsData);
    const predPoints = map(predData);

    const yTicks = [min, (min + max) / 2, max];
    const xIdx = [0, Math.floor(predData.length/2), predData.length - 1];

    container.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
            <!-- Grid & Y-Axis -->
            ${yTicks.map(v => {
                const y = drawH - ((v - min) / range) * drawH + padT;
                return `
                    <line class="grid-line" x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" />
                    <text class="axis-label" x="${padL - 5}" y="${y + 3}" text-anchor="end">${v.toFixed(1)}ft</text>
                `;
            }).join('')}

            <!-- X-Axis -->
            ${xIdx.map(idx => {
                const x = (idx / (predData.length - 1)) * drawW + padL;
                const time = predData[idx].t.split(' ')[1];
                return `<text class="axis-label" x="${x}" y="${height - 5}" text-anchor="middle">${time}</text>`;
            }).join('')}

            <!-- Lines -->
            <path d="${getSmoothPath(predPoints)}" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4 4" />
            <path d="${getSmoothPath(obsPoints)}" fill="none" stroke="#3b82f6" stroke-width="3" />
        </svg>
    `;
}

function renderList(hilo) {
    const el = document.getElementById('tide-display');
    if (!hilo) return;
    el.innerHTML = hilo.map(p => `
        <div class="tide-row">
            <div>
                <span class="tide-type ${p.type}">${p.type === 'H' ? '▲ High' : '▼ Low'}</span>
                <span class="tide-time">${p.t}</span>
            </div>
            <div class="tide-val">${p.v} ft</div>
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
