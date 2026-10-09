# Chèn ảnh vào đề – V93

1. Chèn `##!##` vào từng vị trí cần ảnh trong đề hoặc lời giải.
2. Bấm **Tải ảnh** hoặc **Lưu**. Mỗi dấu tạo một ô ảnh, phía dưới có đoạn đề nhỏ để đối chiếu.
3. Bấm ô **+** để chọn một hoặc nhiều ảnh. Tên ảnh xếp A–Z, có thứ tự số tự nhiên, rồi điền từ ô đang chọn vào các ô trống.
4. Kéo thả ảnh giữa các ô để đổi vị trí. Trên điện thoại: bấm **↔** trên một ảnh rồi chọn ô cần đổi. Bấm **×** để bỏ ảnh.
5. Khi đủ ảnh, bấm **Xác nhận**. Hệ thống tải ảnh và gắn vào đúng vị trí. Nếu vừa bấm **Lưu**, đề được lưu tiếp sau khi ảnh tải thành công.

**Để sau** đóng cửa sổ và giữ nguyên đề, không lưu đề thiếu ảnh. Một ảnh tải lỗi sẽ báo ngay tại ô; bấm Xác nhận để thử lại, những ảnh đã tải thành công được giữ.

Nút **▧ Ảnh** chèn `##!##` tại con trỏ. Các ảnh đã có dạng `##https://...##` tiếp tục được sử dụng. Soạn câu và sửa hàng loạt đều hỗ trợ cửa sổ chọn ảnh này.

## Cập nhật

Nếu đã triển khai đầy đủ V92, mở CMD tại thư mục có `firebase.json` rồi chạy:

```sh
firebase deploy --only hosting
```

Nếu chưa triển khai phần giao bài tự động V92:

```sh
npm ci --prefix functions
firebase deploy --only "functions:autoAssign,firestore:indexes,hosting"
```

Sau đó mở lại web và nhấn Ctrl+F5.

## Kiểm tra

Đã kiểm tra cú pháp/import và 12 tình huống về nhận diện vị trí ảnh, xếp tên, đổi ô, thiếu ảnh, tải lỗi và thử lại. Chưa kiểm tra tải ảnh bằng tài khoản Cloudinary thật hoặc triển khai lên Firebase của người dùng. Bộ kiểm thử giao bài tự động V92 vẫn có trong dự án.

Chạy các kiểm thử bằng `npm test --prefix functions`.
