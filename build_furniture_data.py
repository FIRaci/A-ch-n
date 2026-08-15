#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Arknights Furniture & Theme Data Compiler
Extracts, categorizes, and indexes all 2,780+ furniture items and 135+ themes from Arknights game data.
Generates web/furniture_data.js and web/furniture_data.json.
"""

import os
import sys
import json
import requests

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(ROOT_DIR, "web")
BUILDING_DATA_URL = "https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/excel/building_data.json"
FURNITURE_CDN = "https://torappu.prts.wiki/assets/furniture/"

def fetch_building_data():
    print("[*] Đang tải building_data.json từ ArknightsGameData...")
    sess = requests.Session()
    sess.headers.update({"User-Agent": "Mozilla/5.0"})
    resp = sess.get(BUILDING_DATA_URL, timeout=25)
    if resp.status_code != 200:
        raise RuntimeError(f"Failed to fetch building_data.json: HTTP {resp.status_code}")
    return resp.json()

def classify_furniture_type(item):
    """
    Classifies furniture into intuitive game categories & interaction types:
    - BED: Sleep interaction
    - SEAT: Sit interaction (CHAIR, SOFA, STOOL, BENCH, BARSTOOL)
    - TABLE: Dining, desk, counters
    - INTERACTIVE: Custom device or arcade interactions
    - DECORATION: Floor, wall, plant, lighting, or poster decorations
    - WALL_FLOOR: Wallpapers, flooring, carpets
    """
    sub_type = item.get("subType", "NONE")
    loc = item.get("location", "FLOOR")
    name = item.get("name", "")
    fid = item.get("id", "").lower()
    
    # 1. Beds
    if "床" in name or "bed" in fid or "sleeping" in fid or "cushion" in fid and loc == "FLOOR":
        if "床头柜" not in name and "table" not in fid:
            return "BED", "Sleep"
            
    # 2. Seats (Chairs, Sofas, Stools, Benches)
    if sub_type in ("CHAIR", "SOFA", "STOOL", "BENCH", "BARSTOOL") or any(k in name for k in ["椅", "凳", "沙发", "榻", "座"]):
        return "SEAT", "Sit"
        
    # 3. Tables / Desks / Counters
    if sub_type in ("CATERING", "DRESSING") or any(k in name for k in ["桌", "台", "几", "柜", "架"]):
        return "TABLE", "Relax"
        
    # 4. Interactive Devices (Arcades, Jukeboxes, Kitchens, Games)
    if sub_type in ("DEVICE", "ENTERTAINMENT", "MUSIC", "COOKING", "INSTRUMENT_D", "INSTRUMENT_WD") or item.get("interactType") not in (None, "NONE", ""):
        return "INTERACTIVE", "Interact"
        
    # 5. Wall / Floor covering
    if loc in ("WALL", "CEILING", "CARPET"):
        return "WALL_FLOOR", "None"
        
    # 6. Default decorations
    return "DECORATION", "None"

def build_data():
    raw_data = fetch_building_data()
    custom_data = raw_data.get("customData", {})
    furnitures_raw = custom_data.get("furnitures", {})
    themes_raw = custom_data.get("themes", {})
    groups_raw = custom_data.get("groups", {})

    print(f"[*] Xử lý {len(furnitures_raw)} món đồ nội thất và {len(themes_raw)} bộ chủ đề...")

    clean_furnitures = {}
    for fid, f in furnitures_raw.items():
        cat, anim = classify_furniture_type(f)
        icon_id = f.get("iconId") or fid
        clean_furnitures[fid] = {
            "id": fid,
            "name": f.get("name", fid),
            "category": cat,           # BED, SEAT, TABLE, INTERACTIVE, DECORATION, WALL_FLOOR
            "anim": anim,               # Sleep, Sit, Interact, Relax, None
            "subType": f.get("subType", "NONE"),
            "location": f.get("location", "FLOOR"),
            "width": f.get("width", 1),
            "depth": f.get("depth", 1),
            "height": f.get("height", 1),
            "comfort": f.get("comfort", 10),
            "icon": f"{FURNITURE_CDN}{icon_id}.png",
            "iconId": icon_id,
            "desc": f.get("usage", "") or f.get("description", "")
        }

    clean_themes = []
    for tid, t in themes_raw.items():
        furn_ids = t.get("furnitures", [])
        theme_items = [clean_furnitures[i] for i in furn_ids if i in clean_furnitures]
        if not theme_items:
            continue
            
        clean_themes.append({
            "id": tid,
            "name": t.get("name", tid),
            "desc": t.get("desc", ""),
            "comfort": t.get("comfort", 0),
            "items_count": len(theme_items),
            "furniture_ids": furn_ids
        })

    # Sort themes by count of furniture descending
    clean_themes.sort(key=lambda x: -x["items_count"])

    output_payload = {
        "themes": clean_themes,
        "furnitures": clean_furnitures,
        "total_furnitures": len(clean_furnitures),
        "total_themes": len(clean_themes),
        "categories": ["ALL", "BED", "SEAT", "TABLE", "INTERACTIVE", "DECORATION", "WALL_FLOOR"]
    }

    # 1. Save JSON
    json_path = os.path.join(WEB_DIR, "furniture_data.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(output_payload, f, ensure_ascii=False, indent=2)

    # 2. Save JS (for direct web script inclusion without CORS issues)
    js_path = os.path.join(WEB_DIR, "furniture_data.js")
    with open(js_path, "w", encoding="utf-8") as f:
        f.write("window.ALL_FURNITURE_DATA = " + json.dumps(output_payload, ensure_ascii=False) + ";\n")

    print(f"[✓] Đã tạo thành công:")
    print(f"    -> {json_path} ({os.path.getsize(json_path) // 1024} KB)")
    print(f"    -> {js_path} ({os.path.getsize(js_path) // 1024} KB)")
    print(f"[*] Top 5 chủ đề nổi bật: {[t['name'] for t in clean_themes[:5]]}")

if __name__ == "__main__":
    build_data()
