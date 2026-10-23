# NBCare — điều hướng Google Sites

Cập nhật ngày 23/10/2026.

- Trang NBCare công khai đã đối chiếu với trang chỉnh sửa do người dùng cung cấp: https://sites.google.com/view/ninhbinh-general-hospital/nbcare
- Nút NBCare ở menu và thẻ trang chủ mở trang trên trong tab mới, với `noopener noreferrer`.
- Trang chủ không tải launcher, không có nút nổi hay popup NBCare.
- Ở các trang tra cứu, nút nổi NBCare là liên kết trực tiếp mở tab mới, không tạo iframe hay hộp chat trong trang.
- Các lượt bấm vẫn được bộ theo dõi liên kết hiện có ghi nhận; không gửi nội dung hội thoại.
- Module Netlify cũ ở `/nbcare/` được giữ để bảo toàn liên kết cũ, nhưng các nút trên giao diện không còn dẫn tới module đó. File nhúng cũ `NBCare-GoogleSites.html` không phải đường điều hướng đang dùng.

Nội dung và máy chủ bên trong trang Google Sites được quản lý riêng. Lần cập nhật này chỉ đổi điều hướng và gỡ popup trên giao diện DrugView; không sửa chatbot hoặc máy chủ đích.
