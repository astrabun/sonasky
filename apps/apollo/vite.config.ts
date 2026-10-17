/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The SPA is built by Vite into dist/client; the Worker (src/worker) is bundled
// and served by Wrangler. In dev, run `pnpm dev` (this server) alongside
// `pnpm dev:worker` (`wrangler dev` on :8787) - the proxy below forwards the
// worker-rendered routes to it. Sign-in and the live viewer (which needs the
// separate usercontent origin) are easiest to test directly on
// http://127.0.0.1:8787 after `pnpm build`.
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
      "/@": WORKER_ORIGIN,
      "/out": WORKER_ORIGIN,
      "/_apollo": WORKER_ORIGIN,
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
