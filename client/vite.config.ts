import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": "http://localhost:8080",
      "/legal": "http://localhost:8080",
      // Workspace-plane API + MCP (`/t/:slug/api/...`, `/t/:slug/mcp`); HTML navigations stay on Vite.
      "/t": {
        target: "http://localhost:8080",
        changeOrigin: true,
        bypass(req) {
          const accept = req.headers.accept ?? "";
          if ((req.method === "GET" || req.method === "HEAD") && accept.includes("text/html")) {
            return "/index.html";
          }
          return false;
        }
      }
    }
  }
});
