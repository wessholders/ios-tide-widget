const TIDE_CONFIG = {
    station: '8771450',
    app: 'USACE_Sholders',
    endpoint: 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'
};

async function getTideData() {
    const params = new URLSearchParams({
        date: 'today',
        station: TIDE_CONFIG.station,
        product: 'predictions',
        datum: 'STND',
        time_zone: 'lst',
        interval: 'hilo',
        units: 'english',
        application: TIDE_CONFIG.app,
        format: 'json'
    });

    try {
        const response = await fetch(`${TIDE_CONFIG.endpoint}?${params}`);
        if (!response.ok) throw new Error('API request failed');
        const data = await response.json();
        return data.predictions;
    } catch (err) {
        console.error(err);
        return null;
    }
}

function renderTides(predictions) {
    const display = document.getElementById('tide-display');
    
    if (!predictions) {
        display.innerHTML = `<p style="color:red; text-align:center;">Unable to load data.</p>`;
        return;
    }

    display.innerHTML = predictions.map(p => {
        const isHigh = p.type === 'H';
        return `
            <div class="tide-row">
                <div class="tide-info">
                    <span class="tide-type ${isHigh ? 'high' : 'low'}">
                        ${isHigh ? '▲ High' : '▼ Low'}
                    </span>
                    <span class="tide-time">${p.t}</span>
                </div>
                <div class="tide-value">${p.v} ft</div>
            </div>
        `;
    }).join('');
}

// Start
document.addEventListener('DOMContentLoaded', async () => {
    const data = await getTideData();
    renderTides(data);
});
