# 🎮 Arknights Spine Chibi Model Downloader & Game Engine Starter

Hệ thống công cụ cào tự động và bộ khởi tạo Game (Web Game & App Game) sử dụng mô hình hoạt ảnh Spine 2D Chibi (SD) của toàn bộ nhân vật Arknights từ PRTS Wiki / Torappu CDN.

---

## 📂 1. Cấu Trúc Dự Án

```text
d:/Moretests/Test2/
├── ak_crawler.py           # Tool Python cào dữ liệu Spine tự động (đa luồng, phân loại thư mục)
├── operators_index.json    # Cơ sở dữ liệu danh mục 454+ nhân vật Arknights (ID, Tên Trung, Tên Anh)
├── downloads/              # Thư mục chứa model nhân vật tải về (tự động phân theo tên nhân vật)
│   ├── 阿米娅/              # (Amiya)
│   │   ├── 阿米娅_默认_基建.skel
│   │   ├── 阿米娅_默认_基建.atlas
│   │   ├── 阿米娅_默认_基建.png
│   │   └── meta.json
│   ├── 德克萨斯/           # (Texas)
│   ├── 玛恩纳/             # (Mlynar)
│   └── 史尔特尔/           # (Surtr)
└── web/
    └── index.html          # Web Hub: Trình xem Spine 2D, Xuất Video/GIF, Demo Game Ký Túc Xá
```

---

## ⚡ 2. Hướng Dẫn Sử Dụng Tool Cào Tự Động (`ak_crawler.py`)

Tool hỗ trợ đa luồng (multi-threading), tự động tạo thư mục đúng theo **tên nhân vật**, tải đầy đủ 3 file cốt lõi của Spine 2D (`.skel`, `.atlas`, `.png`) và file cấu hình `meta.json`.

### Các lệnh phổ biến:

1. **Tải 1 nhân vật theo tên (Trung, Anh hoặc ID):**
   ```bash
   python ak_crawler.py --name "阿米娅"
   # hoặc dùng tên tiếng Anh:
   python ak_crawler.py --name "Texas"
   python ak_crawler.py --name "Mlynar"
   ```

2. **Tải Top N nhân vật đầu tiên:**
   ```bash
   python ak_crawler.py --top 20
   ```

3. **Tải toàn bộ tất cả nhân vật có trong game (450+ nhân vật):**
   ```bash
   python ak_crawler.py --all --workers 8
   ```

4. **Tùy chọn loại Model (`--model`):**
   - `--model build`: (Mặc định) Model **基建** (Chibi Ký Túc Xá) - Có đầy đủ động tác: `Default`, `Interact`, `Move`, `Relax`, `Sit`, `Sleep`,...
   - `--model front`: Model **正面** (Chiến đấu - Mặt trước).
   - `--model back`: Model **背面** (Chiến đấu - Mặt sau).
   - `--model all`: Tải toàn bộ cả 3 loại mô hình.

5. **Tùy chọn Skin (`--skin`):**
   - `--skin default`: (Mặc định) Trang phục cơ bản.
   - `--skin all`: Tải toàn bộ tất cả các bộ skin / outfit của nhân vật.

6. **Xem danh sách tất cả nhân vật trong game:**
   ```bash
   python ak_crawler.py --list 50
   # hoặc xem hết:
   python ak_crawler.py --list all
   ```

---

## 🎯 3. Tư Vấn Game Engine: Nên Chọn Engine Nào?

Tùy theo mục tiêu bạn muốn làm **Web Game** (chơi trên web) hay **App Game** (cài đặt trên điện thoại/máy tính), dưới đây là 3 lựa chọn tối ưu nhất:

| Mục tiêu | Game Engine khuyên dùng | Lý do & Ưu điểm | Định dạng sử dụng |
| :--- | :--- | :--- | :--- |
| **Web Game (HTML5)** | **PixiJS + `@pixi-spine`** *(Khuyên dùng nhất)* | • Chạy mượt 60fps trực tiếp trên trình duyệt PC & Mobile.<br>• Dung lượng siêu nhẹ (~100KB/nhân vật).<br>• Dễ đưa lên Vercel/GitHub Pages miễn phí. | Đọc trực tiếp `.skel` / `.atlas` / `.png` |
| **App Game (Mobile/PC)** | **Godot Engine 4** *(Khuyên dùng nhất cho App)* | • Hoàn toàn miễn phí, mã nguồn mở, bộ cài chỉ ~50MB.<br>• Xuất 1 click ra Android (APK), iOS, Windows, Web.<br>• Ngôn ngữ GDScript dễ học. | Dùng `godot-spine` hoặc SpriteFrames |
| **Game Gacha / RPG lớn** | **Unity (2D) + Spine-Unity 3.8** | • Chuẩn ngành công nghiệp game, hỗ trợ chính hãng từ Esoteric Software.<br>• Hệ thống vật lý, animation state machine mạnh mẽ. | Kéo thả trực tiếp Spine 3.8 package |

---

## 🌐 4. Mở Web Hub & Mini Game Demo

Bạn có thể mở trực tiếp file `web/index.html` trên trình duyệt để:
1. Xem và xoay lật các mô hình Chibi Arknights.
2. Thử nghiệm chuyển động từng động tác (`Default`, `Interact`, `Move`, `Relax`, `Sit`, `Sleep`).
3. Điều chỉnh tốc độ phát (`x0.1` đến `x2.0`).
4. Chơi thử bản demo tương tác Ký Túc Xá (cho nhân vật đi ngủ giường, ngồi ghế, tương tác khi chạm).
