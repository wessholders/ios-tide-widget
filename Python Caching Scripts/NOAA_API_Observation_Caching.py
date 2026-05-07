"""
Mission: HOT_CACHE (Water Level Observations)
Frequency: Recurring (e.g., 6-10 min)
Date Range: Last 12 Hours (-0.5 Days)
"""
import requests, time, os, json, logging, re
from datetime import datetime, timedelta

###- configuration -###
baseOutputPath = r"C:\WJS\Personal\SCRATCH\TIDAL_CACHING\observations\data\output"
logOutputPath = r"C:\WJS\Personal\SCRATCH\TIDAL_CACHING\observations\data\log"
stationMetadataUrl = "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=waterlevels"
noaaApiUrl = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter"

# Date window
days_to_pull = .5
today = datetime.now()
beginDate = (today - timedelta(days=days_to_pull)).strftime("%Y%m%d")
endDate = today.strftime("%Y%m%d")

def setupEnvironment():
    os.makedirs(baseOutputPath, exist_ok=True)
    os.makedirs(logOutputPath, exist_ok=True)
    logTimestamp = datetime.now().strftime("%y%m%d_%H%M")
    logPath = os.path.join(logOutputPath, f"{logTimestamp}_NOAA_API_Cache_Log.log")
    logging.basicConfig(filename=logPath, level=logging.INFO, format='%(message)s', filemode='w')
    return logPath

def runHotMission():
    logPath = setupEnvironment()
    startTime = time.time()
    
    # Matching detailed stats format
    stats = {"totalAttempted": 0, "fullSuccess": 0, "partialSuccess": 0, "failed": 0}
    
    with requests.Session() as session:
        print(f"[*] Starting HOT Mission (-12 Hours to Current). Logs: {os.path.basename(logPath)}")
        stationsList = session.get(stationMetadataUrl).json().get('stations', [])
        total = len(stationsList)
        progressStep = max(1, int(total * 0.05))
        
        for i, s in enumerate(stationsList, 1):
            sid, sname = s.get('id'), s.get('name')
            stats["totalAttempted"] += 1
            params = {"begin_date": beginDate, "end_date": endDate, "station": sid, "product": "water_level", 
                      "datum": "MLLW", "time_zone": "lst", "units": "english", "format": "json", "application": "HOT_PULL"}
            
            try:
                r = session.get(noaaApiUrl, params=params, timeout=10)
                obsData = r.json() if r.status_code == 200 and "data" in r.json() else None
            except: obsData = None
            
            hotPayload = {"stationId": sid, "lastUpdatedUTC": datetime.utcnow().isoformat(),
                          "observations": obsData.get("data", []) if obsData else []}
            
            safeName = re.sub(r'[\\/*?:"<>|]', "", sname).strip()
            with open(os.path.join(baseOutputPath, f"{sid}_{safeName}.json"), 'w') as f:
                json.dump(hotPayload, f, indent=4)
            
            if obsData:
                stats["fullSuccess"] += 1
                logging.info(f"{sid} {sname}, Full Success")
            else:
                stats["failed"] += 1
                logging.info(f"{sid} {sname}, Failed")
                
            if i % progressStep == 0 or i == total:
                print(f"[*] Hot Progress: {i}/{total} ({(i/total)*100:.0f}%) completed...")
                
    m, s = divmod(int(time.time() - startTime), 60)
    
    # Identical Detailed Summary
    print("\n" + "="*40)
    print("      HOT MISSION SUMMARY REPORT      ")
    print("="*40)
    print(f"Total Stations Attempted: {stats['totalAttempted']}")
    print(f"Full Success (All Data):  {stats['fullSuccess']}")
    print(f"Partial Success (Missing):{stats['partialSuccess']}") # Will remain 0 for Hot pull
    print(f"Failed (No Data Saved):   {stats['failed']}")
    print("-" * 40)
    print(f"Total Run Time:           {m}m {s}s")
    print("="*40 + "\n")

if __name__ == "__main__":
    runHotMission()
