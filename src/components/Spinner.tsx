// Biểu tượng loading nhỏ (vòng xoay, màu thương hiệu) — dùng khi bấm nút rồi phải đợi (đăng nhập, tạo
// tài khoản, đăng xuất...). Quy ước UI: nút giữ NGUYÊN chữ (không đổi thành "Creating..."/"Signing in..."),
// vòng xoay hiện ở GIỮA, NGAY BÊN DƯỚI nút/hàng nút — xem BusyIndicator.
export default function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-2 border-gold-500 border-t-transparent ${className}`}
    />
  );
}

/** Vòng xoay căn giữa bên dưới nút/hàng nút — chỉ hiện khi đang đợi (cùng chỗ với dòng báo lỗi: lỗi luôn
 *  được xoá lúc bấm nút nên 2 thứ không bao giờ hiện cùng lúc). */
export function BusyIndicator({ busy }: { busy: boolean }) {
  if (!busy) return null;
  return (
    <div className="mt-3 flex justify-center">
      <Spinner />
    </div>
  );
}
