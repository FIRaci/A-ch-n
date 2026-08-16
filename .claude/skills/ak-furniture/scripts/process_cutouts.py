#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Arknights Furniture Background Stripper & Cutout Generator
Processes Arknights furniture thumbnail cards (226x169 with gradient background),
removes the gradient background cleanly using BFS flood-fill and gradient distance,
and outputs 100% transparent PNG sprite cutouts trimmed to their tight bounding box.
"""

import os
import sys
import argparse
import numpy as np
from PIL import Image

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

def strip_furniture_background(input_path: str, output_path: str) -> bool:
    try:
        raw_img = Image.open(input_path).convert('RGBA')
    except Exception as e:
        print(f"[-] Cannot open image {input_path}: {e}")
        return False

    w, h = raw_img.size
    arr = np.array(raw_img)

    # Arknights furniture thumbnail background model:
    # Vertical neutral linear gradient from ~160 (top row y=0) to ~255 (bottom row y=h-1)
    rgb = arr[:, :, :3].astype(float)
    expected_bg = np.linspace(160, 255, h)[:, None, None]
    
    # Color difference from expected gradient
    diff = np.abs(rgb - expected_bg)
    max_diff = np.max(diff, axis=2)
    
    # Saturation difference (R, G, B should be almost identical in grey background)
    sat = np.max(rgb, axis=2) - np.min(rgb, axis=2)
    
    # Background candidate mask (low saturation and near expected gradient, or pure white)
    bg_candidate = ((max_diff < 28) & (sat < 20)) | (np.min(rgb, axis=2) > 248)

    # BFS Floodfill from 4 borders to remove only outer background
    visited = np.zeros((h, w), dtype=bool)
    queue = []

    # Seed top and bottom borders
    for x in range(w):
        if bg_candidate[0, x]:
            queue.append((0, x))
            visited[0, x] = True
        if bg_candidate[h - 1, x]:
            queue.append((h - 1, x))
            visited[h - 1, x] = True

    # Seed left and right borders
    for y in range(h):
        if bg_candidate[y, 0] and not visited[y, 0]:
            queue.append((y, 0))
            visited[y, 0] = True
        if bg_candidate[y, w - 1] and not visited[y, w - 1]:
            queue.append((y, w - 1))
            visited[y, w - 1] = True

    head = 0
    while head < len(queue):
        cy, cx = queue[head]
        head += 1

        for ny, nx in [(cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)]:
            if 0 <= ny < h and 0 <= nx < w:
                if not visited[ny, nx] and bg_candidate[ny, nx]:
                    visited[ny, nx] = True
                    queue.append((ny, nx))

    # All visited background pixels get alpha = 0
    alpha = np.where(visited, 0, 255).astype(np.uint8)

    # Bounding box crop
    coords = np.argwhere(alpha > 0)
    if coords.size > 0:
        min_y, min_x = coords.min(axis=0)
        max_y, max_x = coords.max(axis=0) + 1
        cropped_rgb = arr[min_y:max_y, min_x:max_x, :3]
        cropped_alpha = alpha[min_y:max_y, min_x:max_x, None]
        result = np.concatenate([cropped_rgb, cropped_alpha], axis=2)
    else:
        result = np.dstack([arr[:, :, :3], alpha])

    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else '.', exist_ok=True)
    out_img = Image.fromarray(result.astype(np.uint8))
    out_img.save(output_path, 'PNG')
    print(f"[+] Cleaned: {input_path} -> {output_path} ({out_img.size[0]}x{out_img.size[1]}px)")
    return True

def process_directory(input_dir: str, output_dir: str):
    print(f"[*] Processing directory: {input_dir} -> {output_dir}")
    os.makedirs(output_dir, exist_ok=True)
    success = 0
    for root, _, files in os.walk(input_dir):
        for file in files:
            if file.lower().endswith('.png') and not file.endswith('_preview.png'):
                in_path = os.path.join(root, file)
                rel = os.path.relpath(in_path, input_dir)
                out_path = os.path.join(output_dir, rel)
                if strip_furniture_background(in_path, out_path):
                    success += 1
    print(f"[✓] Processed {success} transparent furniture cutout sprites!")

def main():
    parser = argparse.ArgumentParser(description="Arknights Furniture Background Stripper & Cutout Generator")
    parser.add_argument('--input', type=str, default='', help='Single input PNG path')
    parser.add_argument('--output', type=str, default='', help='Single output PNG path')
    parser.add_argument('--input-dir', type=str, default='', help='Input directory with furniture PNGs')
    parser.add_argument('--output-dir', type=str, default='', help='Output directory for transparent PNGs')
    args = parser.parse_args()

    if args.input and args.output:
        strip_furniture_background(args.input, args.output)
    elif args.input_dir and args.output_dir:
        process_directory(args.input_dir, args.output_dir)
    else:
        parser.print_help()

if __name__ == '__main__':
    main()
