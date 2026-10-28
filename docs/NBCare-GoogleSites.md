# NBCare — module DrugView Ninh Bình

Cập nhật 28/10/2026.

- Trang riêng: https://gentle-madeleine-2d07c3.netlify.app/nbcare/
- URL nhúng Google Sites: https://gentle-madeleine-2d07c3.netlify.app/nbcare/?embed=1
- Nút NBCare trên DrugView mở module này trong tab mới. Trang chủ không có popup.
- Trong Google Sites, chọn Chèn → Nhúng → Theo URL và dùng URL nhúng ở trên. Tăng chiều cao khung khoảng 850–950px. Có thể dùng mã iframe trong `NBCare-GoogleSites.html`.
- Camera cần HTTPS và quyền camera của Safari/Chrome. Khi trang cha không cấp quyền camera cho iframe, mở module trong tab riêng hoặc chọn ảnh có sẵn.

Chat chạy Google ADK trên Netlify Functions, dùng Gemini qua Vertex AI Express. Đây không phải bản triển khai Agent Engine trên Google Cloud. Khóa chỉ nằm trong biến môi trường máy chủ, không nhúng trong HTML/JavaScript.

Nguồn đóng đọc danh mục DrugView đã xuất bản và các bản ghi được duyệt trong `nbcare-server/approved-sources.json` (hiện rỗng). Các bản ghi DrugView được ghi rõ xuất xứ, không tự gắn nhãn đã thẩm định tờ hướng dẫn. Thiếu tài liệu thì từ chối; không tự chuyển nguồn mở. Nguồn mở dùng Google Search grounding và chỉ hiển thị đoạn có căn cứ từ các cơ quan y tế được cho phép. Ảnh được đọc trên thiết bị trước; nút Gemini gửi ảnh đến Vertex AI khi người dùng chọn. Nội dung OCR cần được kiểm tra trước khi gắn vào câu hỏi.

Triển khai: cài bằng `npm ci`, kiểm tra `npm test`, xuất bản bằng `npm run build`. Netlify dùng `netlify.toml`, chỉ đưa `dist/` ra công khai. Mã máy chủ, gói npm và khóa không được đưa vào thư mục xuất bản.

Biến Netlify Functions: `GEMINI_API_KEY` (secret), `GEMINI_MODEL=gemini-3.8-flash`, `GEMINI_ENABLED=true`. Có thể tắt riêng module bằng `NBCARE_VERTEX_ENABLED=false`, tắt nguồn DrugView bằng `NBCARE_DRUGVIEW_ENABLED=false`. API trạng thái chỉ báo cấu hình, không coi đó là bằng chứng kết nối thành công. Giới hạn 12 lượt POST/phút/IP là giới hạn bộ nhớ từng instance, không phải hạn mức toàn hệ thống.

Giữ mã Analytics hiện có của module (`G-NC0D1PTZ3L`) để đo lượt xem trang. Chỉ ghi URL trang không kèm query và tiêu đề cố định; không gửi câu hỏi, ảnh hoặc nội dung y tế vào Analytics. Có thể nhúng module bằng URL riêng như các module khác.
