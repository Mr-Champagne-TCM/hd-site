import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // No source maps in production. A source map republishes the whole original
    // tree to anyone who opens devtools, and tools/leak-scan.mjs blocks a build
    // that emits one -- this is the setting that keeps that check quiet.
    sourcemap: false,
    outDir: "dist",
    emptyOutDir: true,
  },
});
