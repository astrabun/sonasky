import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The SPA is built by Vite into dist/client; the Worker (src/worker) is bundled
// and served by Wrangler. In dev, run `pnpm dev` (this server) alongside
// `pnpm dev:worker` (`wrangler dev` on :8787) - the proxy below forwards the
// API + OAuth routes to it.
const WORKER_ORIGIN = process.env.WORKER_ORIGIN ?? "http://localhost:8787";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: "dist/client" },
  server: {
    proxy: {
      "/api": WORKER_ORIGIN,
      "/oauth": WORKER_ORIGIN,
      "/client-metadata.json": WORKER_ORIGIN,
      "/jwks.json": WORKER_ORIGIN,
    },
  },
});
