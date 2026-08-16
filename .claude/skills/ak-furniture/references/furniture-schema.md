# Arknights Furniture Database JSON Schema

## 1. Top-Level Schema (`furniture_database.json`)

```json
{
  "metadata": {
    "version": "1.0.0",
    "source": "Arknights Game Data / PRTS Wiki",
    "totalThemes": 135,
    "totalItems": 2786
  },
  "themes": {
    "<themeId>": {
      "id": "furni_set_BSsafehouse",
      "name": "黑钢国际安全屋",
      "desc": "黑钢国际安全屋的标准化装潢配置。",
      "themeType": "EVENT",
      "totalComfort": 4055,
      "previewImageUrl": "https://torappu.prts.wiki/assets/furniture_theme/furni_set_BSsafehouse.png",
      "itemCount": 18,
      "furnitures": [
        "furni_BSsafehouse_table_01",
        "furni_BSsafehouse_chair_01",
        "..."
      ],
      "quickSetup": [
        {
          "furnitureId": "furni_BSsafehouse_chair_01",
          "name": "折叠椅",
          "location": "FLOOR",
          "subType": "CHAIR",
          "animMapping": "Sit",
          "gridX": 9,
          "gridY": 3,
          "dir": 0,
          "width": 2,
          "depth": 2,
          "height": 3,
          "imageUrl": "https://torappu.prts.wiki/assets/furniture/furni_BSsafehouse_chair_01.png"
        }
      ]
    }
  },
  "items": {
    "<furnitureId>": {
      "id": "furni_BSsafehouse_chair_01",
      "name": "折叠椅",
      "description": "轻便易折叠的黑钢战术椅。",
      "usage": "能够用来装扮宿舍，提高宿舍的氛围",
      "themeId": "furni_set_BSsafehouse",
      "location": "FLOOR",
      "type": "DECORATION",
      "subType": "CHAIR",
      "interactType": "CHAIR",
      "animMapping": "Sit",
      "width": 2,
      "depth": 2,
      "height": 3,
      "comfort": 140,
      "rarity": 2,
      "enableRotate": true,
      "imageUrl": "https://torappu.prts.wiki/assets/furniture/furni_BSsafehouse_chair_01.png"
    }
  }
}
```

## 2. Location Layer Values

- `FLOOR`: Standard furniture on walkable tiles (tables, chairs, beds, shelves).
- `WALL`: Hanging fixtures (posters, target boards, hanging cabinets, wall lights).
- `CEILING`: Overhead fixtures (ceiling lights, chandeliers).
- `CARPET` / `FLOOR_MAT`: Flat floor coverings placed under other furniture.
- `WALLPAPER`: Full wall texture background.
