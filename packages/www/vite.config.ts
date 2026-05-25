import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite-plus";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
    plugins: [
        TanStackRouterVite({ target: "solid", autoCodeSplitting: true }),
        solid(),
        tailwindcss(),
        ...(process.env.VITEST ? [] : [cloudflare()]),
    ],
    server: {
        allowedHosts: true,
    },
    staged: {
        "*": "vp check --fix",
    },
    lint: { options: { typeAware: true, typeCheck: true } },
});
