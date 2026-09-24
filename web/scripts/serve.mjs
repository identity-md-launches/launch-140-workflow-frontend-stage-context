import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
const root = resolve("../dist");
createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    ).replace(/^\/ipfs\/bafy-pvpad\//, "/");
    const file = resolve(
      root,
      "." + (path.endsWith("/") ? path + "index.html" : path),
    );
    if (!file.startsWith(root + "/")) throw Error("Unsafe path");
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type":
        {
          ".html": "text/html",
          ".js": "application/javascript",
          ".css": "text/css",
          ".json": "application/json",
        }[extname(file)] ?? "application/octet-stream",
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(4173, "127.0.0.1", () =>
  console.log("Static export on http://127.0.0.1:4173/ipfs/bafy-pvpad/"),
);
