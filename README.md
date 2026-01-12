# TOEIC Dictation Practice

Ứng dụng web đơn giản để luyện tập dictation TOEIC với 4 phần (Part 1-4).

## Cài đặt

1. Cài đặt FFmpeg (bắt buộc cho tính năng cắt audio):
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get install ffmpeg

# Windows
# Tải từ https://ffmpeg.org/download.html
```

2. Cài đặt dependencies:
```bash
npm install
```

3. Thư mục sẽ được tạo tự động khi chạy ứng dụng:
- `audio/` - Chứa file audio
- `audio/part1/` - Chứa file audio đã cắt cho Part 1
- `uploads/` - Thư mục tạm cho file upload

## Chạy ứng dụng

```bash
npm start
```

Sau đó mở trình duyệt và truy cập: http://localhost:3000

## Sử dụng

### Luyện tập Dictation

1. Chọn phần bạn muốn luyện tập (Part 1, 2, 3, hoặc 4)
2. Chọn file audio:
   - **Cách 1**: Chọn file từ dropdown (file trong thư mục `audio`)
   - **Cách 2**: Upload file từ máy tính của bạn
3. Nghe audio và nhập text vào ô textarea
4. Sử dụng các nút điều khiển để play/pause/stop/reset

### Cắt Audio

#### Cắt từng Part riêng lẻ:
1. Truy cập trang "Cắt Part X" từ trang chủ (X = 1, 2, 3, 4)
2. Upload file audio của part tương ứng
3. Chọn chế độ:
   - **Tự động**: Hệ thống tự động phát hiện khoảng lặng và cắt
   - **Thủ công**: Nhập thời gian bắt đầu/kết thúc cho từng câu
4. Các file sẽ được lưu vào thư mục `audio/partX/`

#### Cắt Full LC Audio:
1. Truy cập trang "Cắt Full LC" từ trang chủ
2. Upload file audio full Listening Comprehension
3. Hệ thống sẽ tự động:
   - Cắt thành Part 1, 2, 3, 4
   - Cắt mỗi part thành các câu riêng biệt
   - Lưu metadata vào file JSON

**Số lượng câu mỗi part:**
- Part 1: 6 câu
- Part 2: 25 câu
- Part 3: 39 câu
- Part 4: 30 câu

## Đặt tên file audio

Bạn có thể đặt tên file audio **bất kỳ** trong thư mục `audio`, ví dụ:
- `part1_01.mp3`
- `test.wav`
- `bai1.m4a`
- `toeic_part2_question1.mp3`

**Định dạng hỗ trợ**: `.mp3`, `.wav`, `.m4a`, `.ogg`, `.aac`, `.flac`

Sau khi đặt file vào thư mục `audio`, khởi động lại server và file sẽ xuất hiện trong dropdown.

## Cấu trúc thư mục

```
dictation/
├── server.js          # Express server
├── package.json       # Dependencies
├── public/            # Frontend files
│   ├── index.html     # Trang chủ
│   ├── split-part1.html  # Trang cắt audio Part 1
│   ├── split-part2.html  # Trang cắt audio Part 2
│   ├── split-part3.html  # Trang cắt audio Part 3
│   ├── split-part4.html  # Trang cắt audio Part 4
│   ├── split-full-lc.html # Trang cắt full LC audio
│   ├── part1.html     # Part 1 interface
│   ├── part2.html     # Part 2 interface
│   ├── part3.html     # Part 3 interface
│   ├── part4.html     # Part 4 interface
│   ├── css/
│   │   └── style.css  # Styles
│   └── js/
│       ├── app.js     # JavaScript logic
│       ├── split-part1.js  # JavaScript cho cắt audio Part 1
│       ├── split-part2.js  # JavaScript cho cắt audio Part 2
│       ├── split-part3.js  # JavaScript cho cắt audio Part 3
│       ├── split-part4.js  # JavaScript cho cắt audio Part 4
│       └── split-full-lc.js # JavaScript cho cắt full LC
├── utils/
│   └── audioMetadata.js  # Utility để quản lý metadata
├── audio/             # Thư mục chứa audio files
│   ├── part1/         # File audio đã cắt cho Part 1
│   ├── part2/         # File audio đã cắt cho Part 2
│   ├── part3/         # File audio đã cắt cho Part 3
│   ├── part4/         # File audio đã cắt cho Part 4
│   └── metadata.json  # File JSON chứa metadata về các file đã cắt
└── uploads/           # Thư mục tạm cho file upload
```

## Tính năng

- ✅ Luyện tập dictation cho 4 phần TOEIC
- ✅ Upload và chọn file audio
- ✅ Giao diện riêng cho từng part
- ✅ **Cắt audio tự động cho tất cả các part (Part 1, 2, 3, 4)**
- ✅ **Cắt full LC audio thành các part và câu tự động**
- ✅ **Lưu metadata vào file JSON để quản lý**
- ✅ Tự động phát hiện khoảng lặng để cắt chính xác
- ✅ Hỗ trợ cả chế độ tự động và thủ công
