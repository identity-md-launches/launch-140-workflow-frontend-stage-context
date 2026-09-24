import { readFile, writeFile } from "node:fs/promises";
import { createPublicClient, http, parseAbi, parseEther } from "viem";
import { swapAction } from "../src/chain.ts";
const deployment = JSON.parse(await readFile("../dist/imd-deployment.json"));
const network = JSON.parse(await readFile("../dist/network.json"));
const evidence = {
  checkedAt: new Date().toISOString(),
  mode: "read-only; no wallet signing or broadcast",
  rpc: network.rpcUrls[0],
  chainId: null,
  contracts: [],
  infrastructure: [],
  state: {},
  quote: null,
};
const client = createPublicClient({
  transport: http(network.rpcUrls[0], { timeout: 20000, retryCount: 0 }),
});
try {
  evidence.chainId = await client.getChainId();
  if (evidence.chainId !== deployment.chainId) throw Error("Wrong RPC chain");
  for (const contract of deployment.contracts) {
    const code = await client.getCode({ address: contract.address });
    evidence.contracts.push({
      name: contract.name,
      address: contract.address,
      codeBytes: code ? (code.length - 2) / 2 : 0,
    });
    if (!code || code === "0x") throw Error("Missing code");
  }
  for (const [name, address] of Object.entries({
    ...network.infrastructure,
    poolManager: network.pool.manager,
  })) {
    const code = await client.getCode({ address });
    evidence.infrastructure.push({
      name,
      address,
      codeBytes: code ? (code.length - 2) / 2 : 0,
    });
  }
  const hook = deployment.contracts.find((c) => c.name === "PvPadHook");
  const token = deployment.contracts.find((c) => c.name === "PVP");
  const abi = JSON.parse(await readFile(`../dist/${hook.abiPath}`));
  for (const functionName of [
    "king",
    "beneficiary",
    "claimPrice",
    "claimCount",
    "workerPot",
    "currentEpoch",
    "poolManager",
    "FEE_BPS",
    "BUMP_BPS",
  ]) {
    evidence.state[functionName] = await client.readContract({
      address: hook.address,
      abi,
      functionName,
    });
  }
  evidence.block = await client.getBlockNumber();
  try {
    const result = await client.simulateContract({
      address: network.infrastructure.quoter,
      abi: parseAbi([
        "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)",
      ]),
      functionName: "quoteExactInputSingle",
      args: [
        {
          poolKey: {
            currency0: network.pool.pairedCurrency,
            currency1: token.address,
            fee: network.pool.fee,
            tickSpacing: network.pool.tickSpacing,
            hooks: hook.address,
          },
          zeroForOne: true,
          exactAmount: parseEther("0.00001"),
          hookData: "0x",
        },
      ],
    });
    evidence.quote = {
      inputWei: "10000000000000",
      outputMinorUnits: result.result[0].toString(),
      gasEstimate: result.result[1].toString(),
    };
  } catch (e) {
    evidence.quote = { error: e.shortMessage || e.message };
  }
  const config = {
    deployment,
    network,
    hook: { ...hook, abi },
    token: {
      ...token,
      abi: JSON.parse(await readFile(`../dist/${token.abiPath}`)),
    },
  };
  try {
    const block = await client.getBlock();
    const quoted = evidence.quote?.outputMinorUnits
      ? BigInt(evidence.quote.outputMinorUnits)
      : 0n;
    if (quoted === 0n) throw Error("No quote available for simulation");
    const action = swapAction(
      config,
      true,
      parseEther("0.00001"),
      (quoted * 995n) / 1000n,
      Number(block.timestamp + 120n) * 1000,
    );
    await client.simulateContract({
      address: action.contract.address,
      abi: action.contract.abi,
      functionName: action.functionName,
      args: action.args,
      value: action.value,
      account: "0x1111111111111111111111111111111111111111",
      stateOverride: [
        {
          address: "0x1111111111111111111111111111111111111111",
          balance: parseEther("1"),
        },
      ],
    });
    evidence.buySimulation = {
      result: "PASS",
      method: "eth_call",
      source: "swapAction from delivered frontend",
      stateOverride: "Synthetic account ETH balance only",
      inputWei: "10000000000000",
      minimumOutput: ((quoted * 995n) / 1000n).toString(),
      broadcast: false,
    };
  } catch (e) {
    evidence.buySimulation = {
      result: "incomplete",
      error: e.shortMessage || e.message,
      broadcast: false,
    };
  }
  evidence.result = "read checks passed";
} catch (e) {
  evidence.result = "incomplete";
  evidence.error = e.shortMessage || e.message;
}
const json =
  JSON.stringify(
    evidence,
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  ) + "\n";
await writeFile("../docs/frontend/live-read-results.json", json);
console.log(json);
