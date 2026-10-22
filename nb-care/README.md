# NB Care — demo trong giao diện DrugView Ninh Bình

Bản v2 đặt NB Care vào bố cục trang chủ DrugView Ninh Bình hiện có: giữ logo, thanh điều hướng, phần giới thiệu, các thẻ tính năng và hình ảnh hoạt động. Màu sắc, phông chữ và nút điều khiển của chatbot được điều chỉnh theo giao diện này.

Bản xem trước chỉ chạy trên máy. Chưa triển khai lên website, chưa kết nối API, mô hình AI hoặc kho tài liệu y khoa thực tế. Hội thoại là kịch bản dựng sẵn; không dùng để quyết định điều trị.

## Mở bản demo

Mở terminal tại thư mục `NB_care_demo`, chạy:

```powershell
python -m http.server 8770 --bind 127.0.0.1
```

Sau đó truy cập <http://127.0.0.1:8770/>. Nhấn `Ctrl+C` trong terminal để dừng máy chủ. Nếu cổng 8770 đang được bản demo sử dụng, chỉ cần mở địa chỉ trên.

## Các luồng để xem thử

- Nút **Mở NB Care** trong thẻ AI ở trang đầu mở khung chat ngay trong trang. Nút nổi **NB Care** ở góc phải mở chat nhanh. Hai điểm mở dùng chung cuộc trò chuyện và bản nháp.
- **Cơ bản** trình bày ngắn gọn; **Chuyên sâu** thêm cấu trúc, căn cứ và giới hạn. Chuyển chế độ rồi gửi câu hỏi để xem cách trả lời tương ứng.
- Thử câu hỏi gợi ý, gửi câu hỏi, mở thẻ nguồn, mở rộng/thu gọn khung chat và tạo cuộc trò chuyện mới.
- Kho nguồn có ba tài liệu mẫu `doc1`, `doc2`, `doc3`, đều ghi **Tài liệu mẫu · minh họa giao diện**. Đây không phải PDF hoặc tài liệu chuyên môn đã được bệnh viện phê duyệt. Câu hỏi về liều, pha thuốc hoặc điều trị sẽ hiện trạng thái thiếu nguồn.

NB Care gọi Gemini qua Netlify Function; khóa chỉ nằm trong biến môi trường máy chủ. Nếu dịch vụ AI hoặc model không sẵn sàng, giao diện tự dùng câu trả lời dự phòng. Kho tài liệu chuyên môn DrugView vẫn cần được nối vào lớp truy xuất nguồn trước khi trả lời nội dung y khoa cụ thể.

## Các tệp

| Tệp | Vai trò |
| --- | --- |
| `index.html` | Trang chủ DrugView hiện có, thẻ NB Care với nút mở chat trong trang và module chat. |
| `css/site.css` | Bản sao nguyên trạng CSS tham chiếu của DrugView; giữ thiết kế nền hiện có. |
| `css/fonts.css`, `fonts/` | Be Vietnam Pro và Inter được lưu cục bộ, gồm bộ ký tự tiếng Việt/Latin và giấy phép OFL; không tải phông từ dịch vụ bên ngoài khi mở demo. |
| `img/` | Bản sao các hình ảnh gốc dùng trên trang chủ. |
| `js/demo-shell.js` | Chỉ giữ điều hướng, hiệu ứng thanh đầu trang, slider và nút lên đầu trang; không có analytics. |
| `nbcare.css` | CSS riêng của module chat, được giới hạn trong `.nbcare-module` và dùng màu, phông, kiểu nút của DrugView. |
| `nbcare.js` | Tương tác khung chat, chế độ, hội thoại và bảng nguồn. |
| `nbcare-content.js` | Gợi ý, tài liệu mẫu và hàm trả lời cục bộ `window.NBCareContent.respond(question, mode)`. |
| `assets/hospital-logo.png` | Hình nhận diện dùng trong bản xem trước. |
| `preview-devices.html` | Khung xem trước ở kích thước điện thoại và máy tính bảng. |

## Hướng tích hợp sau khi duyệt

Giữ hai nút mở chung một module; thay nguồn mẫu bằng tài liệu đã được duyệt, có tên, phiên bản và vị trí trích dẫn. Lớp trả lời tương lai có thể giữ cấu trúc dữ liệu hiện tại để giao diện không phải viết lại. Nếu kết nối dịch vụ AI sau này, cần thực hiện qua máy chủ, chỉ dùng kho nguồn cho phép và giữ trạng thái thiếu nguồn khi không có căn cứ phù hợp.

Bản demo hiện giữ `connect-src 'none'` trong chính sách nội dung, dùng tài nguyên cục bộ và không gọi dịch vụ bên ngoài. Tích hợp dữ liệu, kết nối AI và triển khai là các bước riêng sau khi duyệt giao diện.
