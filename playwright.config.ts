import { defineConfig,devices } from "@playwright/test";

export default defineConfig({
  testDir:"./e2e",
  timeout:90_000,
  expect:{timeout:20_000},
  fullyParallel:false,
  workers:1,
  retries:0,
  maxFailures:5,
  reporter:[["list"]],
  webServer:[
    {
      command:"npm run preview -- --host 127.0.0.1 --port 4173",
      url:"http://127.0.0.1:4173/",
      reuseExistingServer:false,
      timeout:120_000
    },
    {
      command:"node scripts/plain-static-server.mjs 4174 dist",
      url:"http://127.0.0.1:4174/",
      reuseExistingServer:false,
      timeout:30_000
    }
  ],
  use:{
    baseURL:"http://127.0.0.1:4173/",
    trace:"retain-on-failure",
    screenshot:"only-on-failure"
  },
  projects:[
    {
      name:"chromium",
      use:{...devices["Desktop Chrome"]}
    },
    {
      name:"chromium-mobile",
      use:{...devices["Pixel 7"]}
    },
    {
      name:"firefox",
      use:{...devices["Desktop Firefox"]}
    },
    {
      name:"webkit-mobile",
      use:{...devices["iPhone 14"]}
    }
  ]
});
