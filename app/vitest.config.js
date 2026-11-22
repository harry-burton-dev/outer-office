// Tests for the app's own code: pure modules and React screens, in jsdom.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: here("."),
  plugins: [react()],
  resolve: { alias: { "@": here("./src") } },
  define: { __APP_VERSION__: JSON.stringify("0.0.0-test"), __BUILT_AT__: JSON.stringify("2026-01-01T00:00:00.000Z") },
  test: { environment: "jsdom", include: ["src/**/*.test.{ts,tsx}"], passWithNoTests: true },
});
