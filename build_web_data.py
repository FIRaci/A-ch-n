import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open("operators_index.json", "r", encoding="utf-8") as f:
    ops = json.load(f)

# Sort operators by rarity descending (TIER_6 -> TIER_1) then by name
rarity_order = {
    "TIER_6": 6,
    "TIER_5": 5,
    "TIER_4": 4,
    "TIER_3": 3,
    "TIER_2": 2,
    "TIER_1": 1
}

sorted_ops = []
for cid, info in ops.items():
    r_val = rarity_order.get(info.get("rarity", ""), 0)
    sorted_ops.append({
        "id": cid,
        "name_cn": info.get("name_cn", cid),
        "name_en": info.get("name_en", cid),
        "rarity": r_val,
        "profession": info.get("profession", "UNKNOWN"),
        "skins_count": info.get("skins_count", 1)
    })

sorted_ops.sort(key=lambda x: (-x["rarity"], x["name_en"]))

print(f"Total processed operators: {len(sorted_ops)}")
print("Top 5 6-star operators:", [(o["name_cn"], o["name_en"]) for o in sorted_ops[:5]])

js_content = "window.ALL_OPERATORS = " + json.dumps(sorted_ops, ensure_ascii=False, indent=2) + ";"

with open("web/operators_data.js", "w", encoding="utf-8") as f:
    f.write(js_content)

print("Saved web/operators_data.js successfully.")
