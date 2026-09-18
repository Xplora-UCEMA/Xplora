import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5199",
    browserName: "chromium",
    channel: "chrome",
    reducedMotion: "reduce",
  },
  webServer: {
    command: "npm run dev:vite -- --host 127.0.0.1 --port 5199 --strictPort",
    url: "http://127.0.0.1:5199",
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_KEY: "public-test-key",
      VITE_API_ORIGIN: "",
      VITE_PANEL_PATH: "/panel",
      VITE_PUBLIC_MEMBER_ENTRY_ENABLED: process.env.VITE_PUBLIC_MEMBER_ENTRY_ENABLED ?? 'false',
    },
  },
});
