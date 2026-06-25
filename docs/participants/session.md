# participants/session.js

## Mục đích

Module này chịu trách nhiệm quản lý trạng thái (state) của toàn bộ người tham gia trong một phiên quay số.

Khác với `clean.js` chỉ làm sạch dữ liệu đầu vào, `session.js` đóng vai trò như một database tạm thời (file-based database) cho toàn bộ session.

---

# Vai trò trong hệ thống

```text
Google Sheet / CSV
        │
        ▼
participants/clean.js
        │
        ▼
participants.session.json
        │
        ▼
participants/session.js
        │
        ▼
randomizer.js
        │
        ▼
main.js
```

Sau khi dữ liệu người tham gia được làm sạch bởi `clean.js`, module này sẽ:

1. Lưu dữ liệu xuống session file.
2. Đọc dữ liệu session.
3. Tìm participant.
4. Ghi nhận lịch sử trúng thưởng.
5. Cập nhật trạng thái participant.

---

# Session File

File được quản lý:

```text
sessions/

participants.session.json
```

Ví dụ:

```json
[
  {
    "customerId": "CUS001",
    "fullName": "Nguyen Van A",
    "phone": "0901234567",
    "displayLast3": "567",
    "displayMaskedPhone": "0901xxx567",
    "winCount": 0,
    "prizes": [],
    "history": []
  }
]
```

File này được xem là "source of truth" của toàn bộ participant trong session hiện tại.

---

# Nhóm Logic Nội Bộ

Các hàm dưới đây không export.

Chúng chỉ phục vụ hoạt động bên trong module.

---

## ensureSessionDirectory()

### Mục đích

Đảm bảo thư mục:

```text
./sessions
```

luôn tồn tại.

Nếu thư mục chưa tồn tại:

```text
sessions/
```

sẽ được tạo tự động.

### Khi nào chạy

Mỗi lần hệ thống ghi dữ liệu.

---

## saveParticipants()

### Mục đích

Ghi toàn bộ participant hiện tại xuống file session.

### Input

```javascript
participants
```

### Output

```text
participants.session.json
```

### Ví dụ

Trước:

```json
[]
```

Sau:

```json
[
  {
    "customerId": "CUS001"
  }
]
```

---

## readParticipants()

### Mục đích

Đọc trạng thái participant hiện tại từ session file.

### Output

```javascript
[
  participant1,
  participant2
]
```

Nếu file chưa tồn tại:

```javascript
[]
```

---

# Public API

Đây là các hàm được phép gọi từ bên ngoài module.

---

## initializeParticipants()

### Mục đích

Khởi tạo session mới.

### Flow

```text
Clean Participants
        │
        ▼
initializeParticipants()
        │
        ▼
participants.session.json
```

### Input

```javascript
[
  participant1,
  participant2
]
```

### Output

```javascript
[
  participant1,
  participant2
]
```

### Side Effect

Ghi dữ liệu xuống:

```text
participants.session.json
```

### Thời điểm sử dụng

Đầu chương trình.

Ví dụ:

```javascript
const cleaned =
  cleanParticipants(rawData);

initializeParticipants(cleaned);
```

---

## getParticipants()

### Mục đích

Lấy toàn bộ participant hiện tại.

### Flow

```text
participants.session.json
        │
        ▼
getParticipants()
        │
        ▼
Array<Participant>
```

### Ví dụ

```javascript
const participants =
  getParticipants();
```

### Use Case

Randomizer cần danh sách participant hợp lệ.

---

## findParticipant()

### Mục đích

Tìm participant theo customerId.

### Input

```javascript
customerId
```

### Output

```javascript
participant
```

hoặc

```javascript
undefined
```

### Ví dụ

```javascript
findParticipant(
  "CUS001"
);
```

### Use Case

Kiểm tra thông tin winner.

Kiểm tra participant đã tồn tại hay chưa.

---

## confirmWinner()

### Mục đích

Ghi nhận một participant đã được xác nhận trúng thưởng.

Đây là hàm quan trọng nhất của module.

---

# Flow

```text
Winner Candidate
        │
        ▼
main.js xác minh
        │
        ▼
confirmWinner()
        │
        ▼
participant updated
```

---

# Input

```javascript
{
  customerId,
  prizeCode,
  prizeName,
  status
}
```

Ví dụ:

```javascript
{
  customerId: "CUS001",
  prizeCode: "IP16",
  prizeName: "iPhone 16",
  status: "confirmed"
}
```

---

# Các cập nhật được thực hiện

## 1. Tăng số lần thắng

Trước:

```json
{
  "winCount": 0
}
```

Sau:

```json
{
  "winCount": 1
}
```

---

## 2. Thêm giải thưởng đã nhận

Trước:

```json
{
  "prizes": []
}
```

Sau:

```json
{
  "prizes": [
    {
      "prizeCode": "IP16",
      "prizeName": "iPhone 16"
    }
  ]
}
```

---

## 3. Thêm lịch sử giao dịch

Trước:

```json
{
  "history": []
}
```

Sau:

```json
{
  "history": [
    {
      "timestamp": "2026-06-25T10:00:00Z",
      "prizeCode": "IP16",
      "prizeName": "iPhone 16",
      "status": "confirmed"
    }
  ]
}
```

---

# Tại sao phải có History

History phục vụ:

* Audit kết quả quay số.
* Xuất báo cáo sau chương trình.
* Điều tra khiếu nại.
* Chống gian lận.
* Khôi phục trạng thái khi ứng dụng restart.

---

# Trách nhiệm của Module

Module này KHÔNG:

* Random người thắng.
* Chọn giải thưởng.
* Kiểm tra luật trùng thưởng.
* Điều phối workflow.

Các nhiệm vụ trên thuộc:

```text
randomizer.js
main.js
prize.js
```

Module này CHỈ quản lý trạng thái participant trong session hiện tại.
