#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Arknights Dormitory 36x8 Layout & Coordinate Builder
Transforms Arknights dormitory quickSetup grid coordinates into 2.5D world coordinates,
resolves collision bounding boxes, calculates Painter's Algorithm z-indices,
and generates character interaction anchor points.
"""

import os
import sys
import json
import argparse
from typing import Dict, Any, List, Optional

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

# Canonical Arknights Dormitory Constants
DORM_GRID_COLS = 36   # X: 0 .. 35
DORM_GRID_ROWS = 8    # Y: 0 .. 7 (Floor depth)

DEFAULT_TILE_W = 34.0 # Pixel width per tile column
DEFAULT_TILE_H = 22.0 # Pixel height per tile row (depth projection)

def build_room_layout(
    theme_id: str,
    catalog: Dict[str, Any],
    origin_x: float = 2400.0,
    horizon_y: float = 280.0,
    tile_w: float = DEFAULT_TILE_W,
    tile_h: float = DEFAULT_TILE_H
) -> Dict[str, Any]:
    """
    Build a pixel-accurate 2.5D room layout from a theme's quickSetup array.
    """
    theme = catalog.get('themes', {}).get(theme_id)
    if not theme:
        # Search by name
        for tid, t in catalog.get('themes', {}).items():
            if theme_id.lower() in tid.lower() or theme_id.lower() in t.get('name', '').lower():
                theme = t
                theme_id = tid
                break

    if not theme:
        raise ValueError(f"Theme '{theme_id}' not found in catalog.")

    quick_setup = theme.get('quickSetup', [])
    items_catalog = catalog.get('items', {})

    placed_furniture = []
    wallpapers = []
    floors = []

    for idx, setup in enumerate(quick_setup):
        fid = setup.get('furnitureId')
        item_meta = items_catalog.get(fid, {})

        location = item_meta.get('location', 'FLOOR')
        sub_type = item_meta.get('subType', 'DECORATION')
        anim_mapping = item_meta.get('animMapping', 'Relax')

        grid_x = setup.get('gridX', 0)
        grid_y = setup.get('gridY', 0)
        dir_rot = setup.get('dir', 0) # 0 = front, 1 = rotated / mirrored

        raw_w = item_meta.get('width', 1)
        raw_d = item_meta.get('depth', 1)
        raw_h = item_meta.get('height', 1)

        # If rotated, swap width and depth footprint
        foot_w = raw_d if dir_rot == 1 else raw_w
        foot_d = raw_w if dir_rot == 1 else raw_d

        # ── 2.5D Coordinate Projection ──
        if location in ['WALLPAPER', 'WALL']:
            world_x = origin_x + (grid_x + raw_w / 2.0) * tile_w
            world_y = horizon_y - (grid_y * 18.0) - 20.0
            z_index = -50 + grid_y
            is_walkable = True
        elif location == 'CEILING':
            world_x = origin_x + (grid_x + raw_w / 2.0) * tile_w
            world_y = 60.0 + grid_y * 12.0
            z_index = -80
            is_walkable = True
        elif location == 'CARPET':
            world_x = origin_x + (grid_x + foot_w / 2.0) * tile_w
            world_y = horizon_y + (grid_y + foot_d / 2.0) * tile_h
            z_index = -10 + grid_y
            is_walkable = True
        elif location == 'FLOOR_MAT':
            world_x = origin_x + (grid_x + foot_w / 2.0) * tile_w
            world_y = horizon_y + (grid_y + foot_d / 2.0) * tile_h
            z_index = -5
            is_walkable = True
        else: # Standard FLOOR furniture
            world_x = origin_x + (grid_x + foot_w / 2.0) * tile_w
            world_y = horizon_y + (grid_y + foot_d) * tile_h
            # Painter's Algorithm Depth: rows in front render on top of rows in back
            z_index = int(grid_y * 1000 + grid_x)
            is_walkable = False

        # Interaction anchor calculation
        has_interaction = (anim_mapping in ['Sit', 'Sleep', 'Interact', 'Special'])
        interact_point = None
        if has_interaction:
            # Interaction anchor sits slightly in front / center of item
            interact_point = {
                'x': round(world_x, 1),
                'y': round(world_y + (4.0 if location == 'FLOOR' else 15.0), 1),
                'anim': anim_mapping,
                'prompt': f"{'Ngồi' if anim_mapping == 'Sit' else ('Nằm' if anim_mapping == 'Sleep' else 'Tương tác')} ({anim_mapping})"
            }

        obj = {
            'uid': f"furni_{theme_id}_{idx}_{fid}",
            'furnitureId': fid,
            'name': item_meta.get('name', fid),
            'location': location,
            'subType': sub_type,
            'interactType': item_meta.get('interactType', 'NONE'),
            'animMapping': anim_mapping,
            'gridX': grid_x,
            'gridY': grid_y,
            'dir': dir_rot,
            'width': raw_w,
            'depth': raw_d,
            'height': raw_h,
            'worldX': round(world_x, 1),
            'worldY': round(world_y, 1),
            'zIndex': z_index,
            'comfort': item_meta.get('comfort', 0),
            'hasInteraction': has_interaction,
            'interactPoint': interact_point,
            'imageUrl': item_meta.get('imageUrl', '')
        }

        if location == 'WALLPAPER':
            wallpapers.append(obj)
        elif location == 'FLOOR_MAT':
            floors.append(obj)
        else:
            placed_furniture.append(obj)

    # Sort furniture by zIndex for proper layer rendering (back to front)
    placed_furniture.sort(key=lambda o: o['zIndex'])

    return {
        'themeId': theme_id,
        'themeName': theme.get('name'),
        'totalComfort': theme.get('totalComfort', 0),
        'previewImageUrl': theme.get('previewImageUrl', ''),
        'roomBounds': {
            'originX': origin_x,
            'horizonY': horizon_y,
            'gridCols': DORM_GRID_COLS,
            'gridRows': DORM_GRID_ROWS,
            'tileW': tile_w,
            'tileH': tile_h,
            'totalWidth': DORM_GRID_COLS * tile_w,
            'totalHeight': DORM_GRID_ROWS * tile_h
        },
        'wallpapers': wallpapers,
        'floors': floors,
        'furniture': placed_furniture
    }

def export_as_javascript(room_layout: Dict[str, Any], output_path: str):
    var_name = f"DORM_PRESET_{room_layout['themeId'].upper().replace('-', '_')}"
    js_content = f"// Auto-generated Arknights Dormitory Layout Preset: {room_layout.get('themeName')}\n"
    js_content += f"window.{var_name} = {json.dumps(room_layout, indent=2, ensure_ascii=False)};\n"
    
    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else '.', exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(js_content)
    print(f"[✓] Exported JavaScript preset to {output_path}")

def main():
    parser = argparse.ArgumentParser(description="Arknights Dormitory Layout Builder")
    parser.add_argument('--catalog', type=str, default='web/furniture_database.json', help='Path to furniture database JSON')
    parser.add_argument('--theme', type=str, default='furni_set_BSsafehouse', help='Theme ID or Name to build (e.g. furni_set_BSsafehouse)')
    parser.add_argument('--out-json', type=str, default='', help='Path to export JSON layout')
    parser.add_argument('--out-js', type=str, default='', help='Path to export JS preset')
    args = parser.parse_args()

    if not os.path.exists(args.catalog):
        print(f"[-] Catalog file '{args.catalog}' not found. Run crawl_furniture.py first.")
        sys.exit(1)

    with open(args.catalog, 'r', encoding='utf-8') as f:
        catalog = json.load(f)

    room_layout = build_room_layout(args.theme, catalog)
    print(f"[+] Built layout for '{room_layout['themeName']}' ({room_layout['themeId']}):")
    print(f"    - Placed furniture: {len(room_layout['furniture'])} items")
    print(f"    - Total room comfort: {room_layout['totalComfort']} pts")

    if args.out_json:
        with open(args.out_json, 'w', encoding='utf-8') as f:
            json.dump(room_layout, f, indent=2, ensure_ascii=False)
        print(f"[✓] Exported layout JSON to {args.out_json}")

    if args.out_js:
        export_as_javascript(room_layout, args.out_js)

if __name__ == '__main__':
    main()
