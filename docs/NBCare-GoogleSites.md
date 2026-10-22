# NBCare — bàn giao module

## Đường dẫn

- Module độc lập: https://gentle-madeleine-2d07c3.netlify.app/nbcare/
- Mở thẳng chat: https://gentle-madeleine-2d07c3.netlify.app/nbcare/?view=chat
- Nhúng thẳng chat: https://gentle-madeleine-2d07c3.netlify.app/nbcare/?embed=1
- Link cũ `/nb-care/` chuyển về module mới.

Trong Google Sites: Chèn → Nhúng → Theo URL → dán link module độc lập. Kéo khung cao khoảng 850–950 px để hiển thị đủ nội dung. Dùng link `?embed=1` nếu muốn hiện ngay chatbot. Có thể thêm một trang NBCare riêng trên thanh điều hướng Google Sites rồi đặt module vào trang đó. Việc thêm trang Google Sites chưa được thực hiện trong lần cập nhật Netlify này.

## Analytics

Module dùng cùng GA4 `G-NC0D1PTZ3L` với website, gửi một `page_view` khi module được nạp. Trong GA4 xem Báo cáo → Mức độ tương tác → Trang và màn hình, lọc đường dẫn `/nbcare/` hoặc tiêu đề “NBCare — BVĐK tỉnh Ninh Bình”. Có sự kiện `nbcare_open` và `nbcare_close`, tham số `entry_point` là `module` hoặc `popup`.

Popup giữ nguyên iframe khi đóng để giữ hội thoại; mở lại gửi thêm `nbcare_open`, không tạo thêm `page_view` giả. URL đo lường bỏ query/hash. Không gửi nội dung câu hỏi, tên thuốc tìm kiếm, ảnh, nội dung trả lời hoặc nội dung bên trong Apps Script vào Analytics. Số liệu tại báo cáo GA4 thực tế chưa được đối chiếu trong tài khoản Analytics; mã đo lường và hành vi mở/đóng đã được kiểm tra.

## Chatbot được chọn

Theo lựa chọn của người dùng, module dùng nguyên chatbot Google Apps Script từ đoạn mã được dán, không gọi Gemini của module cũ. Endpoint được khai báo tập trung trong `nbcare/nbcare.js`.

**Giới hạn cần xử lý tại Apps Script:** bên trong endpoint hiện ghi “Trợ lý AI Dược lâm sàng Smart Phú Thọ”. Khung NBCare trên Netlify không có quyền sửa HTML, logo, chức năng hoặc nguồn tri thức ở iframe khác miền. Muốn đổi toàn bộ giao diện bên trong sang Ninh Bình cần mã nguồn HTML/Code.gs hoặc quyền sửa dự án Apps Script. Nguồn và quy tắc trả lời bên trong chatbot này chưa được kiểm chứng hay thay đổi trong lần cập nhật này.

Các nút trang đầu và nút nổi chỉ dùng một launcher; popup căn giữa viewport, khóa cuộn nền và cuộn trong chatbot theo vị trí con trỏ. Trên điện thoại khung chat chiếm màn hình. Có nút “Tab riêng” và đóng khung ở thanh NBCare bên ngoài.

## Ảnh

Ảnh `nbcare/assets/nbcare-assistant.png` được tạo bằng công cụ image_gen tích hợp. Logo bệnh viện giữ nguyên từ tài nguyên đã có.

Prompt đã dùng: “Square professional healthcare AI assistant illustration for Ninh Binh General Hospital: friendly white ceramic robot, calm cyan eyes on navy screen, small blue plus badge, holding a blue medical book; subtle lotus petals and limestone landscape evocative of Ninh Binh; restrained hospital blue #0b5394, sky blue #0396c8, pale white background; soft studio light; no text, watermarks, invented official seal or hospital building.”

## Tra cứu thuốc

Đã gỡ nút tra cứu ảnh, camera, OCR/Tesseract và runtime nhận dạng khỏi trang `tra-cuu-thuoc-tiem-truyen.html`. Luồng tìm thuốc bằng chữ được giữ nguyên. Tính năng đính kèm ảnh riêng của chatbot Apps Script nằm ở hệ thống bên ngoài và chưa thay đổi.
