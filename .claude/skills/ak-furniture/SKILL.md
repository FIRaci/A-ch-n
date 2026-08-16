---
name: ck:ak-furniture
description: Crawl, parse, layout, and simulate Arknights dormitory furniture sets (家具一览) from PRTS Wiki and game data. Use whenever the user wants to fetch furniture sets, reconstruct preset room themes (like Blacksteel Safehouse, Ursus Dormitory), calculate 36x8 grid coordinate layouts, enable interactive drag-and-drop placement, or map Chibi Spine interactions (Sit, Sleep, Interact).
user-invocable: true
when_to_use: "Invoke when crawling or building Arknights dormitory furniture sets, room layouts, and furniture interactions."
category: game-dev
keywords: [arknights, furniture, dormitory, prts-wiki, layout, spine-interaction, 2.5d-room]
argument-hint: "[theme-name or crawl action]"
metadata:
  author: claudekit
  version: "1.0.0"
---

# Arknights Dormitory Furniture & Layout Engine

Comprehensive guide, crawler toolchain, and mathematical specification for extracting Arknights furniture sets from PRTS Wiki / Arknights GameData, reconstructing 36×8 dormitory room layouts, enabling drag-and-drop grid placement, and driving Chibi Spine character interactions.

## Key Capabilities

1. **Automated Data Crawling (`scripts/crawl_furniture.py`)**:
   - Extracts all 135+ room themes (e.g. *Blacksteel Safehouse / 黑钢安全屋*, *Ursus Student Self-Government*, *Penguin Logistics Safehouse*).
   - Extracts all 2,780+ furniture items with tile dimensions (`width × depth × height`), placement locations (`FLOOR`, `WALL`, `CEILING`, `CARPET`), comfort values, and interaction types (`Sit`, `Sleep`, `Interact`, `Music`).
   - Downloads high-resolution isometric sprites from Torappu / PRTS CDN.

2. **Dormitory 36×8 Grid Projection (`scripts/layout_builder.py`)**:
   - Implements Arknights' canonical 36×8 dormitory coordinate system (`pos0` = X: 0..35, `pos1` = Y: 0..7).
   - Maps `quickSetup` preset arrays into pixel-perfect 2.5D world coordinates with Painter's Algorithm depth sorting (`z-index = Y * 1000 + X`).

3. **Chibi Character Interaction Mapping**:
   - Maps furniture subTypes to Chibi Spine animations:
     - `CHAIR`, `SOFA`, `STOOL` ➔ `Sit` animation + seat anchor offset.
     - `BED`, `REST_POD` ➔ `Sleep` animation + mattress center offset.
     - `INSTRUMENT`, `ARCADE`, `TARGET` ➔ `Interact` / `Special` animation.

---

## 1. Quick Start Workflow

### Step 1: Crawl Furniture & Room Presets
Run the automated crawler to fetch all furniture themes, preset layouts, and sprite manifests:

```bash
python .claude/skills/ak-furniture/scripts/crawl_furniture.py --theme "黑钢安全屋" --download-assets
```

To crawl the entire game catalog (135+ themes, 2,780+ items):
```bash
python .claude/skills/ak-furniture/scripts/crawl_furniture.py --all --output web/furniture_database.json
```

### Step 2: Build a Room Preset Layout
Use the layout builder to convert Arknights `quickSetup` coordinates into 2.5D canvas render objects:

```bash
python .claude/skills/ak-furniture/scripts/layout_builder.py --theme "furni_set_bs" --out-js web/dorm_preset_bs.js
```

---

## 2. Arknights Dormitory Grid Specification

The official Arknights Dormitory uses a dual-plane coordinate grid:

```
                  ◄───────────────── 36 Tiles (X: 0 .. 35) ─────────────────►
  ▲  Y: 0 (Wall) ┌───────────────────────────────────────────────────────────┐
  │              │  WALL LAYER: Posters, Bulletin Boards, Wall Lights, Pipes │
  │  Horizon ─── ├───────────────────────────────────────────────────────────┤
  │  Y: 0 (Floor)│ [0,0]                                              [35,0] │
  │  Y: 1        │                                                           │
  │  Y: 2        │                                                           │
  │  Y: 3        │             FLOOR LAYER (36 × 8 Grid)                     │
  │  Y: 4        │                                                           │
  │  Y: 5        │                                                           │
  │  Y: 6        │                                                           │
  ▼  Y: 7 (Front)│ [0,7]                                              [35,7] │
                 └───────────────────────────────────────────────────────────┘
```

### 2.5D Projection Equations

For tile coordinates `(pos0, pos1)` with tile width $T_w$ (e.g. 32px) and depth step $T_h$ (e.g. 18px):

$$\text{World X} = X_{\text{origin}} + \left(\text{pos0} + \frac{\text{width}}{2}\right) \times T_w$$

$$\text{World Y} = Y_{\text{horizon}} + \text{pos1} \times T_h$$

$$\text{Depth (Z-Order)} = \begin{cases} 
-100 & \text{if location = WALLPAPER / CEILING} \\
-50 & \text{if location = WALL} \\
-10 & \text{if location = CARPET} \\
\text{pos1} \times 1000 + \text{pos0} & \text{if location = FLOOR}
\end{cases}$$

---

## 3. Interaction Anchor Points

Each furniture item defines interaction offsets relative to its origin:

| Furniture SubType | Interaction Type | Animation | Offset (X, Y) | Behavior |
|-------------------|------------------|-----------|---------------|----------|
| `CHAIR` / `STOOL` | `CHAIR` | `Sit` | `(0, -10px)` | Operator faces forward/side and sits on cushion |
| `SOFA` | `SOFA` | `Sit` | `(0, -8px)` | Up to 2 operators can sit side-by-side |
| `BED` / `REST` | `BED` | `Sleep` | `(+15px, -6px)` | Operator lies down with blanket cover |
| `TARGET` / `GAME` | `INTERACT` | `Interact` | `(-25px, 0px)` | Operator stands in front, triggers interaction emote |
| `INSTRUMENT` | `MUSIC` | `Special` | `(0, 0px)` | Operator plays music, notes float upward |

---

## 4. Drag & Drop Editor Engine (DIY Placement)

1. **Raycasting / Tile Snapping**:
   ```javascript
   const tileX = Math.max(0, Math.min(35, Math.floor((mouseX - roomOriginX) / TILE_W)));
   const tileY = Math.max(0, Math.min(7, Math.floor((mouseY - roomOriginY) / TILE_H)));
   ```
2. **Rotation (Key `R`)**:
   - Toggles `dir` between `0` (front) and `1` (rotated 90° or mirrored).
   - Swaps item footprint `width` $\leftrightarrow$ `depth`.
3. **Collision Checking**:
   - Ensures no two `FLOOR` items occupy the same grid cells $(x, y) \dots (x + w - 1, y + d - 1)$.
   - `CARPET` items ignore floor collisions and sit under furniture.

---

## 5. Reference Files

- [Dormitory Grid Spec](references/dormitory-grid-spec.md) — Detailed tile coordinate matrices, layer rendering order, and bounding box math.
- [Furniture JSON Schema](references/furniture-schema.md) — Schema definitions for themes, quickSetup arrays, and item attributes.
