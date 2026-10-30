"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * The visitor's choice about optional (ads and analytics) cookies, kept in a
 * cookie so the server can read it too. Nothing optional runs today; any ad
 * or analytics script added later must check optionalCookiesAllowed() first.
 */
const COOKIE = "midbig_privacy";
type Choice = "all" | "essential";

declare global {
  interface Navigator {
    globalPrivacyControl?: boolean;
  }
}

function readChoice(): Choice | null {
  const m = document.cookie.match(/(?:^|; )midbig_privacy=(all|essential)/);
  return (m?.[1] as Choice) ?? null;
}

function saveChoice(c: Choice): void {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE}=${c}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax${secure}`;
}

/** Global Privacy Control is a browser setting that means "don't sell or share my data". */
function gpcOn(): boolean {
  return typeof navigator !== "undefined" && navigator.globalPrivacyControl === true;
}

export function optionalCookiesAllowed(): boolean {
  return !gpcOn() && readChoice() === "all";
}

/** Asks once, on the first visit. Essential cookies (login) don't need consent. */
export function CookieBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (readChoice()) return;
    if (gpcOn()) return saveChoice("essential");
    setShow(true);
  }, []);
  if (!show) return null;
  const pick = (c: Choice) => {
    saveChoice(c);
    setShow(false);
  };
  return (
    <div className="cookie-banner" role="region" aria-label="Cookie choices">
      <p>
        We use essential cookies to keep you logged in. With your OK, we may also use cookies for ads and measuring
        visits. <Link href="/privacy-choices">Privacy choices</Link>
      </p>
      <p className="row-gap">
        <button type="button" className="btn small" onClick={() => pick("all")}>
          Allow all
        </button>
        <button type="button" className="btn secondary small" onClick={() => pick("essential")}>
          Essential only
        </button>
      </p>
    </div>
  );
}

export function PrivacyChoices() {
  const [choice, setChoice] = useState<Choice | null>(null);
  const [gpc, setGpc] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setChoice(readChoice() ?? "essential");
    setGpc(gpcOn());
  }, []);
  if (!choice) return null;
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        saveChoice(choice);
        setSaved(true);
      }}
    >
      <label className="check">
        <input type="checkbox" checked disabled /> Essential cookies: keep you logged in and remember this choice. Always on.
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={choice === "all" && !gpc}
          disabled={gpc}
          onChange={(e) => {
            setChoice(e.target.checked ? "all" : "essential");
            setSaved(false);
          }}
        />{" "}
        Ads and measurement cookies. We don&rsquo;t use any yet; this is your answer for when we do.
      </label>
      {gpc && (
        <p className="notice small">
          Your browser sends a Global Privacy Control signal, so we treat you as opted out of ads cookies and any sale
          or sharing of your data.
        </p>
      )}
      {saved && <p className="muted small" role="status">Saved on this browser.</p>}
      <p>
        <button className="btn secondary">Save</button>
      </p>
    </form>
  );
}
