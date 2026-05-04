/**
 * Configuration Object
 * Centralizing API parameters makes scaling easier if you want to add dynamic station selection later.
 */
const CONFIG = {
    API_BASE_URL: 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter',
    DEFAULT_STATION: '8771450',
    APP_NAME: 'USACE_Sholders'
};

/**
 * Dynamically builds the NOAA API endpoint URL.
 */
function buildApiUrl(stationId = CONFIG.DEFAULT_STATION) {
    const params = new URLSearchParams({
        date: 'today',
        station: stationId,
        product: 'predictions',
        datum: 'STND',
        time_zone: 'lst',
        interval: 'hilo',
        units: 'english',
        application: CONFIG.APP_NAME,
        format: 'json'
    });
    return `${CONFIG.API_BASE_URL}?${params.toString()}`;
}

/**
 * Handles the asynchronous network request and parses the JSON.
 */
async function fetchTideData() {
    const url = buildApiUrl();
    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Network Error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error.message || 'The NOAA API returned an error.');
        }
        
        return data.predictions || [];
    } catch (error) {
        console.error("Fetch Data Failure:", error);
        throw error;
    }
}

/**
 * Generates DOM elements securely and efficiently using a DocumentFragment.
 */
function renderTides(predictions) {
    const container = document.getElementById('tide-container');
    container.innerHTML = ''; // Remove the loader

    if (!predictions || predictions.length === 0) {
        container.innerHTML = '<div class="error-message">No tide data available for today.</div>';
        return;
    }

    const fragment = document.createDocumentFragment();

    predictions.forEach(prediction => {
        const isHigh = prediction.type === 'H';
        
        // Create Row Container
        const row = document.createElement('div');
        row.className = 'tide-row';

        // Create Type Element (High/Low)
        const typeEl = document.createElement('span');
        typeEl.className = `tide-type ${isHigh ? 'high' : 'low'}`;
        typeEl.textContent = isHigh ? '▲ High Tide' : '▼ Low Tide';

        // Create Time Element
        const timeEl = document.createElement('span');
        timeEl.className = 'tide-time';
        timeEl.textContent = prediction.t;

        // Create Value Element
        const valueEl = document.createElement('span');
        valueEl.className = 'tide-value';
        valueEl.textContent = `${Number(prediction.v).toFixed(2)} ft`;

        // Assemble row
        row.appendChild(typeEl);
        row.appendChild(timeEl);
        row.appendChild(valueEl);
        
        fragment.appendChild(row);
    });

    container.appendChild(fragment);
}

/**
 * Renders an error message directly to the UI for the user.
 */
function renderError(message) {
    const container = document.getElementById('tide-container');
    container.innerHTML = `<div class="error-message">⚠️ Data retrieval failed:<br>${message}</div>`;
}

/**
 * Bootstraps the application.
 */
async function initApp() {
    try {
        const predictions = await fetchTideData();
        renderTides(predictions);
    } catch (error) {
        renderError(error.message);
    }
}

// Execute initialization once the HTML is fully parsed
document.addEventListener('DOMContentLoaded', initApp);
