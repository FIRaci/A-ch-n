#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Arknights Dormitory Furniture & Theme Crawler
Fetches building_data.json from official Arknights game data repositories and PRTS Wiki,
extracts all 135+ room themes, 2,780+ furniture items, tile dimensions, interaction tags,
preset layout quickSetup coordinates, and Torappu CDN image assets.
"""

import os
import sys
import json
import argparse
import urllib.request
from typing import Dict, Any, List, Optional

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

GAME_DATA_URL = 'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/excel/building_data.json'
CDN_FURNI_BASE = 'https://torappu.prts.wiki/assets/furniture/'
CDN_THEME_BASE = 'https://torappu.prts.wiki/assets/furniture_theme/'

def fetch_json(url: str) -> Dict[str, Any]:
    print(f"[*] Fetching game data from: {url}")
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode('utf-8'))

def parse_furniture_catalog(data: Dict[str, Any]) -> Dict[str, Any]:
    custom_data = data.get('customData', {})
    raw_furnitures = custom_data.get('furnitures', {})
    raw_themes = custom_data.get('themes', {})
    raw_groups = custom_data.get('groups', {})
    raw_types = custom_data.get('types', {})
    raw_subtypes = custom_data.get('subTypes', {})

    print(f"[+] Total raw furnitures: {len(raw_furnitures)}")
    print(f"[+] Total raw themes: {len(raw_themes)}")

    # Process items
    processed_items = {}
    for fid, item in raw_furnitures.items():
        # Determine interaction mapping
        interact_type = item.get('interactType', 'NONE')
        sub_type = item.get('subType', 'DECORATION')
        
        anim_mapping = 'Relax'
        if sub_type in ['CHAIR', 'SOFA', 'STOOL', 'BENCH']:
            anim_mapping = 'Sit'
        elif sub_type in ['BED', 'REST']:
            anim_mapping = 'Sleep'
        elif interact_type != 'NONE' or sub_type in ['INSTRUMENT', 'ARCADE', 'GAME', 'TARGET']:
            anim_mapping = 'Interact'

        processed_items[fid] = {
            'id': item.get('id', fid),
            'name': item.get('name', ''),
            'description': item.get('description', ''),
            'usage': item.get('usage', ''),
            'themeId': item.get('themeId', ''),
            'groupId': item.get('groupId', ''),
            'location': item.get('location', 'FLOOR'),      # FLOOR, WALL, CEILING, CARPET, WALLPAPER, FLOOR_MAT
            'type': item.get('type', 'DECORATION'),
            'subType': sub_type,
            'interactType': interact_type,
            'animMapping': anim_mapping,
            'width': item.get('width', 1),                  # X grid tiles
            'depth': item.get('depth', 1),                  # Y grid tiles (depth into room)
            'height': item.get('height', 1),                # Vertical height in grid tiles
            'comfort': item.get('comfort', 0),
            'rarity': item.get('rarity', 1),
            'enableRotate': item.get('enableRotate', True),
            'imageUrl': f"{CDN_FURNI_BASE}{fid}.png"
        }

    # Process themes
    processed_themes = {}
    for tid, theme in raw_themes.items():
        quick_setup = theme.get('quickSetup', [])
        
        # Calculate full theme comfort
        theme_items = [processed_items.get(fid) for fid in theme.get('furnitures', []) if fid in processed_items]
        total_comfort = sum(item.get('comfort', 0) for item in theme_items)

        # Enrich quickSetup layout with item metadata
        resolved_layout = []
        for pos in quick_setup:
            fid = pos.get('furnitureId')
            item_meta = processed_items.get(fid)
            if item_meta:
                resolved_layout.append({
                    'furnitureId': fid,
                    'name': item_meta.get('name'),
                    'location': item_meta.get('location'),
                    'subType': item_meta.get('subType'),
                    'animMapping': item_meta.get('animMapping'),
                    'gridX': pos.get('pos0', 0),           # 0 .. 35
                    'gridY': pos.get('pos1', 0),           # 0 .. 7 (floor) or wall pos
                    'dir': pos.get('dir', 0),              # 0 = normal, 1 = rotated
                    'width': item_meta.get('width', 1),
                    'depth': item_meta.get('depth', 1),
                    'height': item_meta.get('height', 1),
                    'imageUrl': item_meta.get('imageUrl')
                })

        processed_themes[tid] = {
            'id': tid,
            'name': theme.get('name', ''),
            'desc': theme.get('desc', ''),
            'themeType': theme.get('themeType', 'EVENT'),
            'totalComfort': total_comfort,
            'previewImageUrl': f"{CDN_THEME_BASE}{tid}.png",
            'itemCount': len(theme.get('furnitures', [])),
            'furnitures': theme.get('furnitures', []),
            'quickSetup': resolved_layout
        }

    return {
        'metadata': {
            'version': '1.0.0',
            'source': 'Arknights Game Data / PRTS Wiki',
            'totalThemes': len(processed_themes),
            'totalItems': len(processed_items)
        },
        'themes': processed_themes,
        'items': processed_items
    }

def download_theme_assets(theme_data: Dict[str, Any], output_dir: str):
    os.makedirs(output_dir, exist_ok=True)
    print(f"[*] Downloading assets for theme: {theme_data.get('name')} to {output_dir}")
    
    # Download preview image
    preview_url = theme_data.get('previewImageUrl')
    if preview_url:
        preview_path = os.path.join(output_dir, f"{theme_data.get('id')}_preview.png")
        try:
            req = urllib.request.Request(preview_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=15) as resp:
                with open(preview_path, 'wb') as f:
                    f.write(resp.read())
            print(f"  [+] Saved theme preview: {preview_path}")
        except Exception as e:
            print(f"  [-] Failed to download preview {preview_url}: {e}")

    # Download each furniture item sprite
    for item in theme_data.get('quickSetup', []):
        img_url = item.get('imageUrl')
        fid = item.get('furnitureId')
        if img_url and fid:
            img_path = os.path.join(output_dir, f"{fid}.png")
            if os.path.exists(img_path):
                continue
            try:
                req = urllib.request.Request(img_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=15) as resp:
                    with open(img_path, 'wb') as f:
                        f.write(resp.read())
                print(f"  [+] Downloaded item sprite: {fid}.png")
            except Exception as e:
                print(f"  [-] Failed to download {img_url}: {e}")

def main():
    parser = argparse.ArgumentParser(description="Arknights Furniture & Room Preset Crawler")
    parser.add_argument('--all', action='store_true', help='Crawl all furniture themes and items')
    parser.add_argument('--theme', type=str, default='', help='Specific theme name or ID (e.g. 黑钢安全屋 / furni_set_bs)')
    parser.add_argument('--output', type=str, default='web/furniture_database.json', help='Output JSON path')
    parser.add_argument('--download-assets', action='store_true', help='Download furniture sprites and preview images')
    parser.add_argument('--asset-dir', type=str, default='web/assets/furniture', help='Directory to save downloaded sprites')
    args = parser.parse_args()

    # 1. Fetch data
    raw_data = fetch_json(GAME_DATA_URL)

    # 2. Parse into normalized structure
    catalog = parse_furniture_catalog(raw_data)

    # 3. Filter if requested
    if args.theme:
        query = args.theme.lower()
        matched_themes = {
            tid: t for tid, t in catalog['themes'].items()
            if query in tid.lower() or query in t.get('name', '').lower()
        }
        if not matched_themes:
            print(f"[-] No theme found matching '{args.theme}'")
            sys.exit(1)

        print(f"[+] Found {len(matched_themes)} matching theme(s):")
        for tid, t in matched_themes.items():
            print(f"    - {tid}: {t.get('name')} ({len(t.get('quickSetup', []))} layout items)")
            if args.download_assets:
                download_theme_assets(t, os.path.join(args.asset_dir, tid))

    # 4. Save output JSON
    os.makedirs(os.path.dirname(args.output) if os.path.dirname(args.output) else '.', exist_ok=True)
    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(catalog, f, indent=2, ensure_ascii=False)
    print(f"[✓] Saved furniture catalog to {args.output} ({len(catalog['themes'])} themes, {len(catalog['items'])} items)")

if __name__ == '__main__':
    main()
