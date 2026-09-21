import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Served under sonasky.app/debug/explorer via a Worker route, not at the domain root.
export default defineConfig({
  base: "/debug/explorer/",
  plugins: [react(), tailwindcss()],
});
