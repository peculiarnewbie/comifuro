import { defineConfig } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  vite: {
    plugins: [tailwindcss()]
  },

  server: {
    preset: "cloudflare-pages",

    rollupConfig: {
      external: ["node:async_hooks"]
    }
  }
});