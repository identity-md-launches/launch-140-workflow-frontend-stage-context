import { useState } from "react";
import {
  concat,
  formatUnits,
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  zeroAddress,
  type Hex,
} from "viem";
import { useDapp } from "./Dapp";
import { bytes32 } from "./config";
import { read, type Client } from "./chain";
import { Addr, address, amount, Field, Form, Gate, Stat, units } from "./ui";
export function Crown() {
  const { config: c, state: s, account, review } = useDapp();
  const [bid, setBid] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  return (
    <section className="panel" id="crown" tabIndex={-1}>
      <p className="eyebrow">King of the Pad</p>
      <h2>Claim the Crown</h2>
      <p>
        Your beneficiary receives the 1% swap fee while you reign. Every wei of
        your bid goes to the worker pot.
      </p>
      <div className="two-stats">
        <Stat label="Current King" value={<Addr value={s?.king} />} />
        <Stat label="Bid Must Exceed" value={`${s ? formatUnits(s.claimPrice, 18) : "—"} ETH`} />
      </div>
      <Form
        label="Review King Claim"
        onSubmit={() => {
          const value = amount(bid);
          const to = address(beneficiary || account || "");
          if (!s || value <= s.claimPrice)
            throw Error(
              "Your bid must be strictly greater than the current claim price.",
            );
          if (value >= s.eth)
            throw Error("Insufficient ETH. Leave some ETH for network fees.");
          review({
            label: "King Claim",
            summary: `Pay ${bid} ETH to the worker pot and set ${to} as the swap-fee beneficiary. This bid is non-refundable; it does not pay the previous King. A higher bid can replace you at any time.`,
            contract: c.hook,
            functionName: "claimKing",
            args: [to],
            value,
          });
        }}
      >
        <Field
          label="Your Bid (ETH)"
          name="kingBid"
          value={bid}
          onChange={setBid}
          type="decimal"
          placeholder="0.011…"
          hint="The next claim price becomes your bid + 10%, rounded up to the nearest wei."
        />
        <Field
          label="Swap-Fee Beneficiary"
          name="beneficiary"
          value={beneficiary}
          onChange={setBeneficiary}
          placeholder={account || "0x…"}
          hint="Leave blank to use your wallet. A contract beneficiary must support withdrawing any fallback credit."
        />
      </Form>
      <Gate />
      <div className="note">
        The first threshold is 0.01 ETH. There is no refund, expiry, or payment
        to a dethroned King.
      </div>
    </section>
  );
}
export function Workers() {
  const { config: c, client, state: s, account, review } = useDapp();
  const [donation, setDonation] = useState("");
  const [epochId, setEpochId] = useState("");
  const [payee, setPayee] = useState("");
  const [payout, setPayout] = useState("");
  const [proof, setProof] = useState("[]");
  const date = (n: bigint) =>
    n
      ? new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "UTC",
        }).format(new Date(Number(n) * 1000)) + " UTC"
      : "—";
  return (
    <section className="panel" id="workers" tabIndex={-1}>
      <p className="eyebrow">People Behind the Work</p>
      <h2>Keep Workers Building</h2>
      <p>
        King claims fund Identity MD workers. An off-chain keeper maps eligible
        workers to payees, obtains oracle attestation, and publishes a Merkle
        root.
      </p>
      <div className="two-stats">
        <Stat label="Unallocated Pot" value={`${units(s?.workerPot)} ETH`} />
        <Stat label="Current Epoch" value={s?.currentEpoch.toString() ?? "—"} />
      </div>
      <dl className="compact">
        <dt>Epoch Budget / Paid</dt>
        <dd>
          {units(s?.epoch[3])} / {units(s?.epoch[4])} ETH
        </dd>
        <dt>Claims Open</dt>
        <dd>{s ? date(s.epoch[1]) : "—"}</dd>
        <dt>Claims Close</dt>
        <dd>{s ? date(s.epoch[2]) : "—"}</dd>
        <dt>Root</dt>
        <dd className="address">
          {s?.currentEpoch ? s.epoch[0] : "No epoch published yet"}
        </dd>
      </dl>
      <h3>Claim a Worker Allocation</h3>
      <p className="muted">
        Paste the allocation and proof from your keeper’s published epoch file.
        Anyone can relay; ETH always goes to the proof’s payee.
      </p>
      <Form
        label="Verify & Review Worker Claim"
        onSubmit={async () => {
          if (!s || !client) throw Error("Wait for live state.");
          const id = BigInt(epochId || s.currentEpoch);
          const to = address(payee || account || "");
          const value = amount(payout);
          let nodes: Hex[];
          try {
            nodes = JSON.parse(proof);
            if (
              !Array.isArray(nodes) ||
              nodes.length > 64 ||
              !nodes.every((x) => typeof x === "string" && bytes32(x))
            )
              throw Error();
          } catch {
            throw Error(
              "Proof must be a JSON array of at most 64 bytes32 hashes. A single-leaf tree uses [].",
            );
          }
          if (id === 0n || id !== s.currentEpoch)
            throw Error("Only the current nonzero epoch can be claimed.");
          const leaf = keccak256(
            keccak256(
              encodeAbiParameters(
                parseAbiParameters("uint256,address,uint256,address,uint256"),
                [BigInt(c.deployment.chainId), c.hook.address, id, to, value],
              ),
            ),
          );
          const root = nodes.reduce(
            (node, sibling) =>
              keccak256(
                concat(
                  BigInt(node) < BigInt(sibling)
                    ? [node, sibling]
                    : [sibling, node],
                ),
              ),
            leaf,
          );
          if (root.toLowerCase() !== s.epoch[0].toLowerCase())
            throw Error(
              "Proof does not match this deployment, epoch, payee, and amount. Check the keeper allocation.",
            );
          const check = async (rpc: Client) => {
            const [epoch, claimed, block, current] = await Promise.all([
              read(rpc, c.hook, "epochs", [id]),
              read(rpc, c.hook, "claimed", [id, to]),
              rpc.getBlock(),
              read(rpc, c.hook, "currentEpoch"),
            ]);
            const e = epoch as [Hex, bigint, bigint, bigint, bigint];
            if (current !== id || e[0].toLowerCase() !== root.toLowerCase())
              throw Error("Epoch changed. Reload your allocation.");
            if (block.timestamp < e[1] || block.timestamp >= e[2])
              throw Error("The epoch claim window is not open.");
            if (claimed) throw Error("This payee already claimed this epoch.");
            if (value > e[3] - e[4])
              throw Error("The allocation exceeds the remaining epoch budget.");
          };
          await check(client);
          review({
            label: "Worker Claim",
            summary: `Relay epoch ${id} and pay ${payout} ETH to ${to}. Your wallet pays gas; the worker pot pays the allocation.`,
            contract: c.hook,
            functionName: "claimWorker",
            args: [id, to, value, nodes],
            check,
          });
        }}
      >
        <div className="form-grid">
          <Field
            label="Epoch ID"
            name="epochId"
            value={epochId}
            onChange={setEpochId}
            placeholder={s?.currentEpoch.toString() || "1…"}
          />
          <Field
            label="Allocation (ETH)"
            name="allocation"
            value={payout}
            onChange={setPayout}
            type="decimal"
            placeholder="0.001…"
          />
        </div>
        <Field
          label="Payee Address"
          name="payee"
          value={payee}
          onChange={setPayee}
          placeholder={account || "0x…"}
          hint="Leave blank to use your connected wallet."
        />
        <Field
          label="Merkle Proof (JSON)"
          name="proof"
          value={proof}
          onChange={setProof}
          textarea
          hint="Use the proof array from the keeper file. Convert its amount in wei to ETH exactly."
        />
      </Form>
      <hr />
      <h3>Fund the Next Epoch</h3>
      <Form
        label="Review Worker Funding"
        onSubmit={() => {
          const value = amount(donation);
          if (!s || value >= s.eth)
            throw Error("Insufficient ETH. Leave some for gas.");
          review({
            label: "Worker Funding",
            summary: `Donate ${donation} ETH to the unallocated worker pot. This donation is non-refundable.`,
            contract: c.hook,
            functionName: "fundWorkers",
            value,
          });
        }}
      >
        <Field
          label="Donation (ETH)"
          name="donation"
          value={donation}
          onChange={setDonation}
          type="decimal"
          placeholder="0.01…"
        />
      </Form>
      <Gate />
    </section>
  );
}
export function Fees() {
  const { config: c, state: s, account, ready, review } = useDapp();
  const [currency, setCurrency] = useState("ETH");
  const [recipient, setRecipient] = useState("");
  const index = currency === "ETH" ? 0 : 1;
  const token = index === 0 ? zeroAddress : c.token.address;
  const fee = s?.fees[index];
  const decimals = index === 0 ? 18 : s?.decimals;
  return (
    <section className="panel" id="fees" tabIndex={-1}>
      <p className="eyebrow">No House Cut</p>
      <h2>Follow the Fees</h2>
      <p>
        Fees go to the current King’s beneficiary. Failed deliveries become
        pullable credit. Some fees remain as PoolManager claims until redeemed.
      </p>
      <div className="field">
        <label htmlFor="fee-currency">Fee Currency</label>
        <select
          id="fee-currency"
          name="feeCurrency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
        >
          <option>ETH</option>
          <option>PVP</option>
        </select>
      </div>
      <div className="two-stats">
        <Stat
          label="Your Pullable Credit"
          value={`${units(fee?.pending, decimals)} ${currency}`}
        />
        <Stat
          label="Total Fees Skimmed"
          value={`${units(fee?.skimmed, decimals)} ${currency}`}
        />
      </div>
      <Form
        label="Review Fee Withdrawal"
        disabled={!fee || fee.pending === 0n}
        onSubmit={() => {
          const to = address(recipient || account || "");
          review({
            label: "Fee Withdrawal",
            summary: `Withdraw all your ${currency} credit (${units(fee?.pending, decimals)}) to ${to}. Any deferred claims are redeemed first.`,
            contract: c.hook,
            functionName: "withdraw",
            args: [token, to],
          });
        }}
      >
        <Field
          label="Withdrawal Recipient"
          name="withdrawTo"
          value={recipient}
          onChange={setRecipient}
          placeholder={account || "0x…"}
          hint="Only your connected wallet’s credit can be withdrawn."
        />
      </Form>
      <hr />
      <h3>Permissionless Maintenance</h3>
      <dl className="compact">
        <dt>Deferred PoolManager Claims</dt>
        <dd>
          {units(fee?.deferred, decimals)} {currency}
        </dd>
        <dt>Unassigned Fees</dt>
        <dd>
          {units(fee?.unassigned, decimals)} {currency}
        </dd>
        <dt>Current Beneficiary</dt>
        <dd>
          <Addr value={s?.beneficiary} />
        </dd>
      </dl>
      <div className="button-row">
        <button
          className="secondary"
          disabled={!ready || !fee?.deferred}
          onClick={() =>
            review({
              label: "Redeem Fees",
              summary: `Turn all deferred ${currency} PoolManager claims into hook balance. This does not redirect fees.`,
              contract: c.hook,
              functionName: "redeem",
              args: [token],
            })
          }
        >
          Redeem Deferred Fees
        </button>
        <button
          className="secondary"
          disabled={
            !ready || !fee?.unassigned || s?.beneficiary === zeroAddress
          }
          onClick={() =>
            review({
              label: "Assign Fees",
              summary: `Assign all pre-King ${currency} fees to the current beneficiary, ${s?.beneficiary}.`,
              contract: c.hook,
              functionName: "assignUnassigned",
              args: [token],
            })
          }
        >
          Assign Unclaimed Fees
        </button>
      </div>
      <Gate />
    </section>
  );
}
