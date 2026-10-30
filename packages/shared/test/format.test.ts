import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPct, formatUsd, formatUsdCompact, isFresh, pctChange } from "../src/index.ts";

test("formatUsd keeps useful precision across magnitudes", () => {
  assert.equal(formatUsd(67123.456), "$67,123.46");
  assert.equal(formatUsd(1.00012), "$1.0001");
  assert.equal(formatUsd(0.5), "$0.50");
  assert.equal(formatUsd(0.000012345), "$0.00001235");
  assert.equal(formatUsd(null), "—");
});

test("formatUsdCompact and formatPct", () => {
  assert.equal(formatUsdCompact(1_234_000_000_000), "$1.23T");
  assert.equal(formatPct(2.345), "+2.35%");
  assert.equal(formatPct(-1), "-1.00%");
  assert.equal(formatPct(null), "—");
});

test("isFresh uses the 60 second rule", () => {
  const now = 1_000_000;
  assert.equal(isFresh(now - 60_000, now), true);
  assert.equal(isFresh(now - 60_001, now), false);
  assert.equal(isFresh(null, now), false);
});

test("pctChange", () => {
  assert.equal(pctChange(110, 100)?.toFixed(6), "10.000000");
  assert.equal(pctChange(110, 0), null);
  assert.equal(pctChange(null, 100), null);
});
