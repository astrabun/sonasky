import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Expose SWETRIX_* (in addition to the default VITE_*) to client code.
  envPrefix: ["VITE_", "SWETRIX_"],
});
