import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";
export default defineConfig({
  plugins: [
    react(),
    {
      name: "development-deployment-assets",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const path = req.url?.split("?")[0];
          if (
            !path ||
            !/^\/(imd-deployment\.json|network\.json|abi\/(PVP|PvPadHook)\.json)$/.test(
              path,
            )
          )
            return next();
          try {
            const bytes = await readFile(
              new URL(`../dist${path}`, import.meta.url),
            );
            res.setHeader("Content-Type", "application/json");
            res.end(bytes);
          } catch {
            res.statusCode = 404;
            res.end(
              "Run npm run build first to generate runtime deployment assets.",
            );
          }
        });
      },
    },
  ],
  base: "./",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("/node_modules/")) return;
          return /\/(react|react-dom|scheduler)\//.test(id) ? "react" : "ethereum";
        },
      },
    },
  },
  server: { host: "127.0.0.1" },
});
