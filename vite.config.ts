import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: Number(process.env.PORT) || 3000,
    allowedHosts: [".replit.dev", ".pike.replit.dev", "localhost"],
    proxy: {
      "/analyze-cards": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
