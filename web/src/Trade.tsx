import { useEffect, useRef, useState } from "react";
import { formatUnits } from "viem";
import { useDapp } from "./Dapp";
import { infrastructureAbi, poolKey, swapAction, verifyClient } from "./chain";
import { amount, Field, units, Form, Gate } from "./ui";
type Quote = {
  out: bigint;
  minimum: bigint;
  input: bigint;
  buy: boolean;
  expires: number;
};
export function Trade() {
  const {
    config: c,
    client,
    state: s,
    ready,
    review,
    report,
    account,
  } = useDapp();
  const [buy, setBuy] = useState(
    new URLSearchParams(location.search).get("side") !== "sell",
  );
  const [input, setInput] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [quote, setQuote] = useState<Quote>();
  const [quoting, setQuoting] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const generation = useRef(0);
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    generation.current++;
    setQuote(undefined);
  }, [input, slippage, buy, account]);
  const inputSymbol = buy ? "ETH" : "PVP",
    outputSymbol = buy ? "PVP" : "ETH";
  const expired = !!quote && clock >= quote.expires;
  const flip = () => {
    const next = !buy;
    setBuy(next);
    setInput("");
    const url = new URL(location.href);
    url.searchParams.set("side", next ? "buy" : "sell");
    history.replaceState(null, "", url);
  };
  const getQuote = async () => {
    if (!client || !s) throw Error("Wait for live state.");
    const n = amount(input, buy ? 18 : s.decimals);
    const slip = amount(slippage, 2, true);
    if (slip < 1n || slip > 500n)
      throw Error("Slippage must be between 0.01% and 5%.");
    if (n > (buy ? s.eth : s.balance))
      throw Error(`Insufficient ${inputSymbol} balance. Leave ETH for gas.`);
    const id = ++generation.current;
    setQuoting(true);
    setQuote(undefined);
    try {
      await verifyClient(c, client, true);
      const result = await client.simulateContract({
        address: c.network.infrastructure.quoter,
        abi: infrastructureAbi.quoter,
        functionName: "quoteExactInputSingle",
        args: [
          {
            poolKey: poolKey(c),
            zeroForOne: buy,
            exactAmount: n,
            hookData: "0x",
          },
        ],
        account,
      });
      const out = result.result[0];
      const minimum = (out * (10000n - slip)) / 10000n;
      if (out <= 0n || minimum <= 0n)
        throw Error("No executable output. Try a different amount.");
      if (id === generation.current)
        setQuote({ out, minimum, input: n, buy, expires: Date.now() + 60_000 });
    } finally {
      setQuoting(false);
    }
  };
  let parsed = 0n;
  try {
    parsed = amount(input, buy ? 18 : (s?.decimals ?? 18));
  } catch {
    /* field validation on submit */
  }
  const tokenApproved = !!s && s.allowance >= parsed && parsed > 0n;
  const routerApproved =
    !!s &&
    s.permitAmount >= parsed &&
    s.permitExpiry > Math.floor(clock / 1000) + 120 &&
    parsed > 0n;
  const approveToken = () =>
    review({
      label: "Approve PVP",
      summary: `Allow Permit2 to spend exactly ${input} PVP. This does not execute a swap.`,
      contract: c.token,
      functionName: "approve",
      args: [c.network.infrastructure.permit2, parsed],
      infrastructure: true,
    });
  const approveRouter = () =>
    review({
      label: "Authorize Router",
      summary: `Allow the Uniswap router to spend exactly ${input} PVP via Permit2 for 30 minutes. This is a separate approval transaction.`,
      contract: {
        address: c.network.infrastructure.permit2,
        abi: infrastructureAbi.permit2,
      },
      functionName: "approve",
      args: [
        c.token.address,
        c.network.infrastructure.router,
        parsed,
        Math.floor(Date.now() / 1000) + 1800,
      ],
      infrastructure: true,
    });
  return (
    <section
      className="panel"
      id="trade"
      tabIndex={-1}
      aria-labelledby="trade-title"
    >
      <div className="section-top">
        <div>
          <p className="eyebrow">One Pool. Open to Everyone.</p>
          <h2 id="trade-title">Make Your Move</h2>
        </div>
        <span className="pill">Uniswap v4</span>
      </div>
      <div className="trade-direction">
        <strong>{inputSymbol}</strong>
        <button
          className="round secondary"
          aria-label="Reverse swap direction"
          onClick={flip}
        >
          ⇄
        </button>
        <strong>{outputSymbol}</strong>
      </div>
      <Form
        label={quoting ? "Fetching Quote…" : "Get Live Quote"}
        disabled={quoting}
        onSubmit={getQuote}
      >
        <div className="amount-box">
          <div className="between">
            <span>You Pay</span>
            <small>
              Balance:{" "}
              {units(
                account ? (buy ? s?.eth : s?.balance) : undefined,
                buy ? 18 : s?.decimals,
              )}{" "}
              {inputSymbol}
            </small>
          </div>
          <Field
            label={`Amount (${inputSymbol})`}
            name="swapAmount"
            type="decimal"
            value={input}
            onChange={setInput}
            placeholder={buy ? "0.01…" : "1000…"}
          />
        </div>
        <Field
          label="Slippage Tolerance (%)"
          name="slippage"
          value={slippage}
          onChange={setSlippage}
          type="decimal"
          hint="0.01–5%. Your minimum output is enforced by the router."
        />
      </Form>
      <div className="quote-box" aria-live="polite">
        <span>You Receive · {outputSymbol}</span>
        <strong>
          {quote ? units(quote.out, buy ? s?.decimals : 18) : "—"}
        </strong>
        <small>
          {quote
            ? `Minimum: ${formatUnits(quote.minimum, buy ? (s?.decimals ?? 18) : 18)} ${outputSymbol} · ${expired ? "Quote expired" : `Valid for ${Math.max(0, Math.ceil((quote.expires - clock) / 1000))}s`}`
            : "Request a live quote to see the exchange rate."}
        </small>
        {quote && (
          <small>
            1 {inputSymbol} ≈{" "}
            {new Intl.NumberFormat(undefined, {
              maximumSignificantDigits: 7,
            }).format(
              Number(formatUnits(quote.out, buy ? (s?.decimals ?? 18) : 18)) /
                Number(
                  formatUnits(quote.input, buy ? 18 : (s?.decimals ?? 18)),
                ),
            )}{" "}
            {outputSymbol}
          </small>
        )}
      </div>
      {!buy && (
        <div className="approvals">
          <p className="eyebrow">PVP Spending Permissions</p>
          <button
            className="secondary"
            disabled={!ready || parsed === 0n || tokenApproved}
            onClick={approveToken}
          >
            {tokenApproved ? "1. PVP Approved" : "1. Approve Exact PVP"}
          </button>
          <button
            className="secondary"
            disabled={!ready || !tokenApproved || routerApproved}
            onClick={approveRouter}
          >
            {routerApproved ? "2. Router Authorized" : "2. Authorize Router"}
          </button>
          <small>
            Two explicit approvals. Amounts are limited to your input; router
            permission expires in 30 minutes.
          </small>
        </div>
      )}
      <button
        className="wide"
        disabled={
          !ready ||
          !quote ||
          expired ||
          (!buy && (!tokenApproved || !routerApproved))
        }
        onClick={() => {
          if (!quote || expired) return;
          try {
            const a = swapAction(
              c,
              buy,
              quote.input,
              quote.minimum,
              quote.expires,
            );
            a.summary = `Spend ${input} ${inputSymbol} and receive at least ${formatUnits(quote.minimum, buy ? (s?.decimals ?? 18) : 18)} ${outputSymbol}. The 1% hook fee and pool LP fee are already reflected in this quote. Output goes to your connected wallet.`;
            review(a);
          } catch (e) {
            report(e);
          }
        }}
      >
        Review Swap
      </button>
      <dl className="compact">
        <dt>King Beneficiary Fee</dt>
        <dd>{s ? Number(s.feeBps) / 100 : 1}% of input</dd>
        <dt>Liquidity Provider Fee</dt>
        <dd>{c.network.pool.fee / 10000}% on pool input</dd>
        <dt>PvPad House Cut</dt>
        <dd>0%</dd>
      </dl>
      <Gate />
    </section>
  );
}
