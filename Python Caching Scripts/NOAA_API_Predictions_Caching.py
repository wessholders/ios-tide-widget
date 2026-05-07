"""
Mission: COLD_CACHE (Predictions & Indexing)
Frequency: Daily
Date Range: -3 Days to +14 Days
"""
import requests, time, os, json, logging, re
from datetime import datetime, timedelta

###- configuration -###
baseOutputPath = r"C:\WJS\Personal\SCRATCH\TIDAL_CACHING\predctions\data\output"
logOutputPath = r"C:\WJS\Personal\SCRATCH\TIDAL_CACHING\predctions\data\log"
stationMetadataUrl = "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=waterlevels"
noaaApiUrl = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter"

# Date window (-3 to +14 days)
today = datetime.now()
beginDate = (today - timedelta(days=3)).strftime("%Y%m%d")
endDate = (today + timedelta(days=14)).strftime("%Y%m%d")

def setupEnvironment():
    os.makedirs(baseOutputPath, exist_ok=True)
    os.makedirs(logOutputPath, exist_ok=True)
    logTimestamp = datetime.now().strftime("%y%m%d_%H%M")
    logPath = os.path.join(logOutputPath, f"{logTimestamp}_NOAA_API_Cache_Log.log")
    logging.basicConfig(filename=logPath, level=logging.INFO, format='%(message)s', filemode='w')
    return logPath

def fetchProductData(session, stationId, product, interval=None):
    params = {"begin_date": beginDate, "end_date": endDate, "station": stationId, "product": product, 
              "datum": "MLLW", "time_zone": "lst", "units": "english", "format": "json", "application": "COLD_PULL"}
    if interval: params["interval"] = interval
    try:
        r = session.get(noaaApiUrl, params=params, timeout=15)
        return r.json() if r.status_code == 200 and "error" not in r.json() else None
    except: return None

def runColdMission():
    logPath = setupEnvironment()
    startTime = time.time()
    
    # Restored detailed stats
    stats = {"totalAttempted": 0, "fullSuccess": 0, "partialSuccess": 0, "failed": 0}
    geoJsonFeatures = []
    
    with requests.Session() as session:
        print(f"[*] Starting COLD Mission (-3 to +14). Logs: {os.path.basename(logPath)}")
        stationsList = session.get(stationMetadataUrl).json().get('stations', [])
        total = len(stationsList)
        progressStep = max(1, int(total * 0.05))
        
        for i, s in enumerate(stationsList, 1):
            sid, sname = s.get('id'), s.get('name')
            stats["totalAttempted"] += 1
            
            # 1. Map UI Indexing
            try:
                lon, lat = float(s.get('lng', 0)), float(s.get('lat', 0))
                geoJsonFeatures.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]},
                                        "properties": {"stationId": sid, "name": sname}})
            except: logging.warning(f"{sid} {sname}, Invalid Coordinates")
            
            # 2. Cold Data Pull
            coldPayload = {"stationId": sid, "stationName": sname, "lastUpdatedUTC": datetime.utcnow().isoformat(),
                           "predictions": [], "hiloPredictions": []}
            
            p1 = fetchProductData(session, sid, "predictions")
            p2 = fetchProductData(session, sid, "predictions", interval="hilo")
            
            successCount = 0
            if p1: 
                coldPayload["predictions"] = p1.get("predictions", [])
                successCount += 1
            if p2: 
                coldPayload["hiloPredictions"] = p2.get("predictions", [])
                successCount += 1
            
            safeName = re.sub(r'[\\/*?:"<>|]', "", sname).strip()
            with open(os.path.join(baseOutputPath, f"{sid}_{safeName}.json"), 'w') as f:
                json.dump(coldPayload, f, indent=4)
            
            # Record detailed status
            if successCount == 2:
                stats["fullSuccess"] += 1
                log_status = "Full Success"
            elif successCount == 1:
                stats["partialSuccess"] += 1
                log_status = "Partial Success"
            else:
                stats["failed"] += 1
                log_status = "Failed"
                
            logging.info(f"{sid} {sname}, {log_status}")
            
            if i % progressStep == 0 or i == total:
                print(f"[*] Cold Progress: {i}/{total} ({(i/total)*100:.0f}%) completed...")
                
    # Save Master Index
    with open(os.path.join(baseOutputPath, "stationIndex.geojson"), 'w') as f:
        json.dump({"type": "FeatureCollection", "features": geoJsonFeatures}, f, indent=4)
        
    m, s = divmod(int(time.time() - startTime), 60)
    
    # Restored Detailed Summary
    print("\n" + "="*40)
    print("      COLD MISSION SUMMARY REPORT      ")
    print("="*40)
    print(f"Total Stations Attempted: {stats['totalAttempted']}")
    print(f"Full Success (All Data):  {stats['fullSuccess']}")
    print(f"Partial Success (Missing):{stats['partialSuccess']}")
    print(f"Failed (No Data Saved):   {stats['failed']}")
    print("-" * 40)
    print(f"Total Run Time:           {m}m {s}s")
    print("="*40 + "\n")

if __name__ == "__main__":
    runColdMission()
