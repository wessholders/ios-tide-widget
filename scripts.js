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

/**
 * Helper to convert "YYYY-MM-DD HH:MM" to minutes since start of day
 */
function getTimeMinutes(timeStr) {
    const timePart = timeStr.split(' ')[1]; // Extracts "HH:MM"
    const [hrs, mins] = timePart.split(':').map(Number);
    return (hrs * 60) + mins;
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
    const padL = 35, padB = 25, padT = 10, padR = 15;
    const drawW = width - padL - padR;
    const drawH = height - padT - padB;

    if (!obsData || !predData) return;

    // Calculate Y-scale based on both datasets
    const all = [...obsData.map(d => parseFloat(d.v)), ...predData.map(d => parseFloat(d.v))];
    const min = Math.min(...all), max = Math.max(...all), range = (max - min) || 1;

    /**
     * Updated Map Logic: 
     * X is now calculated as (Current Minutes / 1440 total minutes in a day)
     */
    const mapToTimeScale = (data) => data.map((d) => {
        const minutes = getTimeMinutes(d.t);
        return {
            x: (minutes / 1440) * drawW + padL,
            y: drawH - ((parseFloat(d.v) - min) / range) * drawH + padT
        };
    });

    const obsPoints = mapToTimeScale(obsData);
    const predPoints = mapToTimeScale(predData);

    // Axis Labels
    const yTicks = [min, (min + max) / 2, max];
    const xLabels = ["00:00", "06:00", "12:00", "18:00", "23:59"];

    container.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
            <!-- Y-Axis Ticks & Grid -->
            ${yTicks.map(v => {
                const y = drawH - ((v - min) / range) * drawH + padT;
                return `
                    <line class="grid-line" x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" />
                    <text class="axis-label" x="${padL - 5}" y="${y + 3}" text-anchor="end">${v.toFixed(1)}ft</text>
                `;
            }).join('')}

            <!-- X-Axis Labels (Fixed Time Scale) -->
            ${xLabels.map((label, i) => {
                const [h, m] = label.split(':').map(Number);
                const x = ((h * 60 + m) / 1440) * drawW + padL;
                return `<text class="axis-label" x="${x}" y="${height - 5}" text-anchor="middle">${label}</text>`;
            }).join('')}

            <!-- Predictions (Dashed - Full Day) -->
            <path d="${getSmoothPath(predPoints)}" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4 4" />
            
            <!-- Observed (Solid - Ends at Current Time) -->
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
