import { useState } from "react";
import { zeroAddress } from "viem";
import { useDapp } from "./Dapp";
import { read } from "./chain";
import { bytes32 } from "./config";
import { Addr, address, amount, Field, Form, Gate, units } from "./ui";
export function Manage() {
  const { config: c, state: s, account, review, ready, client } = useDapp();
  const [operation, setOperation] = useState("transfer");
  const [recipient, setRecipient] = useState("");
  const [owner, setOwner] = useState("");
  const [value, setValue] = useState("");
  const [root, setRoot] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [attested, setAttested] = useState(false);
  const [next, setNext] = useState("");
  const isUpdater =
    !!account && account.toLowerCase() === s?.updater.toLowerCase();
  const isPending =
    !!account && account.toLowerCase() === s?.pendingUpdater.toLowerCase();
  return (
    <section className="panel" id="tools" tabIndex={-1}>
      <p className="eyebrow">Advanced Controls</p>
      <h2>Token & Epoch Tools</h2>
      <h3>PVP Actions</h3>
      <p className="muted">
        Balance: {units(account ? s?.balance : undefined, s?.decimals)} PVP.
        Burns permanently reduce supply. Delegated actions require the holder’s
        allowance.
      </p>
      <div className="field">
        <label htmlFor="token-action">Token Action</label>
        <select
          id="token-action"
          name="tokenAction"
          value={operation}
          onChange={(e) => setOperation(e.target.value)}
        >
          <option value="transfer">Transfer PVP</option>
          <option value="approve">Set / Revoke Allowance</option>
          <option value="burn">Burn Your PVP</option>
          <option value="transferFrom">Transfer with Allowance</option>
          <option value="burnFrom">Burn with Allowance</option>
        </select>
      </div>
      <Form
        label={
          operation.startsWith("burn")
            ? "Review Permanent Burn"
            : "Review Token Action"
        }
        onSubmit={async () => {
          const n = amount(value, s?.decimals, operation === "approve");
          const args: unknown[] = [];
          let description = "";
          if (operation === "transferFrom" || operation === "burnFrom")
            args.push(address(owner));
          if (
            operation === "transfer" ||
            operation === "approve" ||
            operation === "transferFrom"
          )
            args.push(address(recipient));
          args.push(n);
          if (
            (operation === "transfer" || operation === "burn") &&
            s &&
            n > s.balance
          )
            throw Error("Insufficient PVP balance.");
          if (operation === "approve")
            description = `Set the allowance of ${recipient} to exactly ${value} PVP (zero revokes). Only approve a spender you trust.`;
          else if (operation.startsWith("burn"))
            description = `Permanently destroy ${value} PVP from ${operation === "burnFrom" ? owner : "your wallet"}. This cannot be undone.`;
          else
            description = `Transfer ${value} PVP ${operation === "transferFrom" ? `from ${owner} ` : ""}to ${recipient}.`;
          if (client && account) {
            const holder = operation.endsWith("From")
              ? address(owner)
              : account;
            if (operation === "approve") {
              const current = (await read(client, c.token, "allowance", [
                account,
                address(recipient),
              ])) as bigint;
              description += ` Current allowance: ${units(current, s?.decimals)} PVP.`;
            }
            if (operation.endsWith("From")) {
              const [balance, allowance] = (await Promise.all([
                read(client, c.token, "balanceOf", [holder]),
                read(client, c.token, "allowance", [holder, account]),
              ])) as bigint[];
              if (n > balance || n > allowance)
                throw Error(
                  "The holder has insufficient balance or has not approved this wallet for that amount.",
                );
              description += ` Current allowance: ${units(allowance, s?.decimals)} PVP.`;
            }
          }
          review({
            label: operation.startsWith("burn")
              ? "Permanent Burn"
              : "Token Action",
            summary: description,
            contract: c.token,
            functionName: operation,
            args,
          });
        }}
      >
        {(operation === "transferFrom" || operation === "burnFrom") && (
          <Field
            label="Token Holder"
            name="holder"
            value={owner}
            onChange={setOwner}
            placeholder="0x…"
          />
        )}
        {["transfer", "transferFrom", "approve"].includes(operation) && (
          <Field
            label={
              operation === "approve" ? "Spender Address" : "Recipient Address"
            }
            name="tokenRecipient"
            value={recipient}
            onChange={setRecipient}
            placeholder="0x…"
          />
        )}
        <Field
          label="Amount (PVP)"
          name="tokenAmount"
          value={value}
          onChange={setValue}
          type="decimal"
          placeholder="100…"
        />
      </Form>
      <hr />
      <h3>Epoch Updater</h3>
      <dl className="compact">
        <dt>Current Updater</dt>
        <dd>
          <Addr value={s?.updater} />
        </dd>
        <dt>Proposed Updater</dt>
        <dd>
          <Addr value={s?.pendingUpdater} />
        </dd>
        <dt>Next Epoch Budget</dt>
        <dd>{units(s?.available)} ETH</dd>
      </dl>
      <p className="muted">
        Only the current updater can publish an epoch. Identity MD oracle
        approval (panel 70, quorum 67, boolean) happens off chain. The contract
        does not verify that attestation.
      </p>
      <Form
        label="Review Epoch Publication"
        disabled={!isUpdater || !attested}
        onSubmit={() => {
          if (!bytes32(root) || BigInt(root) === 0n)
            throw Error("Enter a nonzero bytes32 Merkle root.");
          if (!/^\d+$/.test(start) || !/^\d+$/.test(end))
            throw Error("Enter integer Unix timestamps in seconds.");
          const from = BigInt(start),
            to = BigInt(end);
          if (
            !s ||
            to <= from ||
            to <= s.timestamp ||
            to - from > 7776000n ||
            to >= 2n ** 64n ||
            from >= 2n ** 64n
          )
            throw Error(
              "Use a future end, start before end, and a window of at most 90 days.",
            );
          if (s.currentEpoch > 0n && s.timestamp < s.epoch[2])
            throw Error("Wait for the current epoch to close.");
          if (s.available === 0n)
            throw Error("The next epoch budget is empty.");
          review({
            label: "Epoch Publication",
            summary: `Publish root ${root} with claim window ${start}–${end} (Unix seconds). The entire available pot is committed to this epoch. You attest that the off-chain oracle approved this exact allocation.`,
            contract: c.hook,
            functionName: "setEpoch",
            args: [root, from, to],
          });
        }}
      >
        <Field
          label="Attested Merkle Root"
          name="epochRoot"
          value={root}
          onChange={setRoot}
          placeholder="0x…"
        />
        <div className="form-grid">
          <Field
            label="Window Start (Unix Seconds)"
            name="windowStart"
            value={start}
            onChange={setStart}
            placeholder="1780000000…"
          />
          <Field
            label="Window End (Unix Seconds)"
            name="windowEnd"
            value={end}
            onChange={setEnd}
            placeholder="1780600000…"
          />
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            name="oracleConfirmed"
            checked={attested}
            onChange={(e) => setAttested(e.target.checked)}
          />
          I have retained affirmative oracle evidence for this exact root,
          epoch, window, and allocation.
        </label>
      </Form>
      {!isUpdater && (
        <p className="gate">
          Connect as the current updater to publish or propose a handoff.
        </p>
      )}
      <hr />
      <h3>Two-Step Updater Handoff</h3>
      <Form
        label="Review Updater Proposal"
        disabled={!isUpdater}
        onSubmit={() => {
          const to = address(next, true);
          review({
            label: "Updater Proposal",
            summary:
              to === zeroAddress
                ? "Cancel the pending updater proposal."
                : `Propose ${to} as the new updater. That wallet must accept before the role changes.`,
            contract: c.hook,
            functionName: "proposeUpdater",
            args: [to],
          });
        }}
      >
        <Field
          label="Proposed Updater Address"
          name="nextUpdater"
          value={next}
          onChange={setNext}
          placeholder="0x…"
          hint="The zero address cancels a pending proposal."
        />
      </Form>
      <button
        className="secondary wide"
        disabled={!ready || !isPending}
        onClick={() =>
          review({
            label: "Accept Updater Role",
            summary:
              "Accept the proposed updater role with your connected wallet. The current updater loses this role.",
            contract: c.hook,
            functionName: "acceptUpdater",
          })
        }
      >
        Accept Updater Role
      </button>
      <Gate />
      <hr />
      <details>
        <summary>Network & Routing</summary>
        <p className="muted">
          Public infrastructure used to quote and route swaps. These addresses
          are separate from the two attested PvPad contracts.
        </p>
        <dl className="compact">
          {Object.entries({
            ...c.network.infrastructure,
            poolManager: c.network.pool.manager,
          }).map(([name, value]) => (
            <div className="infra-entry" key={name}>
              <dt>{name}</dt>
              <dd>
                <a
                  className="address"
                  href={`${c.network.explorer}/address/${value}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {value} ↗
                </a>
              </dd>
            </div>
          ))}
        </dl>
        <p className="muted">
          Public RPCs:{" "}
          {c.network.rpcUrls.map((url) => new URL(url).hostname).join(", ")}
        </p>
      </details>
    </section>
  );
}
