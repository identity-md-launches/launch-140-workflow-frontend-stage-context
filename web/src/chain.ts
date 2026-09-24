import {
  createPublicClient,
  custom,
  http,
  type Address,
  type Hex,
  type Abi,
  type EIP1193Provider,
  encodeFunctionData,
  parseAbi,
  parseAbiParameters,
  encodeAbiParameters,
  zeroAddress,
} from "viem";
import type { Config, Contract } from "./config";
export type Provider = EIP1193Provider & {
  on?: (event: string, fn: (value: unknown) => void) => void;
  removeListener?: (event: string, fn: (value: unknown) => void) => void;
};
declare global {
  interface Window {
    ethereum?: Provider;
  }
}
export const infrastructureAbi = {
  router: parseAbi([
    "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
  ]),
  quoter: parseAbi([
    "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)",
  ]),
  permit2: parseAbi([
    "function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
    "function approve(address token,address spender,uint160 amount,uint48 expiration)",
  ]),
};
export type Client = ReturnType<typeof createPublicClient>;
export async function verifyClient(
  c: Config,
  client: Client,
  infrastructure = false,
) {
  if ((await client.getChainId()) !== c.deployment.chainId)
    throw Error("RPC returned the wrong chain. Transactions are locked.");
  const addresses = [
    c.token.address,
    c.hook.address,
    c.network.pool.manager,
    ...(infrastructure ? Object.values(c.network.infrastructure) : []),
  ];
  const codes = await Promise.all(
    addresses.map((address) => client.getCode({ address })),
  );
  if (codes.some((code) => !code || code === "0x"))
    throw Error("A configured contract has no code. Transactions are locked.");
  const manager = (await read(client, c.hook, "poolManager")) as Address;
  if (manager.toLowerCase() !== c.network.pool.manager.toLowerCase())
    throw Error("Hook PoolManager does not match the deployment handoff.");
}
export async function connectRpc(
  c: Config,
  provider?: Provider,
): Promise<{ client: Client; source: string }> {
  for (const url of c.network.rpcUrls) {
    const client = createPublicClient({
      transport: http(url, { timeout: 6500, retryCount: 0 }),
      batch: { multicall: false },
    });
    try {
      await verifyClient(c, client);
      return { client, source: new URL(url).hostname };
    } catch {
      /* try next configured endpoint */
    }
  }
  if (
    provider &&
    Number(await provider.request({ method: "eth_chainId" })) ===
      c.deployment.chainId
  ) {
    const client = createPublicClient({
      transport: custom(provider, { retryCount: 0 }),
      batch: { multicall: false },
    });
    await verifyClient(c, client);
    return { client, source: "Connected wallet RPC" };
  }
  throw Error(
    "Public RPC unavailable or deployment code could not be verified. Retry, or connect a Sepolia wallet for read fallback.",
  );
}
export async function read(
  client: Client,
  contract: Pick<Contract, "address" | "abi">,
  functionName: string,
  args: readonly unknown[] = [],
) {
  return client.readContract({
    address: contract.address,
    abi: contract.abi,
    functionName,
    args,
  });
}
export type Epoch = readonly [Hex, bigint, bigint, bigint, bigint];
export type FeeState = {
  pending: bigint;
  unassigned: bigint;
  deferred: bigint;
  skimmed: bigint;
};
export type Snapshot = {
  account?: Address;
  king: Address;
  beneficiary: Address;
  claimPrice: bigint;
  claimCount: bigint;
  workerPot: bigint;
  currentEpoch: bigint;
  updater: Address;
  pendingUpdater: Address;
  available: bigint;
  feeBps: bigint;
  bumpBps: bigint;
  decimals: number;
  supply: bigint;
  balance: bigint;
  eth: bigint;
  allowance: bigint;
  permitAmount: bigint;
  permitExpiry: number;
  epoch: Epoch;
  fees: FeeState[];
  block: bigint;
  timestamp: bigint;
  loadedAt: number;
};
export async function snapshot(
  c: Config,
  client: Client,
  account?: Address,
): Promise<Snapshot> {
  const names = [
    "king",
    "beneficiary",
    "claimPrice",
    "claimCount",
    "workerPot",
    "currentEpoch",
    "updater",
    "pendingUpdater",
    "availableForNextEpoch",
    "FEE_BPS",
    "BUMP_BPS",
  ];
  const [h, decimals, supply, block, fees, wallet] = await Promise.all([
    Promise.all(names.map((n) => read(client, c.hook, n))),
    read(client, c.token, "decimals"),
    read(client, c.token, "totalSupply"),
    client.getBlock(),
    Promise.all(
      [zeroAddress, c.token.address].map(async (currency) => {
        const [pending, unassigned, deferred, skimmed] = await Promise.all([
          read(client, c.hook, "pending", [account ?? zeroAddress, currency]),
          read(client, c.hook, "unassigned", [currency]),
          read(client, c.hook, "deferred", [currency]),
          read(client, c.hook, "totalSkimmed", [currency]),
        ]);
        return { pending, unassigned, deferred, skimmed } as FeeState;
      }),
    ),
    account
      ? Promise.all([
          read(client, c.token, "balanceOf", [account]),
          client.getBalance({ address: account }),
          read(client, c.token, "allowance", [
            account,
            c.network.infrastructure.permit2,
          ]),
          read(
            client,
            {
              address: c.network.infrastructure.permit2,
              abi: infrastructureAbi.permit2,
            },
            "allowance",
            [account, c.token.address, c.network.infrastructure.router],
          ),
        ])
      : Promise.resolve([0n, 0n, 0n, [0n, 0, 0]]),
  ]);
  const epoch =
    h[5] === 0n
      ? ["0x" + "0".repeat(64), 0n, 0n, 0n, 0n]
      : await read(client, c.hook, "epochs", [h[5]]);
  const permit = wallet[3] as [bigint, number, number];
  return {
    account,
    king: h[0],
    beneficiary: h[1],
    claimPrice: h[2],
    claimCount: h[3],
    workerPot: h[4],
    currentEpoch: h[5],
    updater: h[6],
    pendingUpdater: h[7],
    available: h[8],
    feeBps: h[9],
    bumpBps: h[10],
    decimals,
    supply,
    balance: wallet[0],
    eth: wallet[1],
    allowance: wallet[2],
    permitAmount: permit[0],
    permitExpiry: Number(permit[1]),
    epoch,
    fees,
    block: block.number,
    timestamp: block.timestamp,
    loadedAt: Date.now(),
  } as Snapshot;
}
export type Action = {
  label: string;
  summary: string;
  contract: Pick<Contract, "address" | "abi">;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
  expiresAt?: number;
  infrastructure?: boolean;
  check?: (client: Client) => Promise<void>;
};
export async function sendAction(
  c: Config,
  client: Client,
  provider: Provider,
  account: Address,
  action: Action,
  onHash: (hash: Hex) => void,
) {
  const assertWallet = async () => {
    const [chain, accounts] = await Promise.all([
      provider.request({ method: "eth_chainId" }),
      provider.request({ method: "eth_accounts" }),
    ]);
    if (
      Number(chain) !== c.deployment.chainId ||
      accounts[0]?.toLowerCase() !== account.toLowerCase()
    )
      throw Error(
        "Wallet account or network changed. Review the action again.",
      );
    if (action.expiresAt && Date.now() > action.expiresAt)
      throw Error("This quote expired. Request a new quote.");
  };
  await assertWallet();
  await verifyClient(c, client, action.infrastructure);
  await action.check?.(client);
  const data = encodeFunctionData({
    abi: action.contract.abi,
    functionName: action.functionName,
    args: action.args ?? [],
  });
  await client.call({
    account,
    to: action.contract.address,
    data,
    value: action.value ?? 0n,
  });
  await assertWallet();
  const hash = await provider.request({
    method: "eth_sendTransaction",
    params: [
      {
        chainId: `0x${c.deployment.chainId.toString(16)}`,
        from: account,
        to: action.contract.address,
        data,
        value: `0x${(action.value ?? 0n).toString(16)}`,
      },
    ],
  });
  onHash(hash);
  const receipt = await client.waitForTransactionReceipt({
    hash,
    confirmations: 1,
    timeout: 120_000,
  });
  if (receipt.status !== "success")
    throw Error(
      "Transaction reverted on chain. No action completed; gas may have been spent.",
    );
  return receipt;
}
export function poolKey(c: Config) {
  return {
    currency0: c.network.pool.pairedCurrency,
    currency1: c.token.address,
    fee: c.network.pool.fee,
    tickSpacing: c.network.pool.tickSpacing,
    hooks: c.hook.address,
  };
}
export function swapAction(
  c: Config,
  buy: boolean,
  amount: bigint,
  minimum: bigint,
  expiresAt: number,
): Action {
  const key = poolKey(c);
  const params = [
    encodeAbiParameters(
      parseAbiParameters(
        "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)",
      ),
      [
        {
          poolKey: key,
          zeroForOne: buy,
          amountIn: amount,
          amountOutMinimum: minimum,
          hookData: "0x",
        },
      ],
    ),
    encodeAbiParameters(parseAbiParameters("address,uint256"), [
      buy ? key.currency0 : key.currency1,
      amount,
    ]),
    encodeAbiParameters(parseAbiParameters("address,uint256"), [
      buy ? key.currency1 : key.currency0,
      minimum,
    ]),
  ];
  const input = encodeAbiParameters(parseAbiParameters("bytes,bytes[]"), [
    "0x060c0f",
    params,
  ]);
  return {
    label: "Swap",
    summary: "",
    contract: {
      address: c.network.infrastructure.router,
      abi: infrastructureAbi.router,
    },
    functionName: "execute",
    args: ["0x10", [input], BigInt(Math.floor(expiresAt / 1000))],
    value: buy ? amount : 0n,
    expiresAt,
    infrastructure: true,
  };
}
export function message(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/reject|denied|4001/i.test(text))
    return "Request rejected in your wallet. Nothing was submitted; you can try again.";
  return text.length > 420 ? text.slice(0, 420) + "…" : text;
}
