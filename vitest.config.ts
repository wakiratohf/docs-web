import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Cấu hình riêng cho vitest (tách khỏi vite.config.ts để không kéo plugin
// build vào lúc chạy test). Giữ cùng alias "@/..." như vite.config.ts.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
  },
});
