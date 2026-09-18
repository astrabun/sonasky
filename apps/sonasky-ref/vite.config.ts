import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Expose SWETRIX_* (in addition to the default VITE_*) to client code.
  envPrefix: ["VITE_", "SWETRIX_"],
  server: {
    // Bind explicitly to the IPv4 loopback: atproto's OAuth loopback client
    // spec requires the literal 127.0.0.1 redirect_uri (see App.tsx), and an
    // unset host can resolve "localhost" to IPv6 (::1), leaving 127.0.0.1
    // unreachable once the OAuth flow redirects there.
    host: "127.0.0.1",
  },
});
