import Button from "@/components/Button";

export default function Settings() {
  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-medium text-base-100">Cài đặt</h1>
        <p className="mt-1 text-sm text-base-400">Kết nối nguồn dữ liệu và tuỳ chỉnh chung.</p>
      </header>

      <div className="max-w-xl rounded-xl border border-base-800 bg-base-900 p-6">
        <h2 className="font-display text-base font-medium text-base-100">Kết nối Google Sheets</h2>
        <p className="mt-1 text-sm text-base-400">
          Đồng bộ danh sách người chơi trực tiếp từ Google Sheets. Yêu cầu đăng nhập Google một lần,
          sau đó có thể làm mới dữ liệu bất kỳ lúc nào kể cả offline (dùng dữ liệu đã cache lần cuối).
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" disabled>
            Đăng nhập Google (sắp có)
          </Button>
        </div>
        <p className="mt-3 text-xs text-base-500">
          Đây là điểm mở rộng tiếp theo — cần OAuth2 client id/secret riêng và Google Sheets API v4.
        </p>
      </div>
    </div>
  );
}
