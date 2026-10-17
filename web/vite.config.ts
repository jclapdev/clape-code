import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: 5317,
    proxy: { "/api": { target: "http://127.0.0.1:4317", changeOrigin: false } },
  },
  build: { chunkSizeWarningLimit: 1500 },
});
