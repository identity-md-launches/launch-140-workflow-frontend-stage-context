import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  decodeAbiParameters,
  parseAbiParameters,
  parseEther,
  zeroAddress,
} from "viem";
import {
  setup,
  connect,
  account,
  other,
  leaf,
  hook,
  token,
  network,
} from "./fixtures";
async function confirm(page: any) {
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Confirm in Wallet" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "confirmed." }),
  ).toBeVisible();
}
async function start(page: any, options: any = {}) {
  const model = await setup(page, options);
  await page.goto("./");
  await expect(page.getByText(/Live · Block/)).toBeVisible();
  return model;
}
test("gateway subpath, mobile/desktop layout, semantics and keyboard", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await start(page);
  await expect(
    page.getByRole("button", { name: "Review Swap" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("link", { name: /the attested manifest/ }),
  ).toHaveAttribute("href", "./imd-deployment.json");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to Content" }),
  ).toBeFocused();
  await page.getByRole("heading", { level: 1 }).click();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const violations = (await new AxeBuilder({ page }).analyze()).violations;
    expect(violations).toEqual([]);
    await page.screenshot({
      path: `../docs/frontend/${width === 1440 ? "desktop" : "mobile"}.png`,
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
});
test("missing wallet, connection rejection, wrong chain and switch", async ({
  page,
}) => {
  const m = await start(page, { wrongChain: true });
  m.reject = true;
  await connect(page);
  await expect(page.getByRole("alert")).toContainText("Request rejected");
  m.reject = false;
  await connect(page);
  await expect(
    page.getByRole("button", { name: "Get Live Quote" }),
  ).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("wrong network");
  await page.getByRole("button", { name: "Switch to Sepolia" }).click();
  await expect(
    page.getByRole("button", { name: "Get Live Quote" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect(
    page.getByRole("button", { name: "Review Swap" }),
  ).toBeDisabled();
});
test("no injected wallet gives actionable message", async ({ page }) => {
  await start(page, { wallet: false });
  await page.getByRole("button", { name: "Connect Wallet" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "No browser wallet found",
  );
});
test("ETH buy enforces exact input, hook pool key, minimum output and expiry", async ({
  page,
}) => {
  const m = await start(page);
  await connect(page);
  await page.getByLabel("Amount (ETH)").fill("0.01");
  await page.getByRole("button", { name: "Get Live Quote" }).click();
  await expect(page.getByRole("button", { name: "Review Swap" })).toBeEnabled();
  await page.getByRole("button", { name: "Review Swap" }).click();
  await expect(page.getByRole("dialog")).toContainText("8955 PVP");
  await confirm(page);
  expect(m.sends).toHaveLength(1);
  const sent = m.sends[0];
  expect(sent.tx.to).toBe(network.infrastructure.router);
  expect(sent.tx.value).toBe("0x2386f26fc10000");
  expect(sent.args[0]).toBe("0x10");
  const [actions, params] = decodeAbiParameters(
    parseAbiParameters("bytes,bytes[]"),
    sent.args[1][0],
  );
  expect(actions).toBe("0x060c0f");
  const [swap] = decodeAbiParameters(
    parseAbiParameters(
      "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)",
    ),
    params[0],
  );
  expect(swap.poolKey.hooks.toLowerCase()).toBe(hook);
  expect(swap.poolKey.currency1.toLowerCase()).toBe(token);
  expect(swap.poolKey.currency0).toBe(zeroAddress);
  expect(swap.amountIn).toBe(parseEther("0.01"));
  expect(swap.amountOutMinimum).toBe(parseEther("8955"));
  expect(m.simulations.some((x) => x.fn === "execute")).toBe(true);
});
test("PVP sell requires two limited approvals and submits zero native value", async ({
  page,
}) => {
  const m = await start(page);
  await connect(page);
  await page.getByRole("button", { name: "Reverse swap direction" }).click();
  await page.getByLabel("Amount (PVP)").fill("1000");
  await page.getByRole("button", { name: "Get Live Quote" }).click();
  await expect(
    page.getByRole("button", { name: "Review Swap" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "1. Approve Exact PVP" }).click();
  await confirm(page);
  expect(m.allowance).toBe(parseEther("1000"));
  await page.getByRole("button", { name: "2. Authorize Router" }).click();
  await confirm(page);
  expect(m.permit).toBe(parseEther("1000"));
  expect(m.expiry).toBeLessThan(Date.now() / 1000 + 1801);
  await page.getByRole("button", { name: "Get Live Quote" }).click();
  await page.getByRole("button", { name: "Review Swap" }).click();
  await confirm(page);
  expect(m.sends[2].tx.value).toBe("0x0");
});
test("quote inputs invalidate output; invalid precision, balance and slippage fail", async ({
  page,
}) => {
  await start(page);
  await connect(page);
  await page.getByLabel("Amount (ETH)").fill("0.0000000000000000001");
  await page.getByRole("button", { name: "Get Live Quote" }).click();
  await expect(page.getByRole("alert")).toContainText("18 decimal");
  await page.getByLabel("Amount (ETH)").fill("3");
  await page.getByRole("button", { name: "Get Live Quote" }).click();
  await expect(page.getByRole("alert")).toContainText("Insufficient ETH");
  await page.getByLabel("Amount (ETH)").fill("0.01");
  await page.getByLabel("Slippage Tolerance (%)").fill("6");
  await page.getByRole("button", { name: "Get Live Quote" }).click();
  await expect(page.getByRole("alert")).toContainText("between 0.01% and 5%");
  await page.getByLabel("Slippage Tolerance (%)").fill("0.5");
  await page.getByRole("button", { name: "Get Live Quote" }).click();
  await expect(page.getByRole("button", { name: "Review Swap" })).toBeEnabled();
  await page.getByLabel("Amount (ETH)").fill("0.02");
  await expect(
    page.getByRole("button", { name: "Review Swap" }),
  ).toBeDisabled();
});
test("king bid strictly exceeds threshold; cancel, rejection and success", async ({
  page,
}) => {
  const m = await start(page);
  await connect(page);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Crown", exact: true })
    .click();
  await page.getByLabel("Your Bid (ETH)").fill("0.01");
  await page.getByRole("button", { name: "Review King Claim" }).click();
  await expect(page.getByRole("alert")).toContainText("strictly greater");
  await page.getByLabel("Your Bid (ETH)").fill("0.011");
  await page.getByRole("button", { name: "Review King Claim" }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(m.sends).toHaveLength(0);
  m.reject = true;
  await page.getByRole("button", { name: "Review King Claim" }).click();
  await page.getByRole("button", { name: "Confirm in Wallet" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Request rejected" }),
  ).toBeVisible();
  expect(m.sends).toHaveLength(0);
  m.reject = false;
  await page.getByRole("button", { name: "Review King Claim" }).click();
  await confirm(page);
  expect(m.sends[0].functionName).toBe("claimKing");
  expect(m.sends[0].args[0].toLowerCase()).toBe(account);
  expect(m.pot).toBe(parseEther("0.511"));
});
test("worker proof binding, valid relay, replay guard and voluntary funding", async ({
  page,
}) => {
  const m = await start(page);
  await connect(page);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Workers", exact: true })
    .click();
  await page.getByLabel("Allocation (ETH)").fill("0.003");
  await page
    .getByRole("button", { name: "Verify & Review Worker Claim" })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Proof does not match" }),
  ).toBeVisible();
  await page.getByLabel("Allocation (ETH)").fill("0.002");
  await page
    .getByRole("button", { name: "Verify & Review Worker Claim" })
    .click();
  await confirm(page);
  expect(m.sends[0].functionName).toBe("claimWorker");
  await page
    .getByRole("button", { name: "Verify & Review Worker Claim" })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "already claimed" }),
  ).toBeVisible();
  await page.getByLabel("Donation (ETH)").fill("0.01");
  await page.getByRole("button", { name: "Review Worker Funding" }).click();
  await confirm(page);
  expect(m.sends[1].functionName).toBe("fundWorkers");
});
test("fee withdrawal, redeem and unassigned controls use selected currency", async ({
  page,
}) => {
  const m = await start(page);
  await connect(page);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Fees", exact: true })
    .click();
  await page.getByLabel("Fee Currency").selectOption("PVP");
  await page.getByRole("button", { name: "Review Fee Withdrawal" }).click();
  await confirm(page);
  await page.getByRole("button", { name: "Redeem Deferred Fees" }).click();
  await confirm(page);
  await page.getByRole("button", { name: "Assign Unclaimed Fees" }).click();
  await confirm(page);
  expect(m.sends.map((x) => x.functionName)).toEqual([
    "withdraw",
    "redeem",
    "assignUnassigned",
  ]);
  expect(m.sends.every((x) => x.args[0].toLowerCase() === token)).toBe(true);
});
test("updater role gating and all ERC20 actions including burn review", async ({
  page,
}) => {
  const m = await start(page);
  await connect(page);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Tools", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Review Epoch Publication" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Accept Updater Role" }),
  ).toBeDisabled();
  for (const op of [
    "transfer",
    "approve",
    "burn",
    "transferFrom",
    "burnFrom",
  ]) {
    await page.getByLabel("Token Action", { exact: true }).selectOption(op);
    if (op === "transfer" || op === "transferFrom")
      await page.getByLabel("Recipient Address", { exact: true }).fill(other);
    if (op === "approve") await page.getByLabel("Spender Address").fill(other);
    if (op === "transferFrom" || op === "burnFrom")
      await page.getByLabel("Token Holder").fill(other);
    await page.getByLabel("Amount (PVP)", { exact: true }).fill("1");
    await page
      .getByRole("button", {
        name: op.startsWith("burn")
          ? "Review Permanent Burn"
          : "Review Token Action",
      })
      .click();
    if (op.startsWith("burn"))
      await expect(page.getByRole("dialog")).toContainText("cannot be undone");
    await confirm(page);
  }
  expect(m.sends.map((x) => x.functionName)).toEqual([
    "transfer",
    "approve",
    "burn",
    "transferFrom",
    "burnFrom",
  ]);
});
test("updater can publish ended epoch with evidence acknowledgement and hand off", async ({
  page,
}) => {
  const m = await start(page, { updater: true });
  m.windowEnd = BigInt(Math.floor(Date.now() / 1000) - 10);
  await connect(page);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Tools", exact: true })
    .click();
  await page.getByLabel("Attested Merkle Root").fill(leaf);
  await page
    .getByLabel("Window Start (Unix Seconds)")
    .fill(String(Math.floor(Date.now() / 1000)));
  await page
    .getByLabel("Window End (Unix Seconds)")
    .fill(String(Math.floor(Date.now() / 1000) + 3600));
  await expect(
    page.getByRole("button", { name: "Review Epoch Publication" }),
  ).toBeDisabled();
  await page.getByLabel(/I have retained affirmative/).check();
  await page.getByRole("button", { name: "Review Epoch Publication" }).click();
  await confirm(page);
  await page.getByLabel("Proposed Updater Address").fill(account);
  await page.getByRole("button", { name: "Review Updater Proposal" }).click();
  await confirm(page);
  await page.getByRole("button", { name: "Accept Updater Role" }).click();
  await confirm(page);
  expect(m.sends.map((x) => x.functionName)).toEqual([
    "setEpoch",
    "proposeUpdater",
    "acceptUpdater",
  ]);
});
test("simulation revert blocks wallet and receipt revert is not success", async ({
  page,
}) => {
  const m = await start(page);
  await connect(page);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Crown", exact: true })
    .click();
  await page.getByLabel("Your Bid (ETH)").fill("0.011");
  m.simulateRevert = true;
  await page.getByRole("button", { name: "Review King Claim" }).click();
  await page.getByRole("button", { name: "Confirm in Wallet" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "reverted" }),
  ).toBeVisible();
  expect(m.sends).toHaveLength(0);
  m.simulateRevert = false;
  m.receiptRevert = true;
  await page.getByRole("button", { name: "Review King Claim" }).click();
  await page.getByRole("button", { name: "Confirm in Wallet" }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Transaction reverted on chain" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View Transaction" }),
  ).toBeVisible();
});
test("account event closes review; silent network changes block send", async ({
  page,
}) => {
  const m = await start(page);
  await connect(page);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Crown", exact: true })
    .click();
  await page.getByLabel("Your Bid (ETH)").fill("0.011");
  await page.getByRole("button", { name: "Review King Claim" }).click();
  await page.evaluate(() => {
    (window.ethereum as any).emit("accountsChanged", []);
  });
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(m.sends).toHaveLength(0);
  await page.getByRole("button", { name: "Connect Wallet" }).click();
  await page.getByRole("button", { name: "Review King Claim" }).click();
  m.chain = "0x1";
  await page.getByRole("button", { name: "Confirm in Wallet" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "network changed" }),
  ).toBeVisible();
  expect(m.sends).toHaveLength(0);
});
test("missing code and unavailable RPC keep actions locked", async ({
  page,
}) => {
  const m = await setup(page, { missingCode: true });
  await page.goto("./");
  await expect(page.getByRole("alert")).toContainText(
    /has no code|could not be verified/,
  );
  await page.getByRole("button", { name: "Connect Wallet" }).click();
  await expect(
    page.getByRole("button", { name: "Get Live Quote" }),
  ).toBeDisabled();
  m.missingCode = false;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Get Live Quote" }),
  ).toBeEnabled();
});
test("ABI asset tampering fails closed before showing transaction controls", async ({
  page,
}) => {
  await page.route("**/abi/PVP.json", (route) =>
    route.fulfill({ contentType: "application/json", body: "[]" }),
  );
  await page.goto("./");
  await expect(page.getByRole("alert")).toContainText("Asset integrity failed");
  await expect(
    page.getByRole("button", { name: "Connect Wallet" }),
  ).toHaveCount(0);
});
test("quote expiry and quote failure block swaps", async ({ page }) => {
  const m = await start(page);
  await connect(page);
  await page.clock.install();
  await page.getByLabel("Amount (ETH)").fill("0.01");
  await page.getByRole("button", { name: "Get Live Quote" }).click();
  await expect(page.getByRole("button", { name: "Review Swap" })).toBeEnabled();
  await page.clock.fastForward(61_000);
  await expect(
    page.getByRole("button", { name: "Review Swap" }),
  ).toBeDisabled();
  await expect(page.getByText(/Quote expired/)).toBeVisible();
  m.simulateRevert = true;
  await page.getByRole("button", { name: "Get Live Quote" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: /Quote unavailable|revert|RPC/ }),
  ).toBeVisible();
  expect(m.sends).toHaveLength(0);
});
test("public RPC outage locks disconnected app; connected wallet provides fallback", async ({
  page,
}) => {
  await setup(page, { rpcFailure: true, wrongChain: true });
  await page.goto("./");
  await expect(page.getByRole("alert")).toContainText("Public RPC unavailable");
  await page.getByRole("button", { name: "Connect Wallet" }).click();
  await page.getByRole("button", { name: "Switch to Sepolia" }).click();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByText(/Connected wallet RPC/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Get Live Quote" }),
  ).toBeEnabled();
});
test("all panels and transaction dialog remain accessible at mobile width", async ({
  page,
}) => {
  await start(page);
  await connect(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const tab of ["Crown", "Workers", "Fees", "Tools"]) {
    await page
      .getByRole("navigation")
      .getByRole("link", { name: tab, exact: true })
      .click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Crown", exact: true })
    .click();
  await page.getByLabel("Your Bid (ETH)").fill("0.011");
  await page.getByRole("button", { name: "Review King Claim" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review King Claim" }),
  ).toBeFocused();
});
