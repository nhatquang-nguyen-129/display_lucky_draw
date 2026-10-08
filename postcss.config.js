// PostCSS chỉ chạy Tailwind + Autoprefixer cho CSS của renderer — Vite tự đọc file này lúc build/dev.
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
