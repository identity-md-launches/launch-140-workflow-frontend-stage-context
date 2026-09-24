# PvPad frontend validation

Validated on 2026-09-24 UTC. The original contracts, root build configuration, dependency sources and ABI exports are unchanged. This report is worker evidence, not an independent certification or publication check.

## Results

| Check | Result | Evidence |
| --- | --- | --- |
| TypeScript | PASS | [typecheck.log](typecheck.log) |
| Vite production build | PASS; relative base, local assets; largest JS chunk about 266 KB | [build.log](build.log) |
| Production browser interactions | **18 passed, 0 failed, 0 skipped**, Chromium 141 / Playwright 1.56.1 | [browser.log](browser.log), [machine-readable results](browser-results.json) |
| ABI provenance | Both exports byte-identical to the implementation-derived ABI files at the deployed commit; both canonical Keccak hashes match | Build and export-verification logs |
| Deployment / export integrity | Exact handoff identifiers and contract set; **8 inventoried assets, 564,562 bytes** excluding manifest; every SHA-256 matches | [export-verification.log](export-verification.log) |
| Live Sepolia reads | Chain 11155111; nonempty code for PVP, PvPadHook, PoolManager, router, quoter and Permit2; hook state read successfully | [live-read-results.json](live-read-results.json) |
| Live quote / buy simulation | Quoter returned output; actual frontend `swapAction` succeeded through live router using `eth_call` with synthetic account ETH balance only | Same live-read evidence; **no broadcast** |
| Package audit | 0 reported vulnerabilities in the final dependency graph | [dependency-audit.json](dependency-audit.json) |
| Scope / package budget | Only allowed paths added; no dependencies, caches, archives or submodules in proposed files | [delivery-integrity.json](delivery-integrity.json) |

The final browser suite ran for approximately 70 seconds. It served the committed-export candidate directly at `http://127.0.0.1:4173/ipfs/bafy-pvpad/`, without a Vite transformation server or SPA fallback. The suite decoded actual requested calldata, including the swap pool key, input, minimum output, actions, router address and native value.

Coverage includes:

- Relative entrypoint/configuration/ABI/chunk loading from a gateway subpath; no console or resource errors in the normal page check.
- Missing wallet, rejected connection, disconnect, wrong chain and switching; stale account data after reconnect; account changes closing review and a silent chain change preventing submission.
- ETH buy and PVP sell, both bounded spending approvals, min-output encoding, input precision, balance limits, invalid slippage, quote invalidation, expiry and quote failure.
- Strict king bid threshold, default beneficiary, cancellation, wallet rejection and successful receipt handling.
- Worker proof mismatch, valid chain/hook/epoch-bound relay, already-claimed rejection and pot funding.
- All three fee actions, selected currency, all five ERC-20 action methods, permanent-burn confirmation, updater role gates, epoch publication acknowledgement and two-step handoff.
- Simulation failure preventing a wallet send; reverted receipt never being marked successful; transaction hash retained.
- Missing contract code, RPC outage, wallet read fallback and altered ABI JSON failing closed.
- Automated axe scans at 1440 px and 390 px, mobile scans of Crown/Workers/Fees/Tools and the review dialog, horizontal-overflow assertions, keyboard skip link, Escape cancellation and focus return.

## Visual and Vercel interface review

Current rules fetched successfully from [Vercel Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) on **2026-09-24 UTC**, before review. Retrieved rules SHA-256: `5a775e6411f790f518dbc9c1fa7c50a89e6873502d9a3530a6eb223a590bcfe8`.

Reviewed files: `web/index.html`, `web/src/App.tsx`, `Dapp.tsx`, `Trade.tsx`, `Participate.tsx`, `Manage.tsx`, `ui.tsx`, `styles.css`; configuration/loading behavior in `config.ts`, `chain.ts` and `web/vite.config.ts`. Review covered labels and semantics, keyboard/focus, forms and errors, typography/overflow, responsive layout, motion, async states, navigation, transaction prerequisites and static asset performance.

Observed findings and fixes (locations refer to the delivered source):

| Location | Finding and resolution |
| --- | --- |
| `web/src/styles.css:738` | Step numerals initially had 4.38:1 contrast. Darkened their foreground; subsequent axe scans passed. |
| `web/src/styles.css:1143` | The mobile PVP supply wrapped its final digit. Applied responsive sizing and a single line to this metric; visually rechecked at 390 px. |
| `web/src/styles.css:1136` | Increased navigation hit targets to at least 44 px. |
| `web/src/Dapp.tsx:90`, `web/src/Dapp.tsx:292`, `web/src/ui.tsx:120` | Escape did not reliably restore the initiating button's focus. Retain the initiating element, focus form submitters explicitly, restore focus on close; keyboard regression passes. |
| `web/src/Dapp.tsx:206` | Reconnect could briefly expose disconnected wallet balances to action validation. Bind snapshots to the current account and gate writes during refresh; regression passes. |
| `web/src/App.tsx:58` | Hash navigation now scrolls and focuses the newly mounted action panel. Native anchors retain normal link behavior. |
| `web/src/Trade.tsx:160` | Disconnected balance placeholder now uses an em dash rather than implying a zero balance. |
| `web/src/styles.css:86`, `web/src/ui.tsx:75` | Verified visible focus, labels/IDs, input names, decimal keyboards, autocomplete settings and associated help text. Form errors are announced and focused. |
| `web/src/styles.css:1128` | Reduced-motion preference disables transitions. No animated imagery or external font requests. |
| `web/vite.config.ts:37` | Split React and Ethereum dependencies into local chunks; final build has no chunk-size warning. |

The [desktop screenshot](desktop.png) and [mobile screenshot](mobile.png) were opened and visually inspected: readable hierarchy, full addresses wrapping inside their containers, no page overflow, visible connection/action states and the corrected mobile supply. **Screenshots use labeled test fixtures in the test source, not live balances**: their worker pot/king values are intentionally mocked and are not evidence of on-chain activity.

Safety prerequisites deliberately override the general “keep submit enabled” form guideline: wrong chain, unverified/stale data, insufficient approvals, missing role/eligibility and pending transactions disable the corresponding actions. No disabled control can trigger a transaction through a form submission.

Remaining UI limitations: form drafts live in the current panel and are not persisted across navigation/reload; no custom screen-reader session, physical touch-device session, Safari or Firefox run was performed. Automated accessibility scans and Chromium inspection are evidence for the tested states only, not a universal accessibility certification.

## Live-chain evidence and limits

At Sepolia block **11772680**, the primary public RPC reported PVP runtime code of 1,579 bytes and PvPadHook runtime code of 11,494 bytes. The hook reported no King, no current epoch, a zero worker pot, a 0.01 ETH exclusive claim threshold, 100 fee basis points and 1,000 bump basis points. The PoolManager getter matched the handoff. These values can change after the check.

A read-only quote for 0.00001 ETH returned `491338320872150497950` PVP minor units. The actual delivered encoder successfully simulated the buy through the live Universal Router with minimum output `488881629267789745460`. A synthetic caller received an ETH balance override for this simulation; the deployed contracts and pool were not overridden. No wallet was connected for this RPC check, no key was used, and no transaction was signed or broadcast.

Real funded wallet approvals/swaps, sell-side live settlement, king bids, worker payouts, beneficiary fallback behavior and updater transactions were **not** executed on chain. Their UI interactions use mocks. Public RPC rate limits/outages, actual wallet extension behavior, inclusion races, liquidity changes and oracle truthfulness remain runtime dependencies. Existing Solidity tests/protected checks were read to understand the implementation; no contract changes were made and this assignment did not rerun or claim a Solidity audit.

No IPFS pinning, site naming, CID fetches or publisher/control-plane verification occurred. Those are subsequent workflow stages. Runtime JSON/ABI verification checks bindings to the supplied manifest; it does not independently authenticate an oracle artifact or recreate the deployment attestation service.

## Source references

- [Uniswap official Sepolia deployments](https://developers.uniswap.org/docs/protocols/v4/deployments#sepolia-11155111): public PoolManager, original Universal Router, quoter and Permit2 addresses; consulted 2026-09-24.
- [Uniswap v4 swap guide](https://developers.uniswap.org/docs/protocols/v4/guides/swapping/swapping): exact-input swap/settlement/take action encoding; verified with the read-only live simulation above. The original router's struct has no newer `minHopPriceX36` member.
- [IV4Quoter interface](https://raw.githubusercontent.com/Uniswap/v4-periphery/main/src/interfaces/IV4Quoter.sol): quote argument and return types.
- [Action constants](https://raw.githubusercontent.com/Uniswap/v4-periphery/main/src/libraries/Actions.sol): swap, settle and take action IDs.
- Pinned implementation ABI arrays and Solidity at `9905bf8deee060f0c236b6ff2a006961a7346866`; preserved [keeper process](../keeper.md).

## Delivery and Git limitation

All frontend source, package manifest/lockfile, build configuration and test source are under `web/`; the final export is under `dist/`; this evidence is under `docs/frontend/`. The sole ignore-file change is `web/.gitignore`, explicitly budgeted at 1,024 bytes and currently 158 bytes. Nested generated dependency/cache/test-output directories are excluded. No vendored registry, dependency archive or git submodule was added.

**The worker could not create a Git commit:** `.git` is mounted read-only, and `git add -- web dist docs/frontend` failed with `Unable to create .../.git/index.lock: Read-only file system`. No approval escalation is available. The complete files are present for the publisher/contributor system to collect and commit. Consequently a final committed Git bundle cannot be measured here; the integrity report records the existing history bundle size plus all new file bytes and a conservative overhead allowance, comfortably below the 8 MiB submission cap. The baseline bundle used for measurement lives only in `/tmp`, not in the deliverable.
