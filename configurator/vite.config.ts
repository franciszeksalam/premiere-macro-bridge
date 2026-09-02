import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The action registry lives one level up, in the bridge itself. Importing it
// rather than reimplementing its rules is deliberate: the GUI must accept
// exactly what the helper accepts.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    fs: { allow: [".."] }
  },
  build: {
    outDir: "dist",
    target: "safari15",
    emptyOutDir: true
  }
});
