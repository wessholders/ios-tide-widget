"""
Author: Wes Sholders
Creation Date: 05/07/2026
Version: 2.5 (Production)
Python version: 3.14
Description: Full mission pull for all water level stations. 
             Optimized refactor with YYMMDD_HHMM log naming and runtime tracking.
"""

import requests
import time
import os
import json
import logging
import re
from datetime import datetime, timedelta

###- configuration -###
baseOutputPath = r"C:\WJS\Personal\SCRATCH\TIDAL_CACHING\data\output"
logOutputPath = r"C:\WJS\Personal\SCRATCH\TIDAL_CACHING\data\logs"

noaaApiUrl = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter"
appName = "IOS_Tides_App"
stationMetadataUrl = "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=waterlevels"

# Date window (-3 to +14 days)
today = datetime.now()
beginDate = (today - timedelta(days=3)).strftime("%Y%m%d")
endDate = (today + timedelta(days=14)).strftime("%Y%m%d")

def setupEnvironment():
    # Ensure both data and log directories exist
    os.makedirs(baseOutputPath, exist_ok=True)
    os.makedirs(logOutputPath, exist_ok=True)
        
    # Generate log filename: YYMMDD_HHMM_NOAA_API_Cache_Log.log
    logTimestamp = datetime.now().strftime("%y%m%d_%H%M")
    logFileName = f"{logTimestamp}_NOAA_API_Cache_Log.log"
    logFilePath = os.path.join(logOutputPath, logFileName)
    
    logging.basicConfig(
        filename=logFilePath, 
        level=logging.INFO, 
        format='%(message)s',
        filemode='w'
    )
    return logFilePath

def fetchProductData(session, stationId, product, interval=None):
    queryParams = {
        "begin_date": beginDate, "end_date": endDate,
        "station": stationId, "product": product,
        "datum": "MLLW", "time_zone": "lst",
        "units": "english", "format": "json",
        "application": appName
    }
    if interval:
        queryParams["interval"] = interval
    
    try:
        response = session.get(noaaApiUrl, params=queryParams, timeout=15)
        if response.status_code == 200:
            data = response.json()
            return data if "error" not in data else None
        return None
    except requests.exceptions.RequestException:
        return None

def runFullMissionCache():
    logPath = setupEnvironment()
    startTime = time.time()
    
    stats = {"totalAttempted": 0, "fullSuccess": 0, "partialSuccess": 0, "failed": 0}
    geoJsonFeatures = []
    
    with requests.Session() as session:
        print(f"[*] Mission Started at: {datetime.now().strftime('%H:%M:%S')}")
        print(f"[*] Logs: {os.path.basename(logPath)}")
        
        metaResponse = session.get(stationMetadataUrl)
        if metaResponse.status_code != 200:
            print("[!] Critical failure: could not fetch station list.")
            return
            
        stationsList = metaResponse.json().get('stations', [])
        totalStations = len(stationsList)
        progressStep = max(1, int(totalStations * 0.05))
        
        for index, station in enumerate(stationsList, start=1):
            stationId, stationName = station.get('id'), station.get('name')
            stats["totalAttempted"] += 1
            
            # 1. GeoJSON Mapping
            try:
                lon, lat = float(station.get('lng', 0)), float(station.get('lat', 0))
                geoJsonFeatures.append({
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [lon, lat]},
                    "properties": {"stationId": stationId, "name": stationName}
                })
            except ValueError:
                logging.warning(f"{stationId} {stationName}, Warning: Invalid coordinates.")

            # 2. Detail Data Aggregation
            unifiedData = {
                "stationId": stationId, "stationName": stationName,
                "coordinates": f"{lat}, {lon}",
                "lastUpdatedUTC": datetime.utcnow().isoformat(),
                "predictions": [], "hiloPredictions": [], "observations": []
            }
            
            successCount = 0
            products = [("predictions", None, "predictions"), 
                        ("predictions", "hilo", "hiloPredictions"), 
                        ("water_level", None, "observations")]
            
            for prod_name, interval, target_key in products:
                data = fetchProductData(session, stationId, prod_name, interval=interval)
                if data:
                    data_key = "predictions" if prod_name == "predictions" else "data"
                    unifiedData[target_key] = data.get(data_key, [])
                    successCount += 1
                time.sleep(0.3)
            
            # 3. File Serialization
            safeName = re.sub(r'[\\/*?:"<>|]', "", stationName).strip()
            fileName = f"{stationId}_{safeName}.json"
            with open(os.path.join(baseOutputPath, fileName), 'w') as f:
                json.dump(unifiedData, f, indent=4)
                
            # 4. Logging
            status_map = {3: "Full Success", 2: "Partial Success (2/3)", 1: "Partial Success (1/3)", 0: "Failed"}
            logging.info(f"{stationId} {stationName}, {status_map.get(successCount)}")
            
            if successCount == 3: stats["fullSuccess"] += 1
            elif successCount > 0: stats["partialSuccess"] += 1
            else: stats["failed"] += 1

            # Progress check (5%)
            if index % progressStep == 0 or index == totalStations:
                print(f"[*] Progress: {index}/{totalStations} ({(index/totalStations)*100:.0f}%) completed...")

    # Final Map Index
    with open(os.path.join(baseOutputPath, "stationIndex.geojson"), 'w') as f:
        json.dump({"type": "FeatureCollection", "features": geoJsonFeatures}, f, indent=4)
        
    totalSeconds = int(time.time() - startTime)
    minutes, seconds = divmod(totalSeconds, 60)
    
    # Mission Summary Report
    print("\n" + "="*40)
    print("      MISSION SUMMARY REPORT      ")
    print("="*40)
    print(f"Total Stations Attempted: {stats['totalAttempted']}")
    print(f"Full Success (All Data):  {stats['fullSuccess']}")
    print(f"Partial Success (Missing):{stats['partialSuccess']}")
    print(f"Failed (No Data Saved):   {stats['failed']}")
    print("-" * 40)
    print(f"Total Run Time:           {minutes}m {seconds}s")
    print("="*40 + "\n")

if __name__ == "__main__":
    runFullMissionCache()
