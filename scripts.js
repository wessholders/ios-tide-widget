const CONFIG = {
    station: '8771450',
    app: 'IOS_Tides_App',
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

async function getTideData() {
    const dates = getNOAADateRange();
    const common = `&station=${CONFIG.station}&time_zone=lst&units=english&datum=MLLW&format=json&application=${CONFIG.app}`;
    
    const urls = {
        hilo: `${CONFIG.base}?product=predictions&interval=hilo&begin_date=${dates.begin}&end_date=${dates.end}${common}`,
        pred: `${CONFIG.base}?product=predictions&begin_date=${dates.begin}&end_date=${dates.end}${common}`,
        obs: `${CONFIG.base}?product=water_level&begin_date=${dates.begin}&end_date=${dates.end}${common}`
    };

    try {
        const [hRes, pRes, oRes] = await Promise.all([
            fetch(urls.hilo).then(r => r.json()),
            fetch(urls.pred).then(r => r.json()),
            fetch(urls.obs).then(r => r.json())
        ]);

        const nowMs = Date.now();
        const twelveHoursMs = 12 * 60 * 60 * 1000;
        const window = { start: nowMs - twelveHoursMs, end: nowMs + twelveHoursMs };

        // 1. Filter Chart Data (+/- 12 hours)
        const filterLines = (arr) => (arr || []).filter(d => {
            const t = parseNOAATime(d.t);
            return t >= window.start && t <= window.end;
        });

        // 2. Filter List Data (Next 2 Future Tides)
        const filterNextTwo = (arr) => {
            return (arr || [])
                .filter(d => parseNOAATime(d.t) > nowMs)
                .sort((a, b) => parseNOAATime(a.t) - parseNOAATime(b.t))
                .slice(0, 2);
        };

        return {
            hilo: filterNextTwo(hRes.predictions),
            pred: filterLines(pRes.predictions),
            obs: filterLines(oRes.data),
            window: window
        };
    } catch (e) {
        console.error(e);
        return null;
    }
}

function drawChart(data) {
    const container = document.getElementById('chart-container');
    const { obs, pred, window } = data;
    if (!pred || pred.length < 2) return;

    const width = 400, height = 150;
    const padL = 40, padB = 25, padT = 10, padR = 15;
    const drawW = width - padL - padR, drawH = height - padT - padB;

    const all = [...obs.map(d => parseFloat(d.v)), ...pred.map(d => parseFloat(d.v))];
    const min = Math.min(...all), max = Math.max(...all), range = (max - min) || 1;

    const map = (arr) => arr.map(d => ({
        x: ((parseNOAATime(d.t) - window.start) / (24 * 60 * 60 * 1000)) * drawW + padL,
        y: drawH - ((parseFloat(d.v) - min) / range) * drawH + padT
    }));

    const obsPoints = map(obs);
    const predPoints = map(pred);

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

    container.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
            <!-- Grid Lines -->
            ${[min, (min+max)/2, max].map(v => {
                const y = drawH - ((v - min) / range) * drawH + padT;
                return `
                    <line class="grid-line" x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" />
                    <text class="axis-label" x="${padL-5}" y="${y+3}" text-anchor="end">${v.toFixed(2)}</text>
                `;
            }).join('')}
            <!-- X Axis -->
            ${[0, 1, 2, 3, 4].map(i => {
                const tickT = new Date(window.start + i * (6 * 60 * 60 * 1000));
                const x = (i / 4) * drawW + padL;
                const label = (i === 2) ? "NOW" : `${String(tickT.getHours()).padStart(2, '0')}:00`;
                return `<text class="axis-label" x="${x}" y="${height - 5}" text-anchor="middle">${label}</text>`;
            }).join('')}
            <line x1="${padL + drawW/2}" y1="${padT}" x2="${padL + drawW/2}" y2="${drawH + padT}" stroke="#e2e8f0" stroke-dasharray="2 2" />
            <path d="${getPath(predPoints)}" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4 4" />
            <path d="${getPath(obsPoints)}" fill="none" stroke="#3b82f6" stroke-width="3" />
        </svg>
    `;
}

function renderList(hilo) {
    const el = document.getElementById('tide-display');
    if (!hilo || hilo.length === 0) { el.innerHTML = "<p>No upcoming tides.</p>"; return; }
    
    el.innerHTML = hilo.map((p) => `
        <div class="tide-row">
            <div>
                <span class="tide-type ${p.type}">${p.type === 'H' ? 'High' : 'Low'}</span>
                <span class="tide-time">${p.t.split(' ')[1]}</span>
            </div>
            <div class="tide-val">${parseFloat(p.v).toFixed(2)} <small>ft</small></div>
        </div>
    `).join('');
}

document.addEventListener('DOMContentLoaded', async () => {
    const data = await getTideData();
    if (data) {
        drawChart(data);
        renderList(data.hilo);
    }
});
