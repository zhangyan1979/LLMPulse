import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Vite's dev client and React refresh preamble are inline scripts. Allow them
 * only in the dev server; the packaged renderer keeps the strict CSP.
 */
const devCsp: Plugin = {
  name: "llmpulse-dev-csp",
  apply: "serve",
  transformIndexHtml(html) {
    return html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'");
  }
};

export default defineConfig({
  base: "./",
  plugins: [react(), devCsp],
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
    sourcemap: false
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  }
});
