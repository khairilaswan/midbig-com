"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  lookVars,
  normalizeLook,
  STYLE_IDS,
  TEMPLATE_IDS,
  TEMPLATES,
  THEME_STYLES,
  type Look,
  type TemplateId,
  type ThemeMode,
} from "@midbig/shared";
import type { ActionResult } from "@/app/actions";

const MODE_LABELS: Record<ThemeMode, string> = { auto: "Match my device", light: "Light", dark: "Dark" };

/** Puts a look on the page right away, before it's saved, so people can try before they keep it. */
function applyLook(l: Look) {
  const root = document.documentElement;
  root.dataset.style = l.style;
  root.dataset.mode = l.mode;
  root.dataset.template = l.template;
  for (const [k, v] of Object.entries(lookVars(l))) root.style.setProperty(k, v);
}

/** A tiny wireframe of each template's home page. */
function TemplateSketch({ id }: { id: TemplateId }) {
  return (
    <span className={`tpl-sketch tpl-${id}`} aria-hidden>
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

export function LookPicker({
  current,
  siteDefault,
  save,
  reset,
  saveLabel = "Save my look",
  extra,
}: {
  current: Look;
  siteDefault: Look;
  save: (l: Look) => Promise<ActionResult>;
  /** Going back to the site's default, for members. */
  reset?: () => Promise<ActionResult>;
  saveLabel?: string;
  /** More fields saved with the look (the admin's member-choice switch). */
  extra?: React.ReactNode;
}) {
  const router = useRouter();
  const [look, setLook] = useState(current);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const saved = useRef(current);

  useEffect(() => applyLook(look), [look]);
  // Leaving without saving puts the saved look back.
  useEffect(() => () => applyLook(saved.current), []);

  const pick = (part: Partial<Look>) => {
    setMsg("");
    setLook((l) => normalizeLook({ ...l, ...part }, l));
  };
  const style = THEME_STYLES[look.style];
  const dirty = JSON.stringify(look) !== JSON.stringify(saved.current);

  return (
    <div className="look-picker">
      <section>
        <h2>Theme style</h2>
        <ul className="look-grid styles">
          {STYLE_IDS.map((id) => {
            const s = THEME_STYLES[id];
            const vars = lookVars({ style: id, color: s.colors[0]!.id });
            return (
              <li key={id}>
                <button
                  type="button"
                  className={`look-card style-card${look.style === id ? " on" : ""}`}
                  aria-pressed={look.style === id}
                  onClick={() => pick({ style: id, color: id === look.style ? look.color : s.colors[0]!.id })}
                >
                  <span className={`style-swatch sw-${id}`} style={vars as React.CSSProperties} aria-hidden>
                    <b />
                    <b />
                    <b />
                  </span>
                  <strong>{s.name}</strong>
                  <span className="muted small">{s.blurb}</span>
                  <span className="muted small">
                    {s.colors.length} {s.colors.length === 1 ? "color" : "colors"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2>{style.name} colors</h2>
        <ul className="swatches" role="radiogroup" aria-label="Main color">
          {style.colors.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                role="radio"
                aria-checked={look.color === c.id}
                className={`swatch${look.color === c.id ? " on" : ""}`}
                onClick={() => pick({ color: c.id })}
                title={c.name}
              >
                <span
                  className="swatch-dot"
                  style={{ background: c.accent === c.accent2 ? c.accent : `linear-gradient(135deg, ${c.accent} 50%, ${c.accent2} 50%)` }}
                />
                <span className="small">{c.name}</span>
              </button>
            </li>
          ))}
        </ul>
        {style.modes.length > 1 ? (
          <div className="seg mode-pick" role="radiogroup" aria-label="Light or dark">
            {style.modes.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={look.mode === m} className={look.mode === m ? "on" : ""} onClick={() => pick({ mode: m })}>
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>
        ) : (
          <p className="muted small">{style.name} is {style.modes[0] === "dark" ? "always dark" : "always light"}.</p>
        )}
      </section>

      <section>
        <h2>Home page template</h2>
        <ul className="look-grid templates">
          {TEMPLATE_IDS.map((id) => (
            <li key={id}>
              <button
                type="button"
                className={`look-card tpl-card${look.template === id ? " on" : ""}`}
                aria-pressed={look.template === id}
                onClick={() => pick({ template: id })}
              >
                <TemplateSketch id={id} />
                <strong>{TEMPLATES[id].name}</strong>
                <span className="muted small">{TEMPLATES[id].blurb}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {extra}

      <div className="look-bar">
        <span className="small">
          <strong>{style.name}</strong> · {style.colors.find((c) => c.id === look.color)?.name} · {MODE_LABELS[look.mode]} ·{" "}
          {TEMPLATES[look.template].name}
          {dirty && <span className="muted"> (previewing, not saved)</span>}
        </span>
        <span className="row-gap">
          {reset && (
            <button
              type="button"
              className="btn secondary small"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = await reset();
                setBusy(false);
                if (!r.ok) return setMsg(r.error);
                saved.current = siteDefault;
                setLook(siteDefault);
                setMsg("Back to the site's look.");
                router.refresh();
              }}
            >
              Use the site&rsquo;s look
            </button>
          )}
          <button
            type="button"
            className="btn small"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await save(look);
              setBusy(false);
              if (!r.ok) return setMsg(r.error);
              saved.current = look;
              setMsg("Saved.");
              router.refresh();
            }}
          >
            {busy ? "Saving…" : saveLabel}
          </button>
        </span>
        {msg && (
          <span className="small" role="status">
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}
