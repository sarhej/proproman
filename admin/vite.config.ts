import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  /** Tenant / platform console (SUPER_ADMIN). Workspace admin stays at /admin in the main client SPA. */
  base: "/platform/",
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    proxy: {
      "/api": "http://localhost:8080",
    },
  },
});
