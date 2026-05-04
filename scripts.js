const CONFIG = {
    station: '8771450',
    app: 'IOS_Tides_App',
    base: 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'
};

/**
 * Dynamically gets Yesterday and Tomorrow formatted as YYYYMMDD
 */
function getNOAADateRange() {
    const now = new Date();
    
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);

    const format = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}${m}${day}`;
    };

    return { begin: format(yesterday), end: format(tomorrow) };
}

/**
 * Parses NOAA time string "YYYY-MM-DD HH:MM" into a JS timestamp (ms)
 */
function parseNOAATime(timeStr) {
    const [datePart, timePart] = timeStr.split(' ');
    const [y, m, d] = datePart.split('-').map(Number);
    const [hr, min] = timePart.split(':').map(Number);
    return new Date(y, m - 1, d, hr, min).getTime();
}

async function getTideData() {
    const dates = getNOAADateRange();
    const common = `&station=${CONFIG.station}&time_zone=lst&units=english&datum=MLLW&format=json&application=${CONFIG.app}`;
    
    // Using begin_date and end_date to fetch a wide net of data
    const urls = [
        `${CONFIG.base}?product=predictions&interval=hilo&begin_date=${dates.begin}&end_date=${dates.end}${common}`,
        `${CONFIG.base}?product=predictions&begin_date=${dates.begin}&end_date=${dates.end}${common}`,
        `${CONFIG.base}?product=water_level&begin_date=${dates.begin}&end_date=${dates.end}${common}`
    ];

    try {
        const [hRes, pRes, oRes] = await Promise.all(urls.map(u => fetch(u)));
        const hiloData = await hRes.json();
        const predData = await pRes.json();
        const obsData = await oRes.json();

        // Determine the exact rolling 24-hour window
        const nowMs = new Date().getTime();
        const twelveHoursMs = 12 * 60 * 60 * 1000;
        const startWindow = nowMs - twelveHoursMs;
        const endWindow = nowMs + twelveHoursMs;

        // Filter function to keep only data within +/- 12 hours
        const filterToWindow = (dataArray) => {
            if (!dataArray) return
S
