const CONFIG = {
    station: '8771450',
    app: 'IOS_Tides_App',
    baseUrl: 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'
};

/**
 * Fetch data for both High/Low predictions and observed Water Levels
 */
async function getCoastalData() {
    const common = `&station=${CONFIG.station}&time_zone=lst&units=english&format=json&application=${CONFIG.app}`;
    
    const urls = [
        `${CONFIG.baseUrl}?product=predictions&datum=MLLW&interval=hilo&date=today${common}`,
        `${CONFIG.baseUrl}?product=water_level&datum=STND&date=today${common}`
    ];

    try {
        const [tideRes, waterRes] = await Promise.all(urls.map(url => fetch(url)));
        const tideData = await tideRes.json();
        const waterData = await waterRes.json();
        
        return { 
            predictions: tideData.predictions, 
            observations: waterData.data 
        };
    } catch (err) {
        console.error("Data Load Error:", err);
        return null;
    }
}

/**
 * Creates a "SUPER simple" SVG line graph from water level data
 */
function drawSimpleChart(data) {
    const container = document.getElementById('chart-container');
    if (!data || data.length === 0) {
        container.innerHTML = "";
        return;
    }

    const width = 400;
    const height = 120;
    const padding = 10;

    // Normalize data for the SVG box
    const values = data.map(d => parseFloat(d.v));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    const points = values.map((v, i) => {
        const x = (i / (values.length - 1)) * (width - (padding * 2)) + padding;
        const y = height - ((v - min) / range) * (height - (padding * 2)) - padding;
        return `${x},${y}`;
    }).join(' ');

    container.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
            <polyline class="tide-line" points="${points}" />
        </svg>
    `;
}

/**
 * Renders the High/Low list
 */
function renderTideList(predictions) {
    const display = document.getElementById('tide-display');
    if (!predictions) {
        display.innerHTML = "<p>Error loading predictions.</p>";
        return;
    }

    display.innerHTML = predictions.map(p => `
        <div class="tide-row">
            <div class="tide-label">
                <span class="tide-type ${p.type === 'H' ? 'high' : 'low'}">
                    ${p.type === 'H' ? 'High Tide' : 'Low Tide'}
                </span>
                <span class="tide-time">${p.t}</span>
            </div>
            <div class="tide-value">${p.v} ft</div>
        </div>
    `).join('');
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    const allData = await getCoastalData();
    if (allData) {
        drawSimpleChart(allData.observations);
        renderTideList(allData.predictions);
    }
});
