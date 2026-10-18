import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL:
      process.env.BETABENCH_BASE_URL || "http://127.0.0.1:5173/Betabench/",
    browserName: "chromium",
    channel: process.env.CI ? undefined : "msedge",
  },
  webServer: {
    command: "npm run dev -- --port 5173",
    url: "http://127.0.0.1:5173/Betabench/",
    reuseExistingServer: !process.env.CI,
  },
  timeout: 40000,
});
