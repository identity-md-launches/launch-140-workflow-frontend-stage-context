# PvPad frontend

A static React / TypeScript application for the existing PvPad v3 Sepolia deployment. It does not deploy contracts, run a server in production, publish an IPFS site, or submit keeper attestations. The deployed Solidity and original ABI exports are preserved.

## Build and preview

Use Node 24 (validated with Node 24.21.0) and npm. From this repository:

```sh
cd web
npm ci
npm run typecheck
npm run build
npm run verify
npm run preview
```

The committed `../dist/` directory is the complete production site. Serve it over HTTP(S); `file://` cannot load runtime JSON. Vite uses `base: './'`, all presentation assets are local, and panel navigation uses URL fragments. No rewrite rules are required. The browser suite serves the export at `/ipfs/bafy-pvpad/` to exercise gateway-relative paths.

`npm run dev` runs the Vite development server. Build once first: the dev server serves the runtime JSON and ABIs from the last verified `dist/` export. Source changes use HMR. After changing deployment or network inputs, rebuild before development or publication. The build cleans `dist/`, copies the pinned ABIs, creates `network.json`, and emits the manifest **last**. Never edit exported bytes after that step without rebuilding the manifest.

## Single runtime configuration

- `config/handoff.json` preserves the supplied deployment handoff, including the deployed source commit. It is a build input, never an independent bundled runtime contract map.
- `config/network.json` contains only public RPC URLs, the explorer, and Uniswap infrastructure. Build derives pool parameters and PoolManager from the handoff. It does not duplicate the chain ID or PVP/hook addresses.
- `src/config.ts` loads **`dist/imd-deployment.json`** at runtime for chain ID, deployment identifiers, contract addresses, ABI hashes and ABI paths. It verifies the referenced JSON files against the manifest SHA-256 entries and verifies canonical ABI Keccak hashes. `network.json` is one of those inventoried assets.
- `scripts/export.mjs` reads `docs/abi/PVP.json` and `docs/abi/PvPadHook.json` from Git commit `9905bf8deee060f0c236b6ff2a006961a7346866`, compares them byte-for-byte with the preserved files, then verifies the handoff hashes. Keep that commit reachable when cloning to rebuild. Canonicalization sorts object keys recursively, preserves array order, serializes compact UTF-8 JSON, then applies Ethereum Keccak-256.
- The manifest inventories **every** other exported file, including index, JS/CSS chunks, network JSON and both ABI arrays. It excludes itself and uses lowercase SHA-256 without `0x`.

There are no private RPC credentials, private keys or WalletConnect project IDs. Connection uses a browser-injected EIP-1193 wallet, including wallet in-app browsers. If no wallet is present the interface explains how to connect. WalletConnect and a multiple-wallet selection modal are not configured. Reads try public endpoints, then the injected wallet on the configured chain. Writes always use the visitor's wallet.

## User actions and checks

| Panel | Controls |
| --- | --- |
| Trade | ETH→PVP and PVP→ETH exact-input quotes; 0.01–5% slippage; explicit PVP→Permit2 approval and Permit2→router permission; review and swap |
| Crown | `claimKing(beneficiary)` with a bid strictly above live `claimPrice`; defaults beneficiary to connected wallet |
| Workers | Chain/hook/epoch-bound Merkle proof verification, `claimWorker`, and `fundWorkers` |
| Fees | ETH/PVP `withdraw`, `redeem`, `assignUnassigned`, and live pending/deferred/unassigned/cumulative fee values |
| Tools | PVP `transfer`, `approve` including revoke, `burn`, `transferFrom`, `burnFrom`; updater-only `setEpoch` and `proposeUpdater`; pending-updater-only `acceptUpdater` |

PoolManager callbacks, token constructors, and getter methods are not direct user transaction actions. Live state includes supply, decimals, connected wallet balances/allowances, king and beneficiary, claim threshold/count, worker pot, epoch root/window/budget/paid and updater roles. It refreshes every 25 seconds while visible, manually, after account changes and after confirmed writes. Controls require data less than 60 seconds old for the current account.

Before each wallet write, the app rechecks wallet account and chain, RPC chain ID, nonempty configured contract code and the hook's PoolManager binding, then performs `eth_call` simulation. Swaps also verify router/quoter/Permit2 code. Account or chain events dismiss the review. Each transaction includes the configured chain ID. Review dialogs describe recipient, amount and effect; state and receipt errors, wallet rejection, submission hash and confirmation are visible. Only a successful receipt is reported as confirmed. A receipt timeout does **not** mean the transaction was dropped: follow the retained explorer link before retrying.

Swap encoding uses the original Sepolia Universal Router from the official deployment table (not the newer 2.1.x routers, whose parameter structs differ). Command `0x10` contains `SWAP_EXACT_IN_SINGLE (0x06)`, `SETTLE_ALL (0x0c)` and `TAKE_ALL (0x0f)`. The pool key comes from the handoff. Native input attaches exactly the specified ETH value; token input uses Permit2; output goes to the caller. The 1% hook fee and 0.3% LP fee are included by the live quoter, not subtracted twice. Quotes expire after 60 seconds and bind an on-chain minimum output and deadline. Changing amount, direction, slippage or account invalidates the quote. PVP approvals are exact-amount; router authorization expires after 30 minutes. A stale approved amount or expired router permission cannot enable selling.

Initial king threshold is 0.01 ETH; a bid must exceed it by at least one wei. The next threshold is bid plus 10%, rounded up. All bid ETH goes to workers, never the previous king. Fee currency follows swap input for exact-input trades: ETH buys generate ETH fees, PVP sells generate PVP fees. Failed transfers become pullable credit; PoolManager-backed deferred amounts can be redeemed separately. There is no house cut.

The updater's epoch form requires an affirmative acknowledgement of retained Identity MD oracle evidence (panel size 70, quorum 67, boolean). This acknowledgement is **not** an oracle verification mechanism; the contract only verifies updater authorization and Merkle proofs. Follow the preserved [keeper process](../docs/keeper.md) to construct and attest real allocations. Proof input is the keeper's JSON `proof` array; convert its integer `amount` in wei to ETH without rounding. The UI verifies the double-hashed leaf, sorted pairs, current root/epoch, claim window, already-claimed flag and budget. It rechecks eligibility before sending. No mainnet NFT lookup or worker API request is made by Solidity or this UI.

## Validation

```sh
cd web
npx playwright install chromium
npm test
npm run verify
node scripts/live-check.mjs
```

Playwright needs its normal Chromium OS libraries. In this restricted worker they were downloaded and extracted under `/tmp/pvpad-browser-deps`, with browser binaries under `/tmp/pvpad-browsers`; nothing was vendored into the submission. The worker command was:

```sh
LD_LIBRARY_PATH=/tmp/pvpad-browser-deps/root/usr/lib/x86_64-linux-gnu \
PLAYWRIGHT_BROWSERS_PATH=/tmp/pvpad-browsers npm test
```

`npm test` uses mocked RPC and wallet responses and never broadcasts. It tests the **production export**, not Vite development output. JSON results and screenshots go to `docs/frontend/`. `node scripts/live-check.mjs` uses real public RPC reads and an `eth_call` buy simulation with a synthetic account balance; it never signs or broadcasts. It imports the delivered swap encoder directly. Live RPC behavior is inherently time-dependent.

See [validation evidence](../docs/frontend/validation.md) for results, accessibility review and limitations. Live funded wallet transactions, real worker claims, real approvals and the publisher's future CID/naming checks are not claimed as tested.

Only `web/.gitignore` is created as an ignore file, with an explicit 1,024-byte path budget. It excludes dependencies and generated caches/test traces at every nesting level under `web/`. No node_modules, downloaded browsers, OS packages, npm caches, vendored registry archives or submodules belong in the submission.
