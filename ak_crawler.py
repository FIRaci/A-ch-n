#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Arknights Spine Chibi Model Downloader & Asset Extractor
Crawl & download Spine 2D models (.skel, .atlas, .png) for all Arknights operators from PRTS wiki / Torappu CDN.
"""

import os
import sys
import json
import argparse
import time
import concurrent.futures
from typing import List, Dict, Optional, Tuple
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Ensure utf-8 output on Windows consoles
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

CDN_BASE = "https://torappu.prts.wiki/assets/char_spine"
INDEX_FILE = os.path.join(os.path.dirname(__file__), "operators_index.json")

MODEL_TYPE_MAP = {
    "build": "基建",
    "front": "正面",
    "back": "背面",
    "all": "all"
}


def create_session() -> requests.Session:
    session = requests.Session()
    retries = Retry(
        total=3,
        backoff_factor=0.5,
        status_forcelist=[500, 502, 503, 504],
        raise_on_status=False
    )
    adapter = HTTPAdapter(max_retries=retries, pool_connections=20, pool_maxsize=20)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": "https://prts.wiki/"
    })
    return session


def load_operators_index() -> Dict[str, dict]:
    if os.path.exists(INDEX_FILE):
        try:
            with open(INDEX_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[!] Warning: Failed to load {INDEX_FILE}: {e}")
    return {}


def normalize_text(text: str) -> str:
    import unicodedata
    n = unicodedata.normalize('NFKD', text)
    # Convert special latin characters like ł -> l
    n = n.replace('ł', 'l').replace('Ł', 'l').replace('²', '2')
    return ''.join(c for c in n if not unicodedata.combining(c)).lower()


def find_operator_id(query: str, index: Dict[str, dict]) -> Optional[Tuple[str, str]]:
    """Find operator by CN name, EN name, or ID."""
    q_norm = normalize_text(query.strip())
    
    # 1. Exact match
    for cid, info in index.items():
        cid_norm = normalize_text(cid)
        cn_norm = normalize_text(info.get("name_cn", ""))
        en_norm = normalize_text(info.get("name_en", ""))
        if q_norm in (cid_norm, cn_norm, en_norm):
            return cid, info.get("name_cn", cid)
            
    # 2. Substring match
    for cid, info in index.items():
        cid_norm = normalize_text(cid)
        cn_norm = normalize_text(info.get("name_cn", ""))
        en_norm = normalize_text(info.get("name_en", ""))
        if q_norm in cid_norm or q_norm in cn_norm or q_norm in en_norm:
            return cid, info.get("name_cn", cid)
            
    # 3. Direct char_ id fallback
    if query.startswith("char_"):
        return query, query
        
    return None


def fetch_operator_meta(session: requests.Session, char_id: str) -> Optional[dict]:
    url = f"{CDN_BASE}/{char_id}/meta.json"
    try:
        resp = session.get(url, timeout=12)
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        pass
    return None


def download_file(session: requests.Session, url: str, dest_path: str) -> bool:
    try:
        resp = session.get(url, timeout=20)
        if resp.status_code == 200 and len(resp.content) > 0:
            os.makedirs(os.path.dirname(dest_path), exist_ok=True)
            with open(dest_path, "wb") as f:
                f.write(resp.content)
            return True
    except Exception as e:
        pass
    return False


def download_operator(
    char_id: str,
    char_display_name: str,
    output_dir: str,
    model_types: List[str] = ["基建"],
    download_all_skins: bool = False,
    session: Optional[requests.Session] = None
) -> Tuple[bool, str, List[str]]:
    """
    Downloads Spine models (.skel, .atlas, .png) for a given operator.
    """
    if session is None:
        session = create_session()

    meta = fetch_operator_meta(session, char_id)
    if not meta:
        return False, f"Operator meta not found on CDN for {char_id}", []

    actual_name = meta.get("name") or char_display_name
    prefix = meta.get("prefix", f"{CDN_BASE}/{char_id}/")
    skins = meta.get("skin", {})

    if not skins:
        return False, f"No skins found for {actual_name}", []

    target_skins = {}
    if download_all_skins:
        target_skins = skins
    else:
        # Default skin
        if "默认" in skins:
            target_skins["默认"] = skins["默认"]
        else:
            first_key = list(skins.keys())[0]
            target_skins[first_key] = skins[first_key]

    char_folder = os.path.join(output_dir, actual_name)
    os.makedirs(char_folder, exist_ok=True)

    downloaded_files = []

    for skin_name, model_groups in target_skins.items():
        for m_type in model_types:
            if m_type not in model_groups:
                continue
            file_rel = model_groups[m_type].get("file")
            if not file_rel:
                continue

            for ext in [".skel", ".atlas", ".png"]:
                asset_url = f"{prefix}{file_rel}{ext}"
                clean_skin = skin_name.replace("/", "_").replace("\\", "_")
                filename = f"{actual_name}_{clean_skin}_{m_type}{ext}"
                dest = os.path.join(char_folder, filename)

                if download_file(session, asset_url, dest):
                    downloaded_files.append(filename)

    # Save meta.json
    with open(os.path.join(char_folder, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    if downloaded_files:
        return True, f"Successfully downloaded {len(downloaded_files)} assets for {actual_name}", downloaded_files
    else:
        return False, f"No assets could be downloaded for {actual_name}", []


def list_operators(index: Dict[str, dict], limit: int = 50):
    print("=" * 65)
    print(f"{'ID':<20} | {'Tên Trung (CN)':<15} | {'Tên Quốc Tế (EN)':<20}")
    print("-" * 65)
    items = list(index.items())[:limit]
    for cid, info in items:
        cn = info.get("name_cn", "-")
        en = info.get("name_en", "-")
        print(f"{cid:<20} | {cn:<15} | {en:<20}")
    print("=" * 65)
    print(f"Tổng cộng hiển thị {len(items)}/{len(index)} nhân vật. (Dùng --list all để xem hết)")


def main():
    parser = argparse.ArgumentParser(
        description="Arknights Spine Chibi Model Downloader for Game Development (PRTS Wiki / Torappu CDN)"
    )
    parser.add_argument("-n", "--name", type=str, help="Tên hoặc ID của nhân vật (ví dụ: '阿米娅', 'Texas', 'Mlynar', 'char_002_amiya')")
    parser.add_argument("--all", action="store_true", help="Tải toàn bộ tất cả nhân vật có trong game (450+ nhân vật)")
    parser.add_argument("--top", type=int, help="Tải top N nhân vật đầu tiên")
    parser.add_argument("-m", "--model", choices=["build", "front", "back", "all"], default="build",
                        help="Loại model: 'build' (Chibi / Base / Ký túc xá - có idle/move/sit/sleep), 'front' (Chiến đấu trước), 'back' (Chiến đấu sau), 'all' (Tất cả)")
    parser.add_argument("-s", "--skin", choices=["default", "all"], default="default",
                        help="Trang phục: 'default' (Trang phục mặc định), 'all' (Tất cả skin)")
    parser.add_argument("-o", "--output", type=str, default="downloads", help="Thư mục lưu file (mặc định: ./downloads)")
    parser.add_argument("-w", "--workers", type=int, default=6, help="Số luồng tải song song (mặc định: 6)")
    parser.add_argument("--list", nargs="?", const="50", help="Liệt kê danh sách nhân vật (ví dụ: --list 30 hoặc --list all)")

    args = parser.parse_args()
    index = load_operators_index()

    if args.list is not None:
        limit = len(index) if args.list.lower() == "all" else int(args.list)
        list_operators(index, limit=limit)
        return

    # Determine model types
    if args.model == "all":
        model_types = ["基建", "正面", "背面"]
    else:
        model_types = [MODEL_TYPE_MAP[args.model]]

    download_all_skins = (args.skin == "all")
    output_dir = os.path.abspath(args.output)
    os.makedirs(output_dir, exist_ok=True)

    print("=" * 60)
    print("🎮 ARKNIGHTS SPINE MODEL CRAWLER & EXTRACTOR")
    print(f"📁 Thư mục lưu: {output_dir}")
    print(f"🎭 Loại model: {args.model} ({', '.join(model_types)})")
    print(f"👗 Skin: {args.skin}")
    print("=" * 60)

    # 1. Single operator
    if args.name:
        found = find_operator_id(args.name, index)
        if not found:
            print(f"[!] Không tìm thấy nhân vật với từ khóa: '{args.name}'")
            return
        cid, display_name = found
        print(f"[*] Đang tải nhân vật: {display_name} ({cid})...")
        session = create_session()
        ok, msg, files = download_operator(
            cid, display_name, output_dir, model_types, download_all_skins, session
        )
        if ok:
            print(f"[✓] {msg}")
            for f in files:
                print(f"    -> {f}")
        else:
            print(f"[✗] {msg}")
        return

    # 2. Batch download (Top N or All)
    target_operators = []
    if args.all:
        target_operators = list(index.items())
    elif args.top:
        target_operators = list(index.items())[:args.top]
    else:
        # Default if no arguments: download popular starters
        popular = ["char_002_amiya", "char_102_texas", "char_4064_mlynar", "char_103_angel", "char_350_surtr", "char_263_skadi"]
        print("[*] Không chỉ định tham số. Tải mẫu 6 nhân vật nổi bật (Amiya, Texas, Mlynar, Exusiai, Surtr, Skadi)...")
        print("[*] Mẹo: Chạy 'python ak_crawler.py --help' để xem các tùy chọn tải khác.")
        for cid in popular:
            info = index.get(cid, {})
            name = info.get("name_cn", cid)
            target_operators.append((cid, info))

    total = len(target_operators)
    print(f"[*] Bắt đầu tải {total} nhân vật với {args.workers} luồng song song...\n")

    success_count = 0
    fail_count = 0

    def task_worker(item):
        cid, info = item
        name = info.get("name_cn", cid) if isinstance(info, dict) else cid
        sess = create_session()
        return download_operator(cid, name, output_dir, model_types, download_all_skins, sess)

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(task_worker, item): item for item in target_operators}
        for future in concurrent.futures.as_completed(futures):
            item = futures[future]
            try:
                ok, msg, files = future.result()
                if ok:
                    success_count += 1
                    print(f"  [✓] {msg}")
                else:
                    fail_count += 1
                    print(f"  [✗] {msg}")
            except Exception as e:
                fail_count += 1
                print(f"  [!] Lỗi khi tải {item}: {e}")

    print("\n" + "=" * 60)
    print(f"🎉 Hoàn thành! Thành công: {success_count}/{total} nhân vật. Thất bại: {fail_count}")
    print(f"📂 Các file đã được lưu tại: {output_dir}")
    print("=" * 60)


if __name__ == "__main__":
    main()
