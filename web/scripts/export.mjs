import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { keccak256, toHex } from "viem";
import { build } from "vite";
const handoff = JSON.parse(await readFile("config/handoff.json", "utf8"));
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
if (
  handoff.version !== 1 ||
  handoff.contracts.length !== 2 ||
  !/^[a-f0-9]{40}$/.test(handoff.sourceCommit)
)
  throw Error("Invalid deployment handoff");
const abis = [];
for (const c of handoff.contracts) {
  if (!["PVP", "PvPadHook"].includes(c.name))
    throw Error("Unexpected contract");
  const path = `docs/abi/${c.name}.json`;
  const pinned = execFileSync(
    "git",
    ["show", `${handoff.sourceCommit}:${path}`],
    { cwd: "..", encoding: "utf8" },
  );
  if (pinned !== (await readFile(`../${path}`, "utf8")))
    throw Error(`${path} differs from pinned implementation export`);
  const abi = JSON.parse(pinned);
  if (
    !Array.isArray(abi) ||
    keccak256(toHex(JSON.stringify(canonical(abi)))).slice(2) !== c.abiHash
  )
    throw Error(`ABI mismatch: ${c.name}`);
  abis.push([c.name, pinned]);
}
await build();
await mkdir("../dist/abi", { recursive: true });
for (const [name, abi] of abis)
  await writeFile(`../dist/abi/${name}.json`, abi);
const network = JSON.parse(await readFile("config/network.json", "utf8"));
network.pool = {
  ...handoff.manifest.pool,
  manager: handoff.manifest.hook.constructorArgs[0],
};
await writeFile(
  "../dist/network.json",
  JSON.stringify(network, null, 2) + "\n",
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
const assets = [];
for (const path of (await files("../dist")).sort()) {
  if (path === "imd-deployment.json") continue;
  const bytes = await readFile(`../dist/${path}`);
  if (bytes.length > 8388608) throw Error("Asset exceeds 8 MiB");
  assets.push({
    path,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
if (assets.length > 128) throw Error("Too many assets");
const { launchId, chainId, sourceCommit, attestationHash } = handoff;
await writeFile(
  "../dist/imd-deployment.json",
  JSON.stringify(
    {
      version: 1,
      launchId,
      chainId,
      sourceCommit,
      attestationHash,
      contracts: handoff.contracts.map(({ name, address, abiHash }) => ({
        name,
        address,
        abiHash,
        abiPath: `abi/${name}.json`,
      })),
      assets,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Verified both pinned ABI hashes; emitted deployment manifest with ${assets.length} assets.`,
);
