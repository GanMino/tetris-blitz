import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  // GitHub Pages 部署在项目子路径下；本地开发/测试仍走根路径。
  base: mode === 'production' ? '/tetris-blitz/' : '/',
  server: {
    host: '127.0.0.1',
    port: 5188,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4188,
    strictPort: true,
  },
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
}));
