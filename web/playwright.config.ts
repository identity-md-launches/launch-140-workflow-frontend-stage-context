import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 45000,
  expect: { timeout: 12000 },
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "../docs/frontend/browser-results.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:4173/ipfs/bafy-pvpad/",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/serve.mjs",
    url: "http://127.0.0.1:4173/ipfs/bafy-pvpad/",
    reuseExistingServer: true,
  },
});
