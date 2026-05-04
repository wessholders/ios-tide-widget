const CONFIG = {
    station: '8771450',
    app: 'IOS_Tides_App',
    base: 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'
};

/**
 * Robust Date Formatting for NOAA (YYYYMMDD)
 */
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

/**
 * Parses NOAA time "YYYY-MM-DD HH:MM" into UTC-style ms
 */
function parseNOAATime(timeStr) {
    if (!timeStr) return 0;
    const [datePart, timePart] = timeStr.split(' ');
    const [y, m, d] = datePart.split('-').map(Number);
    const [hr, min] = timePart.split(':').map(Number);
    // Note: Creating date object based on local machine time
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

    console.group("⚓ NOAA API Fetching");
    console.log("Date Range:", dates);
    
    try {
        const [hRes, pRes, oRes] = await Promise.all([
            fetch(urls.hilo).then(r => r.json()),
            fetch(urls.pred).then(r => r.json()),
            fetch(urls.obs).then(r => r.json())
        ]);

        // Check if NOAA returned an error message in any payload
        [hRes, pRes, oRes].forEach((res, i) => {
            if (res.error) {
                console.error(`API Error in Request ${i}:`, res.error.message);
                throw new Error(res.error.message);
            }
        });

        console.log("Raw Payloads Received:", { hRes, pRes, oRes });

        const nowMs = new Date().getTime();
        const twelveHoursMs = 12 * 60 * 60 * 1000;
        const startWindow = nowMs - twelveHoursMs;
        const endWindow = nowMs + twelveHoursMs;

        const filterToWindow = (dataArray, label) => {
            if (!Array.isArray(dataArray)) {
                console.warn(`Warning: ${label} is not an array.`, dataArray);
                return [];
            }
            const filtered = dataArray.filter(d => {
                const t = parseNOAATime(d.t);
                return t >= startWindow && t <= endWindow;
            });
            console.log(`Filtered ${label}: ${filtered.length} entries remaining.`);
            return filtered;
        };

        const result = {
            hilo: filterToWindow(hRes.predictions, "HiLo Predictions"),
            pred: filterToWindow(pRes.predictions, "Continuous Predictions"),
            obs: filterToWindow(oRes.data, "Observations"),
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
    
    if (!pred || pred.length < 2) {
        container.innerHTML = "<p style='text-align:center; padding-top:40px;'>No prediction data for this window.</p>";
        return;
    }

    const width = 400, height = 150;
    const padL = 35, padB = 25, padT = 10, padR = 15;
    const drawW = width - padL - padR, drawH = height - padT - padB;

    const allVals = [...obs.map(d => parseFloat(d.v)), ...pred.map(d => parseFloat(d.v))];
    const min = Math.min(...allVals), max = Math.max(...allVals), range = (max - min) || 1;

    const mapToTimeline = (array) => array.map(d => {
        const t = parseNOAATime(d.t);
        return {
            x: ((t - window.start) / window.total) * drawW + padL,
            y: drawH - ((parseFloat(d.v) - min) / range) * drawH + padT
        };
    });

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

    container.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
            <!-- Y-Axis Ticks -->
            ${[min, (min+max)/2, max].map(v => {
                const y = drawH - ((v - min) / range) * drawH + padT;
                return `
                    <line class="grid-line" x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="#f1f5f9" />
                    <text class="axis-label" x="${padL-5}" y="${y+3}" text-anchor="end" fill="#64748b" style="font-size:10px;">${v.toFixed(1)}</text>
                `;
            }).join('')}

            <!-- X-Axis Labels -->
            ${[0, 1, 2, 3, 4].map(i => {
                const tickT = new Date(window.start + i * (6 * 60 * 60 * 1000));
                const x = (i / 4) * drawW + padL;
                const label = (i === 2) ? "NOW" : `${String(tickT.getHours()).padStart(2, '0')}:00`;
                return `<text class="axis-label" x="${x}" y="${height - 5}" text-anchor="middle" fill="#64748b" style="font-size:10px;">${label}</text>`;
            }).join('')}

            <line x1="${padL + drawW/2}" y1="${padT}" x2="${padL + drawW/2}" y2="${drawH + padT}" stroke="#e2e8f0" stroke-dasharray="2 2" />
            <path d="${getPath(predPoints)}" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4 4" />
            <path d="${getPath(obsPoints)}" fill="none" stroke="#3b82f6" stroke-width="3" />
        </svg>
    `;
}

function renderError(msg) {
    const chart = document.getElementById('chart-container');
    const list = document.getElementById('tide-display');
    chart.innerHTML = `<div style="color:red; font-size:12px; text-align:center; padding:20px;">⚠️ Error: ${msg}</div>`;
    list.innerHTML = "";
}

function renderList(hilo) {
    const el = document.getElementById('tide-display');
    if (!hilo || hilo.length === 0) { el.innerHTML = "<p style='text-align:center; padding:10px;'>No extremes in window.</p>"; return; }
    el.innerHTML = hilo.map(p => `
        <div class="tide-row">
            <div>
                <span class="tide-type ${p.type}">${p.type === 'H' ? '▲ High' : '▼ Low'}</span>
                <span class="tide-time">${p.t.split(' ')[1]}</span>
            </div>
            <div class="tide-val">${p.v} ft</div>
        </div>
    `).join('');
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log("App Initialized. Current Time:", new Date().toString());
    const data = await getTideData();
    if (data) {
        drawChart(data);
        renderList(data.hilo);
    }
});
