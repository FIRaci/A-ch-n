# Arknights Furniture & Chibi Spine Interaction Mapping

## 1. Interaction Types and Animation Triggers

Arknights Chibi Spine models feature a standardized set of animation tracks designed for dormitory and combat interaction.

| Game `subType` | Game `interactType` | Trigger Animation | Anchor Alignment | Behavior Description |
|----------------|---------------------|-------------------|------------------|----------------------|
| `CHAIR`, `STOOL` | `CHAIR` | `Sit` | Center of seat cushion, `Y - 10px` | Operator sits upright or relaxed on chair |
| `SOFA`, `BENCH` | `SOFA` | `Sit` | Offset left or right slot | Accommodates 1 or 2 operators simultaneously |
| `BED`, `REST` | `BED` | `Sleep` | Mattress center, `Y - 6px` | Operator lies down, eyes close, Zzz sleep bubbles appear |
| `TARGET` | `INTERACT` | `Interact` / `Special` | `X - 25px` facing right | Operator aims/practices, fires projectile or investigates |
| `ARCADE`, `GAME` | `INTERACT` | `Interact` | In front of console | Operator plays arcade controls with joystick motions |
| `INSTRUMENT` | `MUSIC` | `Special` | Instrument anchor point | Operator plays piano / guitar / drums, musical notes float |
| `DRINK`, `CAFE` | `INTERACT` | `Interact` | Next to cup / dispenser | Operator holds mug or pours drink |

## 2. Interaction State Machine

```
   [ Normal Wandering / Move ]
                │
                ▼ (Player / Companion within 90px of furniture)
      [ Proximity Detected ]
         ├── Show Floating Action Badge "[E] Ngồi ghế (Sit)"
         └── Highlight Furniture with Cyan Pulsing Aura
                │
                ▼ (User presses E key OR clicks furniture)
      [ Walk to Furniture Anchor ]
                │
                ▼ (Distance < 6px)
   [ Snap to Coordinate & Face Direction ]
                │
                ▼ (Trigger Animation State)
       [ Play "Sit" / "Sleep" / "Interact" ]
                │
                ▼ (User moves WASD / clicks floor / presses Space)
         [ Stand Up & Resume Move ]
```

## 3. Spine Fallback Chain

If a specific Chibi skin lacks a specialized `Sit` or `Sleep` animation track (e.g. some early combat models):

1. **Sit Fallback**: `Sit` ➔ `Relax` ➔ `Default`
2. **Sleep Fallback**: `Sleep` ➔ `Sit` ➔ `Relax` ➔ `Default`
3. **Interact Fallback**: `Interact` ➔ `Special` ➔ `Relax` ➔ `Default`
