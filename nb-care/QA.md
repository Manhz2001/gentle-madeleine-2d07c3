# Kiểm tra bản demo NB Care

Ngày kiểm tra: 22/10/2026. Bản demo chạy tại localhost, tách khỏi mã website đang hoạt động.

## Bản cập nhật theo giao diện DrugView hiện có

Trang chủ dùng lại nguyên bố cục, logo, menu, thẻ tính năng và bộ CSS của DrugView. Chỉ nội dung/nút của thẻ AI được đổi để mở NB Care trong trang; khung chat được đổi sang màu xanh #0b5394, cùng phông Inter/Be Vietnam Pro, có font cục bộ hỗ trợ tiếng Việt. CSS của module được giới hạn trong `.nbcare-module`, tránh ghi đè giao diện nền.

## Quy tắc nội dung

- Tên hiển thị thống nhất là **NB Care**.
- Hai chế độ đều dùng cùng kho nguồn đóng; chưa có mô hình AI hoặc API.
- Nguồn được ưu tiên theo thứ tự: tài liệu đã duyệt trên DrugView Ninh Bình, nguồn chính thống Việt Nam, rồi nghiên cứu PubMed đã kiểm chứng và đưa vào kho.
- Các nhóm đau cấp tính, tim mạch, khó thở, mang thai và dấu hiệu nguy hiểm nhận đúng cảnh báo bắt buộc.
- Câu hỏi thai kỳ hoặc tim mạch chung được cảnh báo nhưng không tự động gắn là cấp cứu.
- Nội dung thiếu tài liệu đã duyệt không nhận nguồn hoặc trích dẫn giả.

Đã xác minh trong trình duyệt: font của trang nền và chat trùng nhau; chat hiển thị fixed, z-index 310 cao hơn header 140; màu nút nổi là rgb(11,83,148); chiều cao ô nhập khi mở lần đầu hợp lệ. Nút AI trong thẻ mở khung rộng, nút nổi mở khung nhanh. Khung mở rộng đã kiểm tra trực quan sau khi đồng bộ thanh bên. Đã kiểm tra khung 390px/820px và ô nhập trên bố cục gốc. Tệp `css/site.css` trùng hoàn toàn với bản tham chiếu gốc; mã nguồn website đang hoạt động không bị sửa.

Đã kiểm tra trong trình duyệt:

- Nút AI trên trang đầu mở chat rộng; nút nổi góc phải mở chat nhanh. Hai điểm mở dùng chung lịch sử và nội dung đang nhập.
- Chuyển Cơ bản / Chuyên sâu giữ hội thoại trước đó; nhãn của câu trả lời cũ không đổi. Chế độ mới áp dụng cho câu trả lời tiếp theo.
- Mở rộng, thu nhỏ, đóng rồi mở lại giữ bản nháp và hội thoại. Tạo cuộc trò chuyện mới xóa nội dung thử trong bộ nhớ.
- Thẻ nguồn mở đúng tài liệu mẫu và đoạn trích; Escape đóng nguồn trước rồi mới đóng chat, trả focus về nút đã mở.
- Nguồn mở trong chat nhanh cũng khóa phần nền, tránh focus chạy ra ngoài hộp nguồn.
- Câu hỏi về pha thuốc hiện “Chưa đủ nguồn để trả lời”, không tạo liều hay chỉ dẫn điều trị.
- Khung điện thoại 390 × 844 và máy tính bảng 820 × 1030 hiển thị đủ vùng nhập và cuộn hội thoại.

Đã kiểm tra cú pháp JavaScript. Mã tương tác không gọi fetch, XHR, WebSocket hoặc dịch vụ mô hình; chính sách CSP đặt connect-src 'none'. Không lưu hội thoại vào bộ nhớ trình duyệt. Chưa triển khai và chưa thay đổi website đang hoạt động.

Giới hạn: đây là kiểm tra trình duyệt ở kích thước mô phỏng. Chưa xác minh bàn phím/các thanh Safari trên iPhone thực tế. Nội dung trả lời và nguồn là kịch bản cố định để duyệt thiết kế.
