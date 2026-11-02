import { test } from "node:test";
import assert from "node:assert/strict";
import {
  badgesFor,
  checkPoll,
  contrast,
  DEFAULT_LOOK,
  isMediaId,
  lookToString,
  lookVars,
  milestonePassed,
  normalizeLook,
  onColor,
  parseLook,
  pollShares,
  quoteFor,
  readableOn,
  sniffImage,
  splitBlocks,
  splitInline,
  STYLE_IDS,
  THEME_STYLES,
  TEMPLATE_IDS,
  withoutQuotes,
} from "../src/index.js";

test("every requested style has its colors", () => {
  assert.equal(THEME_STYLES.glass.colors.length, 10);
  for (const id of ["red", "blue", "green", "orange", "black", "pink"]) {
    assert.ok(THEME_STYLES.glass.colors.some((c) => c.id === id), `glass ${id}`);
  }
  for (const s of ["brutal", "minimal", "swiss", "darkmin"] as const) assert.equal(THEME_STYLES[s].colors.length, 10, s);
  assert.equal(TEMPLATE_IDS.length, 5);
  for (const s of STYLE_IDS) {
    const ids = THEME_STYLES[s].colors.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length, `${s} color ids are unique`);
    for (const c of THEME_STYLES[s].colors) assert.match(c.accent + c.accent2, /^#[0-9a-f]{6}#[0-9a-f]{6}$/);
  }
});

test("looks round-trip and fix bad parts", () => {
  const l = { style: "glass", color: "sunset", mode: "dark", template: "hub" } as const;
  assert.deepEqual(parseLook(lookToString(l)), l);
  // Wrong color for the style falls back to the style's first color.
  assert.deepEqual(normalizeLook({ style: "swiss", color: "sunset" }), { ...DEFAULT_LOOK, style: "swiss", color: "red", mode: "auto" });
  // Dark Minimalism is dark only; Neo-brutalism light only.
  assert.equal(normalizeLook({ style: "darkmin", mode: "light" }).mode, "dark");
  assert.equal(normalizeLook({ style: "brutal", mode: "dark" }).mode, "light");
  assert.equal(parseLook("nope.red"), null);
  assert.equal(parseLook(""), null);
  assert.equal(parseLook("glass").color, "red");
  assert.equal(normalizeLook({ template: "x" }).template, "hub");
});

test("accent text stays readable", () => {
  // Lemon yellow can't be text on white; it gets darkened until it passes AA.
  const ink = readableOn("#ffe14d", "#ffffff");
  assert.ok(contrast(ink, "#ffffff") >= 4.5);
  assert.equal(readableOn("#111111", "#ffffff"), "#111111");
  assert.equal(onColor("#ffe14d"), "#000000");
  assert.equal(onColor("#1f2937"), "#ffffff");
  for (const s of STYLE_IDS) {
    for (const c of THEME_STYLES[s].colors) {
      const v = lookVars({ style: s, color: c.id });
      assert.ok(contrast(v["--accent-ink-light"]!, "#ffffff") >= 4.4, `${s}/${c.id} light`);
      assert.ok(contrast(v["--accent-ink-dark"]!, "#0d1117") >= 4.4, `${s}/${c.id} dark`);
      assert.ok(contrast(v["--on-accent"]!, c.accent) >= 3, `${s}/${c.id} on accent`);
    }
  }
});

test("only real image bytes pass the sniff", () => {
  const pad = (b: number[]) => Uint8Array.from([...b, ...Array(16).fill(0)]);
  assert.equal(sniffImage(pad([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(sniffImage(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(sniffImage(pad([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])), "image/gif");
  assert.equal(sniffImage(pad([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50])), "image/webp");
  assert.equal(sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(sniffImage(new TextEncoder().encode("<html><script>")), null);
  assert.ok(isMediaId("AbCdEfGhIjKlMnOpQrStU_"));
  assert.ok(!isMediaId("../etc/passwd"));
});

test("polls clean their options", () => {
  assert.deepEqual(checkPoll([" Up ", "Down", "", "Sideways"], 24), { options: ["Up", "Down", "Sideways"], hours: 24 });
  assert.ok("error" in checkPoll(["Only one"], 24));
  assert.ok("error" in checkPoll(["a", "A"], 24));
  assert.ok("error" in checkPoll(["a", "b"], 0));
  assert.ok("error" in checkPoll(["a", "b", "c", "d", "e", "f", "g"], 24));
  assert.deepEqual(pollShares([1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(pollShares([0, 0]), [0, 0]);
  assert.equal(pollShares([2, 5, 9]).reduce((s, n) => s + n, 0), 100);
});

test("vote milestones fire once", () => {
  assert.equal(milestonePassed(9, 10), 10);
  assert.equal(milestonePassed(10, 11), null);
  assert.equal(milestonePassed(11, 10), null);
  assert.equal(milestonePassed(49, 120), 50);
});

test("badges follow activity", () => {
  const base = { createdAt: Date.now(), topics: 0, replies: 0, scoreReceived: 0, followers: 0, verified: false, memberNo: 5000, polls: 0 };
  assert.deepEqual(badgesFor(base), []);
  const ids = badgesFor({ ...base, memberNo: 12, topics: 1, scoreReceived: 150, followers: 12 }).map((b) => b.id);
  assert.deepEqual(ids, ["early", "first-post", "useful", "followed"]);
});

test("light formatting", () => {
  assert.deepEqual(splitInline("a **b** *c* `d` ~~e~~ ||f||"), [
    { kind: "plain", text: "a " },
    { kind: "bold", text: "b" },
    { kind: "plain", text: " " },
    { kind: "italic", text: "c" },
    { kind: "plain", text: " " },
    { kind: "code", text: "d" },
    { kind: "plain", text: " " },
    { kind: "strike", text: "e" },
    { kind: "plain", text: " " },
    { kind: "spoiler", text: "f" },
  ]);
  assert.deepEqual(splitInline("2 * 3 * 4"), [{ kind: "plain", text: "2 * 3 * 4" }]);
  assert.deepEqual(splitBlocks("> quoted\n> more\nmine\n\nnext"), [
    { kind: "quote", text: "quoted\nmore" },
    { kind: "para", text: "mine" },
    { kind: "para", text: "next" },
  ]);
  assert.equal(quoteFor("ann", "hi\nthere"), "> hi\n> there\n> — @ann\n\n");
  assert.equal(quoteFor("pricebot", "x", false), "> x\n> — pricebot\n\n");
  assert.equal(withoutQuotes("> hi @ann\n> — @ben\n\nmine @cara"), "mine @cara");
});
