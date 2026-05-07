"""
Author: Wes Sholders
Creation Date: 05/07/2026
Version: 2.0 (Production)
Python version: 3.14
Description: Full mission pull for all water level stations. 
             Merges cache files and generates a lightweight GeoJSON index for Map UIs.
"""

import requests
import time
import os
import json
from datetime import datetime, timedelta

###- configuration -###
baseOutputPath = r"C:\WJS\Personal\SCRATCH\TIDAL_CACHING\data"
noaaApiUrl = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter"
appName = "IOS_Tides_App"
stationMetadataUrl = "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=waterlevels"

# Date window (-3 to +14 days)
today = datetime.now()
beginDate = (today - timedelta(days=3)).strftime("%Y%m%d")
endDate = (today + timedelta(days=14)).strftime("%Y%m%d")

def setupEnvironment():
    if not os.path.exists(baseOutputPath):
        os.makedirs(baseOutputPath)

def fetchProductData(session, stationId, product, interval=None):
    queryParams = {
        "begin_date": beginDate,
        "end_date": endDate,
        "station": stationId,
        "product": product,
        "datum": "MLLW",
        "time_zone": "lst",
        "units": "english",
        "format": "json",
        "application": appName
    }
    if interval:
        queryParams["interval"] = interval
    
    try:
        response = session.get(noaaApiUrl, params=queryParams, timeout=15)
        if response.status_code == 200:
            data = response.json()
            if "error" not in data:
                return data
        return None
    except requests.exceptions.RequestException:
        return None

def runFullMissionCache():
    setupEnvironment()
    
    stats = {
        "totalAttempted": 0,
        "fullSuccess": 0,
        "partialSuccess": 0,
        "failed": 0
    }
    
    # Array to hold our Map UI features
    geoJsonFeatures = []

    with requests.Session() as session:
        print("[*] retrieving station list...")
        metaResponse = session.get(stationMetadataUrl)
        if metaResponse.status_code != 200:
            print("[!] critical failure: could not fetch station list.")
            return

        stationsList = metaResponse.json().get('stations', [])
        print(f"[*] found {len(stationsList)} stations. starting FULL pull...\n")
        
        # PRODUCTION: Processing all stations (No slicing)
        for station in stationsList:
            stationId = station.get('id')
            stationName = station.get('name')
            stats["totalAttempted"] += 1
            print(f"--- processing: {stationId} ({stationName}) ---")
            
            # 1. Build GeoJSON Feature for the Map UI
            try:
                lon = float(station.get('lng', 0))
                lat = float(station.get('lat', 0))
                geoJsonFeatures.append({
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [lon, lat] # GeoJSON standard is [longitude, latitude]
                    },
                    "properties": {
                        "stationId": stationId,
                        "name": stationName
                    }
                })
            except ValueError:
                print(f"[!] Warning: Invalid coordinates for {stationId}. Skipping map index.")

            # 2. Setup Detail Object
            unifiedData = {
                "stationId": stationId,
                "stationName": stationName,
                "coordinates": f"{lat}, {lon}",
                "lastUpdatedUTC": datetime.utcnow().isoformat(),
                "predictions": [],
                "hiloPredictions": [],
                "observations": []
            }

            successCount = 0

            # Fetch 6-minute predictions
            predData = fetchProductData(session, stationId, "predictions")
            if predData and "predictions" in predData:
                unifiedData["predictions"] = predData["predictions"]
                successCount += 1
            time.sleep(0.5)

            # Fetch Hi/Lo predictions
            hiloData = fetchProductData(session, stationId, "predictions", interval="hilo")
            if hiloData and "predictions" in hiloData:
                unifiedData["hiloPredictions"] = hiloData["predictions"]
                successCount += 1
            time.sleep(0.5)

            # Fetch water level observations
            obsData = fetchProductData(session, stationId, "water_level")
            if obsData and "data" in obsData:
                unifiedData["observations"] = obsData["data"]
                successCount += 1
            time.sleep(0.5)

            # Save detailed file
            fileName = f"{stationId}.json"
            fileFullPath = os.path.join(baseOutputPath, fileName)
            with open(fileFullPath, 'w') as jsonFile:
                json.dump(unifiedData, jsonFile, indent=4)

            if successCount == 3:
                stats["fullSuccess"] += 1
                print(f"[SUCCESS] {fileName} saved (All Data Present)\n")
            elif successCount > 0:
                stats["partialSuccess"] += 1
                print(f"[WARNING] {fileName} saved (Partial Data - {successCount}/3 products)\n")
            else:
                stats["failed"] += 1
                print(f"[FAILED] {stationId} - No valid data found.\n")

    # Save the lightweight GeoJSON Index
    geoJsonIndex = {
        "type": "FeatureCollection",
        "features": geoJsonFeatures
    }
    indexFullPath = os.path.join(baseOutputPath, "stationIndex.geojson")
    with open(indexFullPath, 'w') as indexFile:
        json.dump(geoJsonIndex, indexFile, indent=4)
    print(f"[*] Map Index Saved: stationIndex.geojson ({len(geoJsonFeatures)} points)")

    # Final Mission Summary
    print("\n" + "="*40)
    print("      MISSION SUMMARY REPORT      ")
    print("="*40)
    print(f"Total Stations Attempted: {stats['totalAttempted']}")
    print(f"Full Success (All Data):  {stats['fullSuccess']}")
    print(f"Partial Success (Missing):{stats['partialSuccess']}")
    print(f"Failed (No Data Saved):   {stats['failed']}")
    print("="*40 + "\n")

if __name__ == "__main__":
    runFullMissionCache()
