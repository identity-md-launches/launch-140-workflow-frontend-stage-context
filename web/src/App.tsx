import { useEffect, useState } from "react";
import { useDapp } from "./Dapp";
import { Trade } from "./Trade";
import { Crown, Workers, Fees } from "./Participate";
import { Manage } from "./Manage";
import { Addr, short, Stat, units } from "./ui";
const tabs = ["trade", "crown", "workers", "fees", "tools"] as const;
type Tab = (typeof tabs)[number];
const getTab = () =>
  tabs.includes(location.hash.slice(1) as Tab)
    ? (location.hash.slice(1) as Tab)
    : "trade";
function CrownMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 80"
      width="100"
      height="80"
      fill="none"
    >
      <path
        d="M13 23 32 38 50 10 68 38 87 23 78 62H22L13 23Z"
        fill="currentColor"
      />
      <path
        d="M24 72H76"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
      />
    </svg>
  );
}
export default function App() {
  const {
    config: c,
    state: s,
    account,
    walletChain,
    source,
    loading,
    busy,
    error,
    status,
    hash,
    connect,
    disconnect,
    switchChain,
    refresh,
  } = useDapp();
  const [tab, setTab] = useState<Tab>(getTab);
  useEffect(() => {
    const listener = () => setTab(getTab());
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  useEffect(() => {
    if (!tabs.includes(location.hash.slice(1) as Tab)) return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(tab);
      target?.scrollIntoView({ block: "start" });
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [tab]);
  return (
    <>
      <a href="#main" className="skip">
        Skip to Content
      </a>
      <header className="header">
        <div className="shell header-inner">
          <a className="brand" href="#trade" aria-label="PvPad home">
            <span className="brand-icon">
              <CrownMark />
            </span>
            <span translate="no">
              PvPad<span className="brand-dot">.</span>
            </span>
          </a>
          <span className="network">
            <span />
            Sepolia Testnet
          </span>
          <div className="wallet">
            {account ? (
              <>
                <span className="wallet-address" title={account}>
                  {short(account)}
                </span>
                {walletChain !== c.deployment.chainId ? (
                  <button onClick={switchChain} disabled={busy}>
                    Switch to Sepolia
                  </button>
                ) : (
                  <button
                    className="header-button"
                    onClick={disconnect}
                    disabled={busy}
                  >
                    Disconnect
                  </button>
                )}
              </>
            ) : (
              <button onClick={connect} disabled={busy}>
                {busy ? "Connecting…" : "Connect Wallet"}{" "}
                <span aria-hidden="true">↗</span>
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="shell" id="main">
        <section className="hero">
          <div>
            <p className="eyebrow">
              <span className="live-dot" />
              The People’s Pad · One-Shot v3
            </p>
            <h1>
              Pepe Values
              <br />
              <em>Pepe.</em>
            </h1>
            <p className="hero-copy">
              A crown worth claiming.
              <br />A community worth building for.
            </p>
            <div className="hero-links">
              <a href="#trade">
                Trade PVP <span aria-hidden="true">↗</span>
              </a>
              <a href="#workers">
                Meet the Mechanics <span aria-hidden="true">↓</span>
              </a>
            </div>
          </div>
          <div className="hero-right">
            <div className="crown-art">
              <div className="orbit" />
              <span className="art-caption top">PEPE VALUES PEPE</span>
              <CrownMark />
              <span className="art-caption bottom">
                NO HOUSE. ALL COMMUNITY.
              </span>
            </div>
            <div className="hero-stamp">
              <span className="stamp-dot" />
              1% TO THE KING’S BENEFICIARY
              <br />
              <span className="stamp-dot" />
              100% OF KING BIDS TO WORKERS
            </div>
          </div>
        </section>
        <section className="metrics" aria-label="Live contract overview">
          <Stat
            label="Worker Pot"
            value={`${units(s?.workerPot)} ETH`}
            detail="Unallocated · ready for the next epoch"
          />
          <Stat
            label="King Claim Threshold"
            value={`${units(s?.claimPrice)} ETH`}
            detail="Your next bid must exceed this"
          />
          <Stat
            label="PVP Supply"
            value={s ? units(s.supply, s.decimals, 0) : "—"}
            detail="1 billion minted · no further minting"
          />
          <Stat
            label="House Cut"
            value="0%"
            detail="No pump.fun house. No hidden treasury."
          />
        </section>
        <div className="connection-state">
          <span className={`status-dot ${s ? "good" : ""}`} />
          <span>
            {loading
              ? "Refreshing live state…"
              : s
                ? `Live · Block ${new Intl.NumberFormat().format(s.block)} · ${source}`
                : "Live state unavailable"}
          </span>
          <button
            className="text-button"
            disabled={loading || busy}
            onClick={() => void refresh()}
          >
            Refresh
          </button>
        </div>
        {(error || status || hash) && (
          <div className={`notice ${error ? "error" : ""}`}>
            <p role={error ? "alert" : "status"}>{error || status}</p>
            {error && status && <p>{status}</p>}
            {hash && (
              <a
                href={`${c.network.explorer}/tx/${hash}`}
                target="_blank"
                rel="noreferrer"
              >
                View Transaction ↗
              </a>
            )}
          </div>
        )}
        {account && walletChain !== c.deployment.chainId && (
          <div className="notice error" role="alert">
            Your wallet is on the wrong network. Switch to Sepolia to enable
            transaction controls.
          </div>
        )}
        <div className="workspace">
          <div className="main-column">
            <nav className="tabs" aria-label="Contract actions">
              {tabs.map((t) => (
                <a
                  key={t}
                  href={`#${t}`}
                  aria-current={tab === t ? "page" : undefined}
                >
                  {t === "tools" ? "Tools" : t[0].toUpperCase() + t.slice(1)}
                </a>
              ))}
            </nav>
            <div key={tab}>
              {tab === "trade" ? (
                <Trade />
              ) : tab === "crown" ? (
                <Crown />
              ) : tab === "workers" ? (
                <Workers />
              ) : tab === "fees" ? (
                <Fees />
              ) : (
                <Manage />
              )}
            </div>
          </div>
          <aside className="sidebar">
            <section className="reign-card">
              <div className="between">
                <p className="eyebrow">The Reigning King</p>
                <span aria-hidden="true">♛</span>
              </div>
              <h2>
                <Addr value={s?.king} />
              </h2>
              <p>Swap-Fee Beneficiary</p>
              <Addr value={s?.beneficiary} />
              <div className="reign-rule" />
              <div className="between">
                <span>Crowns Claimed</span>
                <strong>{s?.claimCount.toString() ?? "—"}</strong>
              </div>
              <a className="button light" href="#crown">
                Claim the Crown <span aria-hidden="true">↗</span>
              </a>
            </section>
            <section className="mechanics">
              <p className="eyebrow">Where It Goes</p>
              <h2>A Simple Circle.</h2>
              <ol>
                <li>
                  <span>01</span>
                  <div>
                    <h3>Trade PVP</h3>
                    <p>
                      The 1% hook fee goes to the King’s beneficiary, in the
                      input currency.
                    </p>
                  </div>
                </li>
                <li>
                  <span>02</span>
                  <div>
                    <h3>Take the Crown</h3>
                    <p>
                      Your entire ETH bid funds the worker pot. The next
                      threshold rises 10%.
                    </p>
                  </div>
                </li>
                <li>
                  <span>03</span>
                  <div>
                    <h3>Reward the Work</h3>
                    <p>
                      Attested Merkle epochs distribute the pot to Identity MD
                      workers.
                    </p>
                  </div>
                </li>
              </ol>
            </section>
            <section className="pool-note">
              <p className="eyebrow">Open by Design</p>
              <p>
                The factory opens the pool and seeds ordinary Uniswap v4
                liquidity. Anyone can trade through compatible v4 routers. All
                king, fee, and worker logic lives in one hook.
              </p>
              <p className="muted">
                Sepolia test tokens only. Public RPC availability and pool
                liquidity can affect quotes.
              </p>
            </section>
          </aside>
        </div>
        <section className="contracts" aria-labelledby="contracts-title">
          <div>
            <p className="eyebrow">Verify the Source</p>
            <h2 id="contracts-title">Two Contracts. One Pad.</h2>
            <p>
              Deployment and ABI bindings loaded from{" "}
              <a href="./imd-deployment.json">the attested manifest ↗</a>.
            </p>
          </div>
          <div className="contract-list">
            {c.deployment.contracts.map((contract) => (
              <a
                key={contract.name}
                href={`${c.network.explorer}/address/${contract.address}`}
                target="_blank"
                rel="noreferrer"
              >
                <strong>
                  {contract.name}
                  <span aria-hidden="true">↗</span>
                </strong>
                <span className="address">{contract.address}</span>
              </a>
            ))}
          </div>
        </section>
        <footer>
          <span translate="no">
            PvPad. <span className="muted">Pepe Values Pepe.</span>
          </span>
          <span>
            Sepolia · Chain {c.deployment.chainId} ·{" "}
            <a
              href={`https://github.com/identity-md-launches/launch-139-workflow-contract-stage-context/tree/${c.deployment.sourceCommit}`}
              target="_blank"
              rel="noreferrer"
            >
              Source {c.deployment.sourceCommit.slice(0, 7)} ↗
            </a>
          </span>
        </footer>
      </main>
    </>
  );
}
