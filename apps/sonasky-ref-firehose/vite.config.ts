import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Served under ref.sonasky.app/firehose via a Worker route, not at the domain root.
export default defineConfig({
  base: "/firehose/",
  plugins: [react(), tailwindcss()],
});
