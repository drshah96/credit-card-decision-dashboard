import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Card art must never be inlined as base64, however small the file.
    // Vite inlines assets under 4 KB by default, which quietly swept 14 of the
    // smaller WebP thumbnails into the JS bundle: base64 costs ~33% over the
    // raw bytes, and — worse — an inlined image ships with the bundle on every
    // route, so it is fetched even on pages that never render it. That defeats
    // the loading="lazy" on the list thumbnails entirely.
    //
    // Issuer logos keep the default behaviour: they're ~1 KB SVGs, nine of
    // them render together above the fold on the home page, and inlining them
    // genuinely does save nine requests.
    assetsInlineLimit: (filePath: string) =>
      filePath.includes("/assets/cards/") ? false : undefined,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:8000",
      "/health": "http://localhost:8000",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests.setup.ts"],
    include: ["./tests/**/*.test.{ts,tsx}"],
    typecheck: {
      tsconfig: "./tsconfig.test.json",
    },
  },
});