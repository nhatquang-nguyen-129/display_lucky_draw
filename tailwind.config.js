/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Thang màu trung tính — đảo ngược so với bản dark cũ: 950 giờ là trắng (nền chính),
        // 100 là màu chữ đậm nhất. Giữ nguyên tên biến để không phải sửa lại từng component.
        base: {
          950: "#FFFFFF",
          900: "#F5F6FA",
          800: "#EBEDF3",
          700: "#D8DBE3",
          600: "#B7BAC5",
          500: "#8A8E99",
          400: "#6B6F7B",
          300: "#4B4F5B",
          200: "#2B2E38",
          100: "#14161C",
        },
        // Màu thương hiệu chính — xanh đậm. Vẫn giữ tên "gold" để không phải sửa className
        // ở mọi nơi (button, focus ring...), chỉ đổi giá trị hex thực tế.
        gold: {
          600: "#1B3684",
          500: "#2244A5",
          400: "#3F5FC4",
          300: "#7C93DA",
        },
        // Màu phụ — xanh nhạt. Giữ tên "teal" vì lý do tương tự.
        teal: {
          600: "#12A9CB",
          500: "#20C7F1",
          400: "#5AD6F5",
        },
        // Màu nhấn mới — vàng, dùng cho cảnh báo nhẹ / trạng thái "chưa lưu"
        highlight: {
          600: "#E0AC1A",
          500: "#FFCA2D",
          400: "#FFD75C",
        },
        danger: {
          500: "#C4453B",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["'Space Grotesk'", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};
