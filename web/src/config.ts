import {
  type Abi,
  type Address,
  type Hex,
  isAddress,
  keccak256,
  toHex,
  sha256,
} from "viem";
export type Contract = {
  name: string;
  address: Address;
  abiHash: string;
  abiPath: string;
  abi: Abi;
};
export type Deployment = {
  version: number;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  contracts: Contract[];
  assets: { path: string; sha256: string }[];
};
export type Network = {
  name: string;
  rpcUrls: string[];
  explorer: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  infrastructure: { router: Address; quoter: Address; permit2: Address };
  pool: {
    fee: number;
    tickSpacing: number;
    pairedCurrency: Address;
    manager: Address;
    initialPrice: string;
  };
};
export type Config = {
  deployment: Deployment;
  network: Network;
  token: Contract;
  hook: Contract;
};
function canonical(x: unknown): unknown {
  return Array.isArray(x)
    ? x.map(canonical)
    : x && typeof x === "object"
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, canonical((x as Record<string, unknown>)[k])]),
        )
      : x;
}
export const canonicalHash = (x: unknown) =>
  keccak256(toHex(JSON.stringify(canonical(x)))).slice(2);
const safePath = (p: string) =>
  /^[a-zA-Z0-9_./-]+$/.test(p) &&
  !p.startsWith("/") &&
  !p.split("/").includes("..");
async function fetchText(path: string) {
  if (!safePath(path)) throw Error("Unsafe configuration path");
  const response = await fetch(
    new URL(path, new URL(import.meta.env.BASE_URL, document.baseURI)),
    { cache: "no-cache" },
  );
  if (!response.ok)
    throw Error(`Cannot load ${path}. Reload or check this static export.`);
  return response.text();
}
export async function loadConfig(): Promise<Config> {
  const deployment = JSON.parse(
    await fetchText("imd-deployment.json"),
  ) as Deployment;
  if (
    deployment.version !== 1 ||
    !Number.isSafeInteger(deployment.chainId) ||
    deployment.contracts.length !== 2 ||
    !/^[a-f0-9]{64}$/.test(deployment.attestationHash)
  )
    throw Error("Invalid deployment manifest");
  const loadAsset = async (path: string) => {
    const entry = deployment.assets.find((a) => a.path === path);
    const raw = await fetchText(path);
    if (!entry || sha256(toHex(raw)).slice(2) !== entry.sha256)
      throw Error(`Asset integrity failed: ${path}`);
    return JSON.parse(raw);
  };
  for (const c of deployment.contracts) {
    c.abi = (await loadAsset(c.abiPath)) as Abi;
    if (
      !isAddress(c.address) ||
      !Array.isArray(c.abi) ||
      canonicalHash(c.abi) !== c.abiHash
    )
      throw Error(`ABI binding failed: ${c.name}`);
  }
  const token = deployment.contracts.find((c) => c.name === "PVP");
  const hook = deployment.contracts.find((c) => c.name === "PvPadHook");
  if (!token || !hook) throw Error("Deployment is missing required contracts");
  const network = (await loadAsset("network.json")) as Network;
  if (
    network.rpcUrls.length === 0 ||
    network.rpcUrls.some((u) => !u.startsWith("https://")) ||
    !Object.values(network.infrastructure).every((a) => isAddress(a))
  )
    throw Error("Invalid public network configuration");
  return { deployment, network, token, hook };
}
export const bytes32 = (s: string): s is Hex => /^0x[0-9a-fA-F]{64}$/.test(s);
