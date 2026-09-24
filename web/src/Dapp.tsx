import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { type Address, type Hex, toHex } from "viem";
import { loadConfig, type Config } from "./config";
import {
  connectRpc,
  snapshot,
  sendAction,
  message,
  type Action,
  type Client,
  type Snapshot,
} from "./chain";
type Dapp = {
  config: Config;
  client?: Client;
  state?: Snapshot;
  account?: Address;
  walletChain?: number;
  source: string;
  loading: boolean;
  busy: boolean;
  ready: boolean;
  error: string;
  status: string;
  hash?: Hex;
  connect: () => void;
  disconnect: () => void;
  switchChain: () => void;
  refresh: () => Promise<void>;
  review: (action: Action) => void;
  report: (error: unknown) => void;
};
const Context = createContext<Dapp | null>(null);
export function useDapp() {
  const ctx = useContext(Context);
  if (!ctx) throw Error("Missing app context");
  return ctx;
}
export function DappProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<Config>();
  const [fatal, setFatal] = useState("");
  useEffect(() => {
    void loadConfig()
      .then(setConfig)
      .catch((e) => setFatal(message(e)));
  }, []);
  if (fatal)
    return (
      <main className="boot">
        <h1>Deployment Could Not Be Verified</h1>
        <p role="alert">{fatal}</p>
        <button onClick={() => location.reload()}>Retry Loading</button>
      </main>
    );
  if (!config)
    return (
      <main className="boot" aria-busy="true">
        <p role="status">Loading verified deployment…</p>
      </main>
    );
  return <Connected config={config}>{children}</Connected>;
}
function Connected({
  config,
  children,
}: {
  config: Config;
  children: ReactNode;
}) {
  const [client, setClient] = useState<Client>();
  const [state, setState] = useState<Snapshot>();
  const [account, setAccount] = useState<Address>();
  const [walletChain, setWalletChain] = useState<number>();
  const [source, setSource] = useState("Connecting to public RPC…");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [hash, setHash] = useState<Hex>();
  const [action, setAction] = useState<Action>();
  const generation = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const reviewTrigger = useRef<HTMLElement | null>(null);
  const lock = useRef(false);
  const [now, setNow] = useState(Date.now());
  const report = (e: unknown) => setError(message(e));
  const refresh = async () => {
    const id = ++generation.current;
    setLoading(true);
    try {
      const rpc = await connectRpc(config, window.ethereum);
      const result = await snapshot(config, rpc.client, account);
      if (id === generation.current) {
        setClient(rpc.client);
        setState(result);
        setSource(rpc.source);
        setError("");
      }
    } catch (e) {
      if (id === generation.current) {
        setClient(undefined);
        setState(undefined);
        report(e);
      }
    } finally {
      if (id === generation.current) setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 25_000);
    return () => {
      clearInterval(timer);
      generation.current++;
    };
  }, [account, config]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const provider = window.ethereum;
    if (!provider) return;
    const accounts = (value: unknown) => {
      generation.current++;
      setState(undefined);
      setAction(undefined);
      setAccount((value as Address[])[0]);
    };
    const chain = (value: unknown) => {
      setWalletChain(Number(value));
      setAction(undefined);
    };
    const gone = () => {
      accounts([]);
      setWalletChain(undefined);
    };
    provider.on?.("accountsChanged", accounts);
    provider.on?.("chainChanged", chain);
    provider.on?.("disconnect", gone);
    return () => {
      provider.removeListener?.("accountsChanged", accounts);
      provider.removeListener?.("chainChanged", chain);
      provider.removeListener?.("disconnect", gone);
    };
  }, []);
  useEffect(() => {
    if (action) dialog.current?.showModal();
    else dialog.current?.close();
  }, [action]);
  const connect = async () => {
    setError("");
    if (!window.ethereum) {
      setError(
        "No browser wallet found. Install or open this page in an Ethereum wallet, then retry.",
      );
      return;
    }
    setBusy(true);
    try {
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      setWalletChain(
        Number(await window.ethereum.request({ method: "eth_chainId" })),
      );
      setState(undefined);
      setAccount(accounts[0]);
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  };
  const switchChain = async () => {
    if (!window.ethereum) return;
    setBusy(true);
    setError("");
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: toHex(config.deployment.chainId) }],
      });
      setWalletChain(
        Number(await window.ethereum.request({ method: "eth_chainId" })),
      );
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  };
  const ready =
    !!account &&
    walletChain === config.deployment.chainId &&
    !!state &&
    state.account === account &&
    !!client &&
    now - state.loadedAt < 60_000 &&
    !busy &&
    !loading;
  const review = (next: Action) => {
    if (ready) {
      reviewTrigger.current = document.activeElement as HTMLElement;
      setError("");
      setHash(undefined);
      setStatus("");
      setAction(next);
    }
  };
  const confirm = async () => {
    if (
      !action ||
      !ready ||
      !client ||
      !account ||
      !window.ethereum ||
      lock.current
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    setStatus("Checking the transaction, then waiting for your wallet…");
    const requested = action;
    setAction(undefined);
    try {
      await sendAction(
        config,
        client,
        window.ethereum,
        account,
        requested,
        (h) => {
          setHash(h);
          setStatus("Transaction submitted. Waiting for confirmation…");
        },
      );
      setStatus(`${requested.label} confirmed.`);
      await refresh();
    } catch (e) {
      report(e);
      setStatus(
        "Action did not confirm. If a hash is shown, check the explorer before trying again.",
      );
    } finally {
      setBusy(false);
      lock.current = false;
    }
  };
  return (
    <Context.Provider
      value={{
        config,
        client,
        state,
        account,
        walletChain,
        source,
        loading,
        busy,
        ready,
        error,
        status,
        hash,
        connect,
        disconnect: () => {
          setAccount(undefined);
          setState(undefined);
          setAction(undefined);
          setWalletChain(undefined);
        },
        switchChain,
        refresh,
        review,
        report,
      }}
    >
      {children}
      <dialog
        ref={dialog}
        onCancel={() => setAction(undefined)}
        onClose={() => {
          setAction(undefined);
          requestAnimationFrame(() => reviewTrigger.current?.focus());
        }}
        aria-labelledby="review-title"
      >
        <div className="dialog-inner">
          <p className="eyebrow">Wallet Transaction</p>
          <h2 id="review-title">Review {action?.label}</h2>
          <p>{action?.summary}</p>
          <dl className="review-details">
            <dt>Network</dt>
            <dd>{config.network.name}</dd>
            <dt>From</dt>
            <dd className="address">{account}</dd>
            <dt>Contract</dt>
            <dd className="address">{action?.contract.address}</dd>
            <dt>Function</dt>
            <dd>{action?.functionName}</dd>
            <dt>Network Fee</dt>
            <dd>Estimated by your wallet</dd>
          </dl>
          <p className="muted">
            On-chain actions are final once confirmed. Review the amounts and
            recipient in your wallet.
          </p>
          <div className="button-row">
            <button className="secondary" onClick={() => setAction(undefined)}>
              Cancel
            </button>
            <button disabled={!ready} onClick={() => void confirm()}>
              Confirm in Wallet
            </button>
          </div>
        </div>
      </dialog>
    </Context.Provider>
  );
}
