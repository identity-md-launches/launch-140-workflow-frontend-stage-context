import { type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  decodeFunctionData,
  encodeFunctionResult,
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
  parseEther,
  toHex,
  zeroAddress,
  type Address,
  type Hex,
  type Abi,
} from "viem";
import { infrastructureAbi } from "../src/chain";
const manifest = JSON.parse(
  readFileSync("../dist/imd-deployment.json", "utf8"),
);
export const token = manifest.contracts.find((c: any) => c.name === "PVP")
  .address as Address;
export const hook = manifest.contracts.find((c: any) => c.name === "PvPadHook")
  .address as Address;
export const tokenAbi = JSON.parse(
  readFileSync("../dist/abi/PVP.json", "utf8"),
) as Abi;
export const hookAbi = JSON.parse(
  readFileSync("../dist/abi/PvPadHook.json", "utf8"),
) as Abi;
export const network = JSON.parse(readFileSync("../dist/network.json", "utf8"));
export const account = "0x1111111111111111111111111111111111111111" as Address;
export const other = "0x2222222222222222222222222222222222222222" as Address;
export const workerAmount = parseEther("0.002");
export const leaf = keccak256(
  keccak256(
    encodeAbiParameters(
      parseAbiParameters("uint256,address,uint256,address,uint256"),
      [BigInt(manifest.chainId), hook, 1n, account, workerAmount],
    ),
  ),
);
export async function setup(
  page: Page,
  options: {
    wallet?: boolean;
    wrongChain?: boolean;
    updater?: boolean;
    missingCode?: boolean;
    rpcFailure?: boolean;
  } = {},
) {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const model = {
    chain: options.wrongChain ? "0x1" : toHex(manifest.chainId),
    accounts: [account] as Address[],
    reject: false,
    simulateRevert: false,
    receiptRevert: false,
    rpcFailure: options.rpcFailure ?? false,
    missingCode: options.missingCode ?? false,
    allowance: 0n,
    permit: 0n,
    expiry: 0,
    claimed: false,
    pot: parseEther("0.5"),
    price: parseEther("0.01"),
    updater: options.updater ? account : other,
    pendingUpdater: zeroAddress as Address,
    epoch: 1n,
    root: leaf,
    windowStart: now - 600n,
    windowEnd: now + 3600n,
    sends: [] as any[],
    simulations: [] as any[],
    calls: [] as string[],
  };
  const receipts = new Map<string, any>();
  function abiFor(to: string): Abi {
    return to.toLowerCase() === token
      ? tokenAbi
      : to.toLowerCase() === hook
        ? hookAbi
        : to.toLowerCase() === network.infrastructure.quoter
          ? infrastructureAbi.quoter
          : to.toLowerCase() === network.infrastructure.permit2
            ? infrastructureAbi.permit2
            : infrastructureAbi.router;
  }
  function rpc(method: string, params: any[]): any {
    model.calls.push(method);
    if (method === "eth_chainId") return toHex(manifest.chainId);
    if (method === "eth_getCode")
      return model.missingCode ? "0x" : "0x60016000";
    if (method === "eth_blockNumber") return "0x100";
    if (method === "eth_getBalance") return toHex(parseEther("2"));
    if (method === "eth_getBlockByNumber")
      return {
        number: "0x100",
        hash: "0x" + "ab".repeat(32),
        parentHash: "0x" + "cd".repeat(32),
        timestamp: toHex(now),
        transactions: [],
        gasLimit: "0x1c9c380",
        gasUsed: "0x0",
        baseFeePerGas: "0x1",
        difficulty: "0x0",
        extraData: "0x",
        miner: zeroAddress,
        nonce: "0x0000000000000000",
        size: "0x100",
        totalDifficulty: "0x0",
      };
    if (method === "eth_getTransactionReceipt")
      return receipts.get(params[0]) ?? null;
    if (method === "eth_getTransactionByHash")
      return {
        hash: params[0],
        blockNumber: "0x100",
        blockHash: "0x" + "ab".repeat(32),
        from: account,
        to: hook,
        input: "0x",
        value: "0x0",
        gas: "0x186a0",
        gasPrice: "0x1",
        nonce: "0x0",
        transactionIndex: "0x0",
        type: "0x0",
        v: "0x1b",
        r: "0x1",
        s: "0x1",
      };
    if (method === "eth_call") {
      const tx = params[0],
        abi = abiFor(tx.to);
      const decoded = decodeFunctionData({ abi, data: tx.data });
      const fn = decoded.functionName;
      const args = (decoded.args ?? []) as any[];
      const values: Record<string, unknown> = {
        poolManager: network.pool.manager,
        king: other,
        beneficiary: other,
        claimPrice: model.price,
        claimCount: 3n,
        workerPot: model.pot,
        currentEpoch: model.epoch,
        updater: model.updater,
        pendingUpdater: model.pendingUpdater,
        availableForNextEpoch: model.pot,
        FEE_BPS: 100n,
        BUMP_BPS: 1000n,
        decimals: 18,
        totalSupply: parseEther("1000000000"),
        balanceOf: parseEther("20000"),
        epochs: [
          model.root,
          model.windowStart,
          model.windowEnd,
          parseEther("0.5"),
          0n,
        ],
        claimed: model.claimed,
        pending: parseEther("0.003"),
        unassigned: parseEther("0.001"),
        deferred: parseEther("0.001"),
        totalSkimmed: parseEther("0.1"),
      };
      if (fn === "allowance")
        return encodeFunctionResult({
          abi,
          functionName: fn,
          result:
            tx.to.toLowerCase() === token
              ? args[0].toLowerCase() === other
                ? parseEther("100")
                : model.allowance
              : [model.permit, model.expiry, 0],
        });
      if (fn === "quoteExactInputSingle") {
        if (model.simulateRevert) throw Error("Quote unavailable");
        return encodeFunctionResult({
          abi,
          functionName: fn,
          result: [
            args[0].zeroForOne
              ? args[0].exactAmount * 900000n
              : args[0].exactAmount / 1100000n,
            90000n,
          ],
        });
      }
      if (fn in values)
        return encodeFunctionResult({
          abi,
          functionName: fn,
          result: values[fn],
        });
      model.simulations.push({ fn, args, tx });
      if (model.simulateRevert) throw Error("Execution reverted in simulation");
      return fn === "approve" || fn === "transfer" || fn === "transferFrom"
        ? encodeFunctionResult({ abi, functionName: fn, result: true })
        : "0x";
    }
    throw Error("Unexpected RPC method: " + method);
  }
  await page.route(
    /https:\/\/(ethereum-sepolia-rpc\.publicnode\.com|rpc\.sepolia\.org)\/?$/,
    async (route) => {
      if (model.rpcFailure) {
        await route.fulfill({ status: 503, body: "Unavailable" });
        return;
      }
      const payload = route.request().postDataJSON();
      const answer = (p: any) => {
        try {
          return {
            jsonrpc: "2.0",
            id: p.id,
            result: rpc(p.method, p.params ?? []),
          };
        } catch (e) {
          return {
            jsonrpc: "2.0",
            id: p.id,
            error: { code: -32000, message: String(e) },
          };
        }
      };
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          Array.isArray(payload) ? payload.map(answer) : answer(payload),
        ),
      });
    },
  );
  if (options.wallet !== false) {
    await page.exposeFunction(
      "mockWalletRequest",
      async ({ method, params = [] }: any) => {
        if (method === "eth_requestAccounts" && model.reject)
          throw Error("4001 User rejected request");
        if (method === "eth_accounts" || method === "eth_requestAccounts")
          return model.accounts;
        if (method === "eth_chainId") return model.chain;
        if (method === "wallet_switchEthereumChain") {
          model.chain = params[0].chainId;
          return null;
        }
        if (method === "eth_sendTransaction") {
          if (model.reject) throw Error("4001 User rejected request");
          const tx = params[0];
          const decoded = decodeFunctionData({
            abi: abiFor(tx.to),
            data: tx.data,
          });
          const args = decoded.args as any[];
          model.sends.push({ tx, ...decoded });
          const hash = ("0x" +
            model.sends.length.toString(16).padStart(64, "0")) as Hex;
          if (!model.receiptRevert) {
            if (decoded.functionName === "approve") {
              if (tx.to.toLowerCase() === token) model.allowance = args[1];
              else {
                model.permit = args[2];
                model.expiry = Number(args[3]);
              }
            }
            if (decoded.functionName === "claimKing") {
              model.pot += BigInt(tx.value);
              model.price = (BigInt(tx.value) * 11n) / 10n;
            }
            if (decoded.functionName === "claimWorker") model.claimed = true;
            if (decoded.functionName === "fundWorkers")
              model.pot += BigInt(tx.value);
            if (decoded.functionName === "proposeUpdater")
              model.pendingUpdater = args[0];
          }
          receipts.set(hash, {
            transactionHash: hash,
            transactionIndex: "0x0",
            blockHash: "0x" + "ab".repeat(32),
            blockNumber: "0x100",
            from: account,
            to: tx.to,
            cumulativeGasUsed: "0x5208",
            gasUsed: "0x5208",
            contractAddress: null,
            logs: [],
            logsBloom: "0x" + "00".repeat(256),
            status: model.receiptRevert ? "0x0" : "0x1",
            effectiveGasPrice: "0x1",
            type: "0x2",
          });
          return hash;
        }
        return rpc(method, params);
      },
    );
    await page.addInitScript(() => {
      const listeners: Record<string, ((x: unknown) => void)[]> = {};
      (window as any).ethereum = {
        request: (args: any) => (window as any).mockWalletRequest(args),
        on: (e: string, cb: any) => {
          (listeners[e] ??= []).push(cb);
        },
        removeListener: (e: string, cb: any) => {
          listeners[e] = (listeners[e] ?? []).filter((f) => f !== cb);
        },
        emit: (e: string, value: unknown) =>
          (listeners[e] ?? []).forEach((cb) => cb(value)),
      };
    });
  }
  return model;
}
export async function connect(page: Page) {
  await page.getByRole("button", { name: "Connect Wallet" }).click();
  await page
    .getByRole("button", { name: "Get Live Quote" })
    .waitFor({ state: "visible" });
}
