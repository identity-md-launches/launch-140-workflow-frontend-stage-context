import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { keccak256, toHex } from "viem";
const manifest = JSON.parse(await readFile("../dist/imd-deployment.json"));
const handoff = JSON.parse(await readFile("config/handoff.json"));
for (const k of [
  "version",
  "launchId",
  "chainId",
  "sourceCommit",
  "attestationHash",
])
  assert.deepEqual(manifest[k], handoff[k]);
assert.deepEqual(
  manifest.contracts.map(({ abiPath, ...c }) => c),
  handoff.contracts.map(({ name, address, abiHash }) => ({
    name,
    address,
    abiHash,
  })),
);
const files = async (dir, base = "") =>
  (
    await Promise.all(
      (await readdir(dir, { withFileTypes: true })).map((e) =>
        e.isDirectory()
          ? files(`${dir}/${e.name}`, `${base}${e.name}/`)
          : `${base}${e.name}`,
      ),
    )
  ).flat();
assert.deepEqual(
  manifest.assets.map((a) => a.path).sort(),
  (await files("../dist")).filter((p) => p !== "imd-deployment.json").sort(),
);
let total = 0;
for (const { path, sha256 } of manifest.assets) {
  assert(!path.startsWith("/") && !path.includes("..") && !path.includes(":"));
  const data = await readFile(`../dist/${path}`);
  total += data.length;
  assert(data.length <= 8388608);
  assert.equal(createHash("sha256").update(data).digest("hex"), sha256);
}
const canonical = (x) =>
  Array.isArray(x)
    ? x.map(canonical)
    : x && typeof x === "object"
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, canonical(x[k])]),
        )
      : x;
for (const c of manifest.contracts)
  assert.equal(
    keccak256(
      toHex(
        JSON.stringify(
          canonical(JSON.parse(await readFile(`../dist/${c.abiPath}`))),
        ),
      ),
    ).slice(2),
    c.abiHash,
  );
assert(manifest.assets.length <= 128 && total < 32 * 1024 * 1024);
console.log(
  JSON.stringify(
    {
      result: "PASS",
      assets: manifest.assets.length,
      exportBytes: total,
      abiHashes: "both match",
      deployment: "exact handoff",
      allAssetHashes: "match",
    },
    null,
    2,
  ),
);
