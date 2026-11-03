"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { HoverCard } from "@/lib/cards";
import { Avatar } from "./avatar";

const SHOW_DELAY = 350;
const HIDE_DELAY = 150;
const BADGES = { admin: "Admin", mod: "Mod", bot: "Bot" } as const;

/** A member link is /u/<name>; a community link is /b/<slug> or /m/<slug>, with nothing after it. */
function targetOf(a: HTMLAnchorElement): string | null {
  if (a.closest("[data-no-card], .hovercard, .site-header, .tabs")) return null;
  let url: URL;
  try {
    url = new URL(a.href);
  } catch {
    return null;
  }
  if (url.origin !== location.origin || url.search) return null;
  const user = /^\/u\/([^/]+)$/.exec(url.pathname);
  if (user) return `u=${user[1]}`;
  const community = /^\/([bm]\/[A-Za-z0-9-]+)$/.exec(url.pathname);
  if (community) return `c=${encodeURIComponent(community[1]!)}`;
  return null;
}

const cache = new Map<string, Promise<HoverCard | null>>();

function load(key: string): Promise<HoverCard | null> {
  let p = cache.get(key);
  if (!p) {
    p = fetch(`/api/card?${key}`)
      .then((r) => (r.ok ? (r.json() as Promise<HoverCard>) : null))
      .catch(() => null);
    cache.set(key, p);
  }
  return p;
}

interface Shown {
  card: HoverCard;
  top: number;
  left: number;
}

/**
 * Hovering a member's name or a community's name anywhere on the site shows a
 * small card with the basics. It leaves when the pointer leaves the link and
 * the card. Touch screens skip it: a tap just follows the link.
 */
export function HoverCards() {
  const [shown, setShown] = useState<Shown | null>(null);
  const anchor = useRef<HTMLAnchorElement | null>(null);
  const showTimer = useRef<number>(0);
  const hideTimer = useRef<number>(0);

  useEffect(() => {
    if (!window.matchMedia("(hover: hover)").matches) return;

    const hide = () => {
      window.clearTimeout(showTimer.current);
      window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => {
        anchor.current = null;
        setShown(null);
      }, HIDE_DELAY);
    };

    const over = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (el?.closest(".hovercard")) {
        window.clearTimeout(hideTimer.current);
        return;
      }
      const a = el?.closest("a");
      if (!a || a === anchor.current) {
        if (a) window.clearTimeout(hideTimer.current);
        return;
      }
      const key = targetOf(a);
      if (!key) return;
      anchor.current = a;
      window.clearTimeout(showTimer.current);
      window.clearTimeout(hideTimer.current);
      showTimer.current = window.setTimeout(async () => {
        const card = await load(key);
        if (!card || anchor.current !== a || !a.isConnected) return;
        const r = a.getBoundingClientRect();
        const width = 300;
        const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
        // Below the link, or above it when there's no room below.
        const below = r.bottom + 6;
        const top = below + 180 > window.innerHeight && r.top > 200 ? r.top - 6 : below;
        setShown({ card, top, left: left });
      }, SHOW_DELAY);
    };

    const out = (e: MouseEvent) => {
      const from = e.target instanceof Element ? e.target : null;
      const to = e.relatedTarget instanceof Element ? e.relatedTarget : null;
      const leftCard = from?.closest(".hovercard") && !to?.closest(".hovercard");
      const leftLink = anchor.current && from && anchor.current.contains(from) && !(to && anchor.current.contains(to));
      if (leftCard || leftLink) hide();
    };

    const close = () => {
      window.clearTimeout(showTimer.current);
      anchor.current = null;
      setShown(null);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();

    document.addEventListener("mouseover", over);
    document.addEventListener("mouseout", out);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", close, { passive: true });
    return () => {
      document.removeEventListener("mouseover", over);
      document.removeEventListener("mouseout", out);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", close);
      window.clearTimeout(showTimer.current);
      window.clearTimeout(hideTimer.current);
    };
  }, []);

  if (!shown) return null;
  const { card } = shown;
  const above = anchor.current ? shown.top < anchor.current.getBoundingClientRect().top : false;
  const style: React.CSSProperties = above
    ? { left: shown.left, bottom: window.innerHeight - shown.top }
    : { left: shown.left, top: shown.top };

  return (
    <div className="hovercard" role="tooltip" style={style}>
      {card.kind === "user" ? (
        <>
          <div className="hovercard-head">
            <Avatar name={card.name} src={card.avatar} size={44} />
            <div>
              <Link href={card.path} className="hovercard-name">
                {card.name}
              </Link>
              {card.verified && card.badge !== "bot" && (
                <span className="verified" title="Verified member">
                  {" "}
                  ✓
                </span>
              )}
              {card.badge && <span className="badge staff-badge"> {BADGES[card.badge]}</span>}
              <div className="muted small">{card.badge === "bot" ? "Bot" : card.level}</div>
            </div>
          </div>
          {card.bio && <p className="hovercard-text">{card.bio}</p>}
          <dl className="hovercard-stats">
            <div>
              <dt>Reputation</dt>
              <dd>{card.reputation.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>Posts</dt>
              <dd>{card.posts.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>Joined</dt>
              <dd>{new Date(card.joined).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</dd>
            </div>
          </dl>
        </>
      ) : (
        <>
          <div className="hovercard-head">
            {card.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={card.image} alt="" width={44} height={44} className="hovercard-img" />
            ) : (
              <Avatar name={card.title} src={null} size={44} />
            )}
            <div>
              <Link href={card.path} className="hovercard-name">
                {card.label}
              </Link>
              <div className="muted small">{card.title}</div>
            </div>
          </div>
          {card.description && <p className="hovercard-text">{card.description}</p>}
          <dl className="hovercard-stats">
            <div>
              <dt>Members</dt>
              <dd>{card.members.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>Posts</dt>
              <dd>{card.posts.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{card.asset ? "Asset" : "Member-made"}</dd>
            </div>
          </dl>
        </>
      )}
    </div>
  );
}
