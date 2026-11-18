import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.resolve(ROOT, "out");
const WASM_DIR = path.resolve(import.meta.dirname, "node_modules/web-ifc");

const MIME: Record<string, string> = {
  ".json": "application/json; charset=utf-8",
  ".ifc": "application/x-step; charset=utf-8",
  ".bcf": "application/zip",
  ".md": "text/markdown; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

function sendFile(res: ServerResponse, filePath: string): boolean {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.statusCode = 200;
  res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream");
  fs.createReadStream(filePath).pipe(res);
  return true;
}

function listOutJoints(): string[] {
  if (!fs.existsSync(OUT_DIR)) return [];
  return fs
    .readdirSync(OUT_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(OUT_DIR, d.name, "bundle.json")))
    .map((d) => d.name)
    .sort();
}

function attachOutMiddleware(
  middlewares: { use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void },
) {
  middlewares.use((req, res, next) => {
    const urlPath = (req.url ?? "/").split("?")[0];
    if (urlPath === "/out-index.json") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ joints: listOutJoints() }));
      return;
    }
    if (urlPath.startsWith("/out/")) {
      const rel = decodeURIComponent(urlPath.slice("/out/".length));
      const candidate = path.resolve(OUT_DIR, rel);
      if (candidate.startsWith(OUT_DIR + path.sep) && sendFile(res, candidate)) {
        return;
      }
    }
    if (urlPath.startsWith("/wasm/")) {
      const rel = decodeURIComponent(urlPath.slice("/wasm/".length));
      const candidate = path.resolve(WASM_DIR, rel);
      if (candidate.startsWith(WASM_DIR + path.sep) && sendFile(res, candidate)) {
        return;
      }
    }
    next();
  });
}

function rebartwinAssetsPlugin(): Plugin {
  return {
    name: "rebartwin-assets",
    configureServer(server) {
      attachOutMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachOutMiddleware(server.middlewares);
    },
    writeBundle(options) {
      const outDir = options.dir ?? path.resolve(import.meta.dirname, "dist");
      const wasmTarget = path.join(outDir, "wasm");
      fs.mkdirSync(wasmTarget, { recursive: true });
      for (const file of ["web-ifc.wasm", "web-ifc-mt.wasm"]) {
        const src = path.join(WASM_DIR, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(wasmTarget, file));
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), rebartwinAssetsPlugin()],
  resolve: {
    dedupe: ["react", "react-dom", "three"],
  },
  optimizeDeps: {
    exclude: ["web-ifc"],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
  preview: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
