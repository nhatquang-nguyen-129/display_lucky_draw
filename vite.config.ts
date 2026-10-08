// Vite build/dev server cho renderer. base "./" để bản đóng gói nạp asset bằng đường dẫn tương đối
// (file://), cổng 5173 cố định (strictPort) vì electron:dev chờ đúng cổng này (wait-on tcp:5173).
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
  },
});
