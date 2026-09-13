import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

import express from "express";
import cors from "cors";
import { projectRouter } from "./routes/project.js";
import { exportRouter, DEFAULT_EXPORT_FOLDER } from "./export/exportRouter.js";
import { aiRouter } from "./routes/ai.js";
import { brushRouter } from "./routes/brush.js";
import { debugLogRouter, isDebugLogEnabled } from "./routes/debugLog.js";
import {
  DISCOVERY_VERSION,
  SERVICE_ID,
  getClientPort,
  getLocalAddresses,
  startAdvertising,
  stopAdvertising,
  type DiscoveryInfo,
} from "./discovery.js";
import { loadConfig } from "./backup.js";
import { attachSyncServer, closeSyncServer } from "./sync.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware — allow all origins by default so the client can live on a
// different host/port without CORS issues.
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Serve exported project assets (textures, frames.json, etc.)
const exportsDir = process.env.EXPORT_FOLDER || DEFAULT_EXPORT_FOLDER;
app.use("/exports", express.static(exportsDir));

// Routes
app.use("/api", projectRouter);
app.use("/api", exportRouter);
app.use("/api", aiRouter);
// Brush documents (`src/data/brushes/*.json`) — see `routes/brush.ts`.
app.use("/api", brushRouter);
// Diagnostic sink for on-device debugging — see `routes/debugLog.ts`.
// ⚠️ DEVELOPMENT ONLY. The route is unauthenticated and accepts arbitrary
// JSON, which is acceptable on a local dev server and nowhere else.
if (isDebugLogEnabled()) {
  app.use("/api", debugLogRouter);
  console.log("🐛 Debug log sink mounted at /api/debug/log (dev only)");
}

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Discovery identity endpoint — lets the iPad companion (`ios-companion/`)
// confirm that a host it found is actually this editor and not some other
// server answering on the same port. See `src/discovery.ts`.
app.get("/api/discovery", async (_req, res) => {
  let currentProject: string | null = null;
  try {
    currentProject = (await loadConfig()).currentProject ?? null;
  } catch {
    // Config is optional context, not part of the identity contract.
  }

  const info: DiscoveryInfo = {
    service: SERVICE_ID,
    name: "Pixel Art Editor",
    clientPort: getClientPort(),
    apiPort: Number(PORT),
    currentProject,
    addresses: getLocalAddresses(),
    version: DISCOVERY_VERSION,
  };
  res.json(info);
});

// Bind on `::` (all interfaces, dual-stack) so the iPad companion can reach
// the API across the LAN over either IP version. Two traps here:
//   - Loopback-only binding makes the server invisible to every other device.
//   - Binding "0.0.0.0" opens an IPv4-only socket, so the IPv6 addresses we
//     advertise in /api/discovery would be advertised but unreachable.
// Node maps IPv4 clients onto the dual-stack socket automatically.
const server = app.listen(Number(PORT), "::", async () => {
  console.log(`🎨 Pixel Art server running on http://localhost:${PORT}`);
  console.log(
    "📁 Backups will be created on auto-save (max every 5 minutes per project)",
  );

  for (const address of getLocalAddresses()) {
    console.log(`🌐 LAN: http://${address}:${PORT}`);
  }

  startAdvertising(Number(PORT));
});

// Cross-instance sync. Shares the HTTP server's port; see `src/sync.ts`.
attachSyncServer(server);

// Withdraw the mDNS advertisement on shutdown so the companion does not resolve
// a dead record. Without this the service lingers in caches for ~2 minutes.
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n👋 ${signal} received — shutting down`);
  await stopAdvertising();
  await closeSyncServer();
  server.close(() => process.exit(0));
  // Do not let a hung keep-alive connection block exit indefinitely.
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
