import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { aliases } from "./aliases";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "..", "");
  const serverTarget = env.VITE_API_URL
    ? new URL(env.VITE_API_URL).origin
    : "http://localhost:3001";

  return {
    plugins: [react()],
    envDir: "..",
    // Shared with `vitest.config.ts` via `aliases.ts` so the two cannot drift.
    // `tsconfig.json`'s `paths` block mirrors the same keys by hand.
    resolve: {
      alias: aliases,
    },
    server: {
      // Bind all interfaces so the iPad companion app (`ios-companion/`) can
      // reach the dev server across the LAN. Loopback-only makes it invisible.
      host: true,
      port: 5173,
      proxy: {
        "/api": {
          target: serverTarget,
          changeOrigin: true,
        },
        "/exports": {
          target: serverTarget,
          changeOrigin: true,
        },
        // NOTE: there is deliberately NO "/ws" entry for the cross-instance
        // sync socket. MEASURED: Vite's `ws: true` proxy does not forward the
        // upgrade here — this same instance proxies `/api` fine (200) while
        // dropping the `/ws` handshake silently, so the socket would hang
        // rather than fail. `resolveSyncUrl()` connects straight to the
        // Express port instead; see `src/api/client/syncClient.ts`.
      },
    },
  };
});
