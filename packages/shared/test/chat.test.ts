import { test } from "node:test";
import assert from "node:assert/strict";
import { chatNameProblem, checkMessage, cleanBody, findDomains, parseRoom, type FilterResult } from "../src/index.ts";

const member = { canPostLinks: true };
const newbie = { canPostLinks: false };

function reasons(r: FilterResult): string[] {
  return r.action === "hold" ? r.reasons : [];
}

test("ordinary market talk passes", () => {
  for (const msg of [
    "BTC looks strong above 70k, might retest 68k first",
    "Anyone else think ETH/BTC bottomed?",
    "I bought some SOL at $140, holding for now",
    "Fed decision at 2pm ET, expect volatility",
    "lol that wick 😂",
    "The 200 day moving average is at 61,250",
    "Check coingecko.com for the full supply numbers",
    "i.e. the U.S. session usually moves it",
    "I message my broker every morning",
  ]) {
    assert.deepEqual(checkMessage(cleanBody(msg), member), { action: "allow" }, msg);
  }
});

test("wallet addresses are held", () => {
  for (const msg of [
    "send to 0x52908400098527886E0F7030069857D2E4169EE7 for a bonus",
    "my btc bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
    "1BoatSLRHtKNngkdXEeobR76b53LETtpyT",
    "sol: 7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV",
    "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL tron",
  ]) {
    assert.deepEqual(reasons(checkMessage(msg, member)), ["wallet-address"], msg);
  }
});

test("Telegram, WhatsApp and DM requests are held", () => {
  assert.ok(reasons(checkMessage("join my telegram @cryptokings for signals", member)).includes("messaging-invite"));
  assert.ok(reasons(checkMessage("t.me/pumpgroup", member)).includes("messaging-invite"));
  assert.ok(reasons(checkMessage("t . me / pumpgroup", member)).includes("messaging-invite"));
  assert.ok(reasons(checkMessage("whatsapp +1 415 555 0134", member)).includes("messaging-invite"));
  assert.ok(reasons(checkMessage("chat.whatsapp.com/AbCdEf", newbie)).includes("messaging-invite"));
  assert.ok(reasons(checkMessage("DM me for the strategy", member)).includes("dm-request"));
  assert.ok(reasons(checkMessage("inbox me bro", member)).includes("dm-request"));
  assert.ok(reasons(checkMessage("call +44 20 7946 0958", member)).includes("phone-number"));
});

test("guaranteed returns, seed phrases and giveaways are held", () => {
  assert.ok(reasons(checkMessage("Guaranteed returns of 30% every week", member)).includes("guaranteed-returns"));
  assert.ok(reasons(checkMessage("gu4ranteed pr0fit, no risk", member)).includes("guaranteed-returns"));
  assert.ok(reasons(checkMessage("double your BTC in 24 hours", member)).includes("guaranteed-returns"));
  assert.ok(reasons(checkMessage("my account manager made me 5% daily profit", member)).includes("guaranteed-returns"));
  assert.ok(reasons(checkMessage("enter your seed phrase to sync", member)).includes("wallet-secrets"));
  assert.ok(reasons(checkMessage("validate your wallet here", member)).includes("wallet-secrets"));
  assert.ok(reasons(checkMessage("FREE ETH giveaway today", member)).includes("giveaway"));
  assert.ok(reasons(checkMessage("claim your airdrop now", member)).includes("giveaway"));
});

test("staff impersonation is held unless staff wrote it", () => {
  assert.ok(reasons(checkMessage("Hi, I am the admin, please verify", member)).includes("staff-impersonation"));
  assert.ok(reasons(checkMessage("midbig support here", member)).includes("staff-impersonation"));
  assert.deepEqual(checkMessage("I'm a mod, please keep it civil", { canPostLinks: true, isStaff: true }), {
    action: "allow",
  });
});

test("pump spam is held", () => {
  assert.ok(reasons(checkMessage("next 100x gem, buy now before it moons 🚀🚀🚀", member)).includes("pump-spam"));
  assert.ok(reasons(checkMessage("🚀🚀🚀🚀🚀🚀🚀🚀 PEPE", member)).includes("pump-spam"));
  assert.deepEqual(checkMessage("BTC to the moon", member), { action: "allow" });
});

test("links: new accounts can't post any, unknown sites wait for review", () => {
  const r = checkMessage("see https://coindesk.com/markets", newbie);
  assert.equal(r.action, "reject");
  assert.deepEqual(checkMessage("see https://coindesk.com/markets", member), { action: "allow" });
  assert.deepEqual(reasons(checkMessage("great read: myblog.xyz/post", member)), ["unknown-link"]);
  assert.deepEqual(reasons(checkMessage("bit.ly/3abc", member)), ["link-shortener"]);
  assert.deepEqual(reasons(checkMessage("coinbase-wallet-verify.com", member)), ["lookalike-domain"]);
  assert.deepEqual(reasons(checkMessage("go to metamask dot io", member)), ["lookalike-domain"]);
  assert.deepEqual(checkMessage("my own site example.org", { canPostLinks: true, isStaff: true }), { action: "allow" });
});

test("shouting and repeats are refused with a reason", () => {
  assert.equal(checkMessage("THIS COIN IS GOING TO EXPLODE TODAY", member).action, "reject");
  assert.equal(checkMessage("buyyyyyyyyyyyyyyyyyyy", member).action, "reject");
  assert.equal(checkMessage("moon moon moon moon moon moon moon moon moon", member).action, "reject");
  assert.equal(checkMessage("x".repeat(501), member).action, "reject");
  assert.equal(checkMessage("", member).action, "reject");
  assert.deepEqual(checkMessage("BTC ETH SOL", member), { action: "allow" });
});

test("cleanBody strips invisible characters", () => {
  assert.equal(cleanBody("  t​.​me  \n\n\n\nhi\u0007 "), "t.me \n\nhi");
});

test("findDomains ignores abbreviations", () => {
  assert.deepEqual(findDomains("e.g. the u.s. market"), []);
  assert.deepEqual(findDomains("WWW.Example.com/x"), ["example.com"]);
});

test("chat names: format, reserved words and staff lookalikes", () => {
  assert.equal(chatNameProblem("satoshi_fan", []), null);
  assert.equal(chatNameProblem("modern_trader", []), null);
  assert.match(chatNameProblem("ab", []) ?? "", /3 to 20/);
  assert.match(chatNameProblem("bad name", []) ?? "", /3 to 20/);
  assert.match(chatNameProblem("Admin", []) ?? "", /staff/);
  assert.match(chatNameProblem("adm1n_kai", []) ?? "", /staff/);
  assert.match(chatNameProblem("midbig_help", []) ?? "", /staff/);
  assert.match(chatNameProblem("MidBigSupport", []) ?? "", /staff/);
  assert.match(chatNameProblem("john_mod", []) ?? "", /staff/);
  assert.match(chatNameProblem("Kha1", ["Khai"]) ?? "", /moderator/);
  assert.match(chatNameProblem("K_hai", ["Khai"]) ?? "", /moderator/);
  assert.equal(chatNameProblem("khai", ["Khai"]), null, "a staff member's own name, any case");
  assert.equal(chatNameProblem("admin", [], true), null);
});

test("parseRoom accepts only global and coin rooms", () => {
  assert.deepEqual(parseRoom("global"), { kind: "global" });
  assert.deepEqual(parseRoom("coin:bitcoin"), { kind: "coin", assetId: "bitcoin" });
  assert.equal(parseRoom("coin:"), null);
  assert.equal(parseRoom("coin:../x"), null);
  assert.equal(parseRoom("private"), null);
});
