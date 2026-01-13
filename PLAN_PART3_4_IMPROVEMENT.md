# Kế hoạch cải thiện cắt audio Part 3 & Part 4

## 📋 Tổng quan vấn đề hiện tại

### Vấn đề chính:
1. **Đang dùng Even Division (chia đều)**: Chia đều thời gian thành N groups → Không chính xác vì mỗi group có độ dài khác nhau
2. **Không detect "Question X to Y" announcements**: Mỗi group bắt đầu bằng "Question 32 to 34" nhưng code không tìm được điểm này
3. **Không detect group boundaries chính xác**: Sau khi 3 câu hỏi được đọc xong, có khoảng im lặng dài trước khi bắt đầu group tiếp theo
4. **Có function `detectCutPointsForGroups` nhưng không được dùng**: Code đã có logic detect silence nhưng đang bị bỏ qua, chỉ dùng even division
5. **Skip direction không thông minh**: Chưa có logic đặc biệt để skip direction cho Part 3/4

### Cấu trúc TOEIC Part 3 & 4:
- **Part 3**: 13 conversations, mỗi conversation có:
  - "Question X to Y" announcement (ví dụ: "Question 32 to 34")
  - Đoạn hội thoại (conversation)
  - 3 câu hỏi được đọc
  - Khoảng im lặng dài → bắt đầu group tiếp theo
  
- **Part 4**: 10 talks, mỗi talk có:
  - "Question X to Y" announcement
  - Đoạn talk
  - 3 câu hỏi được đọc
  - Khoảng im lặng dài → bắt đầu group tiếp theo

---

## 🎯 Mục tiêu cải thiện

1. **Độ chính xác cao hơn**: Detect chính xác điểm bắt đầu mỗi group (sau "Question X to Y")
2. **Robust**: Có fallback mechanism nếu detection không hoạt động
3. **Skip direction thông minh**: Tự động bỏ qua phần direction ở đầu
4. **Validation tốt hơn**: Kiểm tra số lượng groups và độ dài mỗi group

---

## 📝 Kế hoạch chi tiết

### Phase 1: Cải thiện Silence Detection (Ưu tiên cao - Dễ implement)

**Mục tiêu**: Sử dụng lại và cải thiện function `detectCutPointsForGroups` đã có

**Các bước**:
1. ✅ **Phân tích lại logic hiện tại**:
   - Function `detectCutPointsForGroups` đã có nhưng không được gọi
   - Logic tìm long silences (>= 15% avg group duration)
   - Filter theo minimum spacing (50% avg group duration)
   - Fallback về even division nếu không đủ cut points

2. 🔧 **Cải thiện logic**:
   - **Tăng độ nhạy**: Giảm threshold từ 15% xuống 10-12% để detect nhiều silences hơn
   - **Cải thiện filtering**: Thay vì chỉ lấy longest silences, lấy silences có spacing hợp lý
   - **Smart spacing**: Đảm bảo khoảng cách giữa các cut points gần bằng avg group duration
   - **Direction detection**: Tìm silence dài nhất ở đầu → đó là direction, skip nó

3. 🔄 **Tích hợp vào flow**:
   - Thay thế `splitPart3And4Groups` (even division) bằng logic mới
   - Gọi `detectCutPointsForGroups` để tìm timestamps
   - Sử dụng `splitAudioSegmentsForGroups` để cắt audio

4. ✅ **Testing**:
   - Test với Part 3 (13 groups)
   - Test với Part 4 (10 groups)
   - Verify số lượng groups đúng
   - Verify question numbering đúng

**Ưu điểm**:
- ✅ Không cần thêm dependencies
- ✅ Dựa trên code đã có
- ✅ Nhanh, không cần xử lý audio phức tạp
- ✅ Có fallback mechanism

**Nhược điểm**:
- ⚠️ Vẫn phụ thuộc vào silence detection
- ⚠️ Có thể không chính xác 100% nếu audio có nhiều noise

---

### Phase 2: Speech-to-Text Detection (Ưu tiên trung bình - Cần research)

**Mục tiêu**: Detect chính xác "Question X to Y" announcements bằng STT

**Các bước**:
1. 🔍 **Research STT options**:
   - **Whisper (OpenAI)**: Local, free, accurate → Recommended
   - **Google Cloud Speech-to-Text**: API, có cost
   - **Vosk**: Offline, lightweight
   - **Viettel AI**: Nếu cần tiếng Việt

2. 📦 **Chọn solution**:
   - **Recommendation**: Whisper (whisper.cpp hoặc node-whisper)
   - Lý do: Free, local, không cần API key, chính xác

3. 🔧 **Implementation**:
   - Tạo function `detectQuestionAnnouncements(audioFile)`
   - Extract audio segments (mỗi 5-10 giây) → STT
   - Tìm patterns: "question", "number", "to"
   - Map timestamps với question numbers
   - Validate: Đảm bảo tìm đủ 13 (Part 3) hoặc 10 (Part 4) announcements

4. 🔄 **Tích hợp**:
   - Kết hợp với silence detection
   - Priority: STT timestamps > Silence detection > Even division
   - Nếu STT tìm được đủ announcements → dùng STT
   - Nếu không → fallback về silence detection

5. ✅ **Testing**:
   - Test với nhiều file audio khác nhau
   - Verify accuracy
   - Measure performance (thời gian xử lý)

**Ưu điểm**:
- ✅ Chính xác cao nhất
- ✅ Detect được chính xác "Question X to Y"
- ✅ Không phụ thuộc vào silence

**Nhược điểm**:
- ⚠️ Cần thêm dependencies (Whisper)
- ⚠️ Chậm hơn (cần transcribe audio)
- ⚠️ Có thể cần GPU để nhanh hơn

---

### Phase 3: Hybrid Approach (Ưu tiên thấp - Future enhancement)

**Mục tiêu**: Kết hợp nhiều phương pháp để đạt độ chính xác cao nhất

**Các bước**:
1. 🔄 **Multi-method detection**:
   - STT để tìm "Question X to Y"
   - Silence detection để tìm group boundaries
   - Energy analysis để tìm điểm kết thúc 3 câu hỏi
   - Cross-validate kết quả từ các phương pháp

2. 🎯 **Smart merging**:
   - Nếu STT và silence detection đồng ý → dùng kết quả đó
   - Nếu conflict → ưu tiên STT, nhưng validate với silence
   - Nếu thiếu groups → fill bằng even division

3. ✅ **Validation layer**:
   - Kiểm tra số lượng groups đúng
   - Kiểm tra độ dài mỗi group hợp lý (không quá ngắn/dài)
   - Kiểm tra question numbering đúng
   - Warning nếu có vấn đề

---

## 🚀 Implementation Plan (Recommended Order)

### Step 1: Quick Win - Cải thiện Silence Detection (1-2 giờ)
- [ ] Sửa lại `detectCutPointsForGroups` để tăng độ nhạy
- [ ] Thêm logic skip direction thông minh
- [ ] Tích hợp vào `autoSplitPartWithGroups`
- [ ] Test với Part 3 và Part 4

### Step 2: Testing & Validation (30 phút)
- [ ] Test với nhiều file audio
- [ ] So sánh kết quả với even division
- [ ] Document kết quả

### Step 3: Optional - STT Integration (Nếu cần độ chính xác cao hơn)
- [ ] Research và chọn STT solution
- [ ] Implement `detectQuestionAnnouncements`
- [ ] Tích hợp vào flow
- [ ] Test và so sánh

---

## 📊 Success Metrics

1. **Accuracy**: 
   - Số lượng groups đúng: 13 (Part 3), 10 (Part 4)
   - Question numbering đúng: 32-34, 35-37, ... (Part 3)

2. **Robustness**:
   - Hoạt động với nhiều loại audio khác nhau
   - Có fallback nếu detection fail

3. **Performance**:
   - Thời gian xử lý hợp lý (< 2 phút cho Part 3/4)
   - Không crash, có error handling tốt

---

## 🔧 Technical Details

### Function cần sửa:
- `detectCutPointsForGroups()` - Cải thiện logic
- `autoSplitPartWithGroups()` - Tích hợp logic mới
- `splitPart3And4Groups()` - Có thể giữ làm fallback

### Function cần tạo (nếu làm STT):
- `detectQuestionAnnouncements(audioFile)` - STT detection
- `validateGroupBoundaries(timestamps, expectedCount)` - Validation

### Dependencies có thể cần:
- `whisper` hoặc `@xenova/transformers` (cho Whisper)
- Hoặc `vosk` (lightweight alternative)

---

## 📝 Notes

- **Hiện tại**: Đang dùng even division → đơn giản nhưng không chính xác
- **Mục tiêu ngắn hạn**: Cải thiện silence detection → tốt hơn, không cần thêm dependencies
- **Mục tiêu dài hạn**: STT detection → chính xác nhất nhưng cần thêm dependencies

**Recommendation**: Bắt đầu với Phase 1 (cải thiện silence detection) vì:
- ✅ Nhanh, dễ implement
- ✅ Không cần thêm dependencies
- ✅ Cải thiện đáng kể so với even division
- ✅ Có thể làm thêm STT sau nếu cần
