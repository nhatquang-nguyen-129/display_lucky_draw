# Participants — tài liệu chi tiết

Mảng "participants" (người tham gia quay số) trải qua 3 giai đoạn: **Import** dữ liệu từ file → **gán nhãn cột** (Data Type = cột nào là Name/Phone/Code/Email) → **quay số** (Draw Engine/Winner Name đọc động theo nhãn đó). 4 file trong thư mục này tách theo đúng ranh giới đó. Kiến trúc chung của app (IPC, schema, multi-window) xem [`docs/architecture/`](../architecture/README.md).

| File | Nội dung |
|---|---|
| [import.md](./import.md) | Luồng import CSV/Excel — vì sao KHÔNG đoán cột theo tên header, cách xử lý BOM/parse |
| [column-mapping.md](./column-mapping.md) | Data Type — cơ chế DUY NHẤT gán nhãn cột, và cách phần còn lại của app đọc động theo nhãn đó |
| [data-editor.md](./data-editor.md) | Command Pattern, EditorState, toolbar Edit/Format/Data/Generate, autosave |
| [schema.md](./schema.md) | Cột DB của `participants` + `sessions`, mô hình 2 tầng field (core/extra_data) |

Bối cảnh: trước đây import tự đoán cột file nào là "tên"/"sđt"/"email" bằng cách so khớp chuỗi cứng (`"name"`, `"Họ tên"`...). Cách này vỡ bất cứ khi nào file có BOM, tên cột viết khác đi, hoặc dùng ngôn ngữ/biến thể chưa liệt kê — biểu hiện ra ngoài là "Imported 0/555 participants" dù file có dữ liệu thật. Quyết định thiết kế mới (xem [import.md](./import.md) + [column-mapping.md](./column-mapping.md)): import không đoán gì cả, đưa nguyên mọi cột vào Data Editor, người tổ chức tự gán nhãn — tên cột trong file không còn ý nghĩa gì với hệ thống.
