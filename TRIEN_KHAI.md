# Lớp học TTT – V93: chèn ảnh bằng ##!##

Hướng dẫn sử dụng: xem `CHEN_ANH.md`.

Nếu đã cập nhật đầy đủ V92, bản V93 chỉ cần:

```sh
firebase deploy --only hosting
```

Nếu chưa cập nhật tác vụ máy chủ V92, dùng hướng dẫn bên dưới.

---

# Lớp học TTT – V92: sửa giao bài tự động

## Cập nhật từ V91

Giải nén ZIP. Mở CMD/Terminal tại thư mục `lophocttt` có `firebase.json`.
Máy triển khai dùng Node.js 22 và Firebase CLI. Chạy:

```sh
firebase login
npm ci --prefix functions
firebase deploy --only "functions:autoAssign,firestore:indexes,hosting"
```

Dự án đã cấu hình là `lophocttt`. Nếu đã đăng nhập đúng tài khoản, bỏ qua lệnh `firebase login`.

**Bản này phải triển khai Functions, không chỉ Hosting.** Hàm `autoAssign` kiểm tra lịch mỗi phút, kể cả khi giáo viên và học sinh đều đóng web. Firebase CLI tạo tác vụ Cloud Scheduler khi triển khai hàm. Dự án cần dùng gói Blaze.

Lệnh trên chỉ triển khai hàm giao bài mới, index và Hosting. Hàm thông báo `deliverBell` hiện có vẫn được giữ. Khi cài vào dự án mới hoàn toàn, dùng `firebase deploy --only "functions,firestore,hosting"` để có cả phần thông báo và rules.

Sau khi báo triển khai thành công, mở lại web và nhấn Ctrl+F5. Nếu Firebase thông báo index đang được tạo, đợi trạng thái sẵn sàng. Lỗi index của phần hết hạn không còn chặn việc giao bài mới.

## Cách kiểm tra nhanh trên dự án thật

1. Vào Giao bài hàng loạt. Chọn mẫu có học sinh đang học và có câu hỏi trong chuyên đề đã chọn.
2. Bấm Giao tự động, chọn lớp, ngày hôm nay và giờ cách hiện tại khoảng 3 phút. Giờ nhập là giờ Việt Nam, UTC+7. Bấm Bật giao tự động.
3. Xem dòng **Lần tới** dưới mẫu. Đóng toàn bộ tab web. Sau giờ đã đặt khoảng 1–2 phút, mở lại và kiểm tra đợt giao mới cùng tài khoản học sinh nhận bài.
4. Khi thành công, số đợt tăng một và Lần tới chuyển sang kỳ kế tiếp. Khi lỗi, mẫu hiện nguyên nhân và hệ thống thử lại sau 5 phút. Nếu kho câu thiếu, mẫu hiện cảnh báo số học sinh thiếu câu.

Nếu không thấy đợt giao mới, kiểm tra trong Firebase Console có hàm `autoAssign`, vùng `asia-southeast1`, hoặc xem nhật ký:

```sh
firebase functions:log --only autoAssign
```

Các lịch đã bật từ V91 được giữ nguyên. Lịch đang tạm dừng cần bật lại. Nếu lịch quá hạn nhiều kỳ, hệ thống giao kỳ đến hạn gần nhất, không tạo hàng loạt bài bù. Hạn nộp vẫn tính từ giờ lịch đã đặt: bài về nhà 48 giờ, bài ở lớp 5 giờ; cách gia hạn và làm bù hiện có được giữ nguyên. Vì vậy một lịch rất cũ có thể tạo bài đã qua hạn; nên đặt giờ mới nếu muốn giao bài còn nguyên thời gian làm.

## Những lỗi đã sửa

- V91 chỉ kiểm tra lịch trong tab đang mở; chưa có tác vụ giao bài chạy trên máy chủ.
- Lỗi xử lý bài hết hạn có thể dừng luôn phần giao theo lịch. Hai bước nay được xử lý độc lập.
- Mốc kiểm tra được lưu có thể cũ hoặc rỗng, làm lịch thật không được kiểm tra. Nay đọc các lịch đang bật mỗi lượt.
- Khóa bảo trì có thể giữ kết quả cũ khi Firestore thử lại transaction. Nay kết quả lấy từ lần transaction đã chốt; có mã xác định phiên giữ khóa.
- Giao bị gián đoạn có thể chạy lại, thay câu hoặc thay trạng thái của bài đã tạo. Nay lưu kỳ đang chạy, kiểm tra khóa trước mỗi nhóm ghi và giữ nguyên bài đã tồn tại.
- Tạm dừng rồi bật lại lịch cũ có thể giao lại kỳ đã hoàn tất. Nay chuyển qua kỳ kế tiếp chưa giao.
- Chuyên đề rỗng hoặc mức độ chưa có câu làm mất lượt chọn dù chuyên đề khác còn câu phù hợp. Nay thử chuyên đề/mức độ đã chọn còn lại, không vượt mức độ cao nhất đã chọn và chỉ tính lượt sử dụng khi thực sự chọn được câu.
- Không có học sinh/câu phù hợp không còn được tính thành một đợt giao thành công. Một mẫu lỗi không chặn các mẫu khác.
- Ngày giờ thống nhất UTC+7 giữa máy chủ và trình duyệt. Hiển thị lần giao tới, lần thành công, lỗi và cảnh báo thiếu câu ngay trên mẫu, tự cập nhật.

## Kiểm thử và mã nguồn

Đã chạy 14 tình huống kiểm thử tự động với Firestore mô phỏng, gồm tranh chấp nhiều phiên, lỗi index, giao thiếu câu, tạm dừng/bật lại và khôi phục đợt 205 học sinh sau khi mất kết nối. Đã kiểm tra cú pháp/import, nạp Functions với Firebase SDK thật và kiểm tra các thao tác hiển thị trạng thái, bật/tắt, lưu lịch trong DOM mô phỏng. Chưa triển khai hay kiểm tra dữ liệu Firebase thật của người dùng.

Chạy lại kiểm thử:

```sh
npm test --prefix functions
```

`functions/build-assignment-runtime.cjs` sao chép đúng 5 mô-đun xử lý bài từ `public/js` vào `functions/assignment-runtime`, dùng cầu nối Admin Firestore cho máy chủ. Lệnh predeploy tự đồng bộ chúng trước khi triển khai Functions. ZIP đã có runtime đồng bộ; không chứa `node_modules`.

Tài liệu Firebase về tác vụ định kỳ: https://firebase.google.com/docs/functions/schedule-functions
