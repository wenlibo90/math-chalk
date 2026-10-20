import { defineConfig } from "vite";

const HOSTS = [".cosmoplat.cn", ".cosmoplat.com", ".cosmoplat.net"];
const PROXY = {
  "/api": {
    target: "http://localhost:3001",
    changeOrigin: true,
  },
};

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: HOSTS,
    proxy: PROXY,
  },
  preview: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: HOSTS,
    proxy: PROXY,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
