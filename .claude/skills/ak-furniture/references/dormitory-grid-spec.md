# Arknights Dormitory 36×8 Grid & Coordinate Specification

## 1. Grid Dimensions & Units

An Arknights Dormitory is modeled on a 2.5D plane:
- **Columns (X-Axis)**: 36 grid tiles (`pos0` = 0 .. 35) from left to right.
- **Rows (Y-Axis / Depth)**: 8 grid tiles (`pos1` = 0 .. 7) on the walkable floor, where `0` is the back wall (furthest away) and `7` is the front edge (closest to camera).
- **Wall Height**: 10 wall grid units from horizon line upwards to ceiling.

```
+─────────────────────────────────────────────────────────────+  CEILING (Y: -80px)
|                       WALL TILES                            |
|       (Posters, Bulletin Boards, Sconces, Pipes)            |
+─────────────────────────────────────────────────────────────+  HORIZON (Y = 0)
| [0,0]                                               [35,0]  |  FLOOR ROW 0 (Back)
| [0,1]                                               [35,1]  |  FLOOR ROW 1
| [0,2]                                               [35,2]  |  FLOOR ROW 2
| [0,3]                                               [35,3]  |  FLOOR ROW 3
| [0,4]                                               [35,4]  |  FLOOR ROW 4
| [0,5]                                               [35,5]  |  FLOOR ROW 5
| [0,6]                                               [35,6]  |  FLOOR ROW 6
| [0,7]                                               [35,7]  |  FLOOR ROW 7 (Front)
+─────────────────────────────────────────────────────────────+
```

## 2. 2.5D Projection Mathematics

For a room anchored at $(X_{\text{origin}}, Y_{\text{horizon}})$:

- **Tile Width ($T_w$)**: Typically `34.0px` (or scaled to room viewport).
- **Tile Height ($T_h$)**: Typically `22.0px` (provides a ~33° isometric perspective incline).

### Placement Formulas:
1. **Floor Furniture**:
   $$X_{\text{world}} = X_{\text{origin}} + \left(\text{gridX} + \frac{\text{width}}{2}\right) \times T_w$$
   $$Y_{\text{world}} = Y_{\text{horizon}} + (\text{gridY} + \text{depth}) \times T_h$$

2. **Carpet / Rugs (`CARPET`, `FLOOR_MAT`)**:
   $$X_{\text{world}} = X_{\text{origin}} + \left(\text{gridX} + \frac{\text{width}}{2}\right) \times T_w$$
   $$Y_{\text{world}} = Y_{\text{horizon}} + \left(\text{gridY} + \frac{\text{depth}}{2}\right) \times T_h$$

3. **Wall Items (`WALL`, `POSTER`, `BULLETIN`)**:
   $$X_{\text{world}} = X_{\text{origin}} + \left(\text{gridX} + \frac{\text{width}}{2}\right) \times T_w$$
   $$Y_{\text{world}} = Y_{\text{horizon}} - (\text{gridY} \times 18.0) - 20.0$$

## 3. Depth Sorting (Painter's Algorithm)

To prevent visual overlapping glitches, all room entities must be rendered in strict ascending $Z$-order:

$$\text{zIndex} = \begin{cases}
-80 & \text{CEILING items} \\
-50 + \text{gridY} & \text{WALL items} \\
-10 + \text{gridY} & \text{CARPET / Rugs} \\
\text{gridY} \times 1000 + \text{gridX} & \text{FLOOR furniture} \\
\text{charY} \times 1000 + \text{charX} & \text{Chibi Characters}
\end{cases}$$

This guarantees that:
1. Carpets always draw beneath tables and chairs.
2. Furniture behind a character draws behind their Spine model.
3. Furniture in front of a character properly occludes their lower body.

## 4. Footprint & Rotation Rules

- `dir = 0`: Normal orientation. Bounding box = $\text{width} \times \text{depth}$.
- `dir = 1`: Rotated 90° or mirrored. Bounding box = $\text{depth} \times \text{width}$. Sprite is flipped horizontally with `scaleX = -1` or rotated sprite index.
