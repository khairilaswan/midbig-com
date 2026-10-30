"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { CoinLogo } from "./market";

export interface SearchResult {
  id: string;
  symbol: string;
  name: string;
  image: string | null;
  rank: number | null;
  /** Latest price (live or delayed), at most a minute old. */
  price: number | null;
}
type Result = SearchResult;

/** Coin search. Opens the coin's page, or calls onPick when given (for forms). */
export function SearchBox({
  onPick,
  placeholder = "Search coins",
  autoFocus,
}: {
  onPick?: (r: SearchResult) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const listId = useId();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then((data: Result[]) => {
          setResults(data);
          setActive(0);
        })
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const go = (r: Result | undefined) => {
    if (!r) return;
    setOpen(false);
    setQ("");
    if (onPick) onPick(r);
    else router.push(`/coins/${r.id}`);
  };

  return (
    <div className={onPick ? "search picker" : "search"} ref={boxRef}>
      <input
        type="search"
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            // Inside a form, Enter picks the coin instead of submitting.
            if (results.length > 0) e.preventDefault();
            go(results[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && results.length > 0 && (
        <ul className="search-results" id={listId} role="listbox">
          {results.map((r, i) => (
            <li
              key={r.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : ""}
              onMouseDown={(e) => {
                e.preventDefault();
                go(r);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <CoinLogo src={r.image} symbol={r.symbol} size={20} />
              <span className="name">{r.name}</span>
              <span className="sym">{r.symbol}</span>
              {r.rank != null && <span className="muted rank">#{r.rank}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
