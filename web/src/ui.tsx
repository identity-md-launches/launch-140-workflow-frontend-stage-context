import { useId, useState, type ReactNode, type FormEvent } from "react";
import {
  formatUnits,
  isAddress,
  parseUnits,
  zeroAddress,
  type Address,
} from "viem";
import { useDapp } from "./Dapp";
export function amount(text: string, decimals = 18, allowZero = false): bigint {
  if (
    !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text) ||
    (text.split(".")[1]?.length ?? 0) > decimals
  )
    throw Error(
      `Enter a valid amount with at most ${decimals} decimal places.`,
    );
  const n = parseUnits(text, decimals);
  if ((allowZero ? n < 0n : n <= 0n) || n >= 1n << 127n)
    throw Error("Enter a positive amount within the contract limit.");
  return n;
}
export function address(text: string, allowZero = false): Address {
  if (!isAddress(text) || (!allowZero && text.toLowerCase() === zeroAddress))
    throw Error("Enter a valid, nonzero Ethereum address.");
  return text;
}
export function units(value: bigint | undefined, decimals = 18, max = 6) {
  if (value === undefined) return "—";
  const raw = formatUnits(value, decimals);
  const n = Number(raw);
  return n !== 0 && Math.abs(n) < 10 ** -max
    ? raw
    : new Intl.NumberFormat(undefined, { maximumFractionDigits: max }).format(
        n,
      );
}
export const short = (s?: string) =>
  !s || s === zeroAddress ? "Unclaimed" : `${s.slice(0, 6)}…${s.slice(-4)}`;
export function Addr({ value }: { value?: string }) {
  const { config } = useDapp();
  return value && value !== zeroAddress ? (
    <a
      href={`${config.network.explorer}/address/${value}`}
      target="_blank"
      rel="noreferrer"
      title={value}
      className="mono"
    >
      {short(value)} ↗
    </a>
  ) : (
    <span>Not set</span>
  );
}
export function Field({
  label,
  name,
  value,
  onChange,
  placeholder,
  type = "text",
  hint,
  textarea = false,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
  textarea?: boolean;
}) {
  const id = useId();
  const props = {
    id,
    name,
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(e.target.value),
    autoComplete: "off",
    spellCheck: false,
    "aria-describedby": hint ? `${id}-hint` : undefined,
    placeholder,
  };
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {textarea ? (
        <textarea {...props} rows={4} />
      ) : (
        <input
          {...props}
          type={type === "decimal" ? "text" : type}
          inputMode={type === "decimal" ? "decimal" : undefined}
        />
      )}{" "}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
export function Form({
  children,
  onSubmit,
  label,
  disabled = false,
}: {
  children: ReactNode;
  onSubmit: () => void | Promise<void>;
  label: string;
  disabled?: boolean;
}) {
  const { ready, busy } = useDapp();
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const id = useId();
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    if (submitter instanceof HTMLElement) submitter.focus();
    setError("");
    setChecking(true);
    try {
      await onSubmit();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setTimeout(() => document.getElementById(id)?.focus(), 0);
    } finally {
      setChecking(false);
    }
  };
  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      {children}
      <p className="form-error" role="alert" tabIndex={-1} id={id}>
        {error}
      </p>
      <button
        className="wide"
        type="submit"
        disabled={!ready || disabled || checking}
      >
        {checking ? "Checking…" : busy ? "Transaction in Progress…" : label}
      </button>
    </form>
  );
}
export function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
}) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}
export function Gate() {
  const { account, walletChain, config, state, busy } = useDapp();
  return (
    <p className="gate">
      {!account
        ? "Connect your wallet to take part."
        : walletChain !== config.deployment.chainId
          ? `Switch your wallet to ${config.network.name} to continue.`
          : !state
            ? "Waiting for verified live contract state."
            : busy
              ? "Finish the current wallet request before starting another."
              : "Transactions require confirmation in your wallet."}
    </p>
  );
}
