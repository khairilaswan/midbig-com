"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setWatched } from "@/app/actions";

/**
 * Star that adds a coin to the watchlist. signedIn=false sends people to log
 * in first and brings them back.
 */
export function WatchButton({
  assetId,
  name,
  initial,
  signedIn,
  compact = false,
  refresh = false,
}: {
  assetId: string;
  name: string;
  initial: boolean;
  signedIn: boolean;
  compact?: boolean;
  /** Reload the page's data after a change (the watchlist page drops the row). */
  refresh?: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const label = on ? `Remove ${name} from watchlist` : `Add ${name} to watchlist`;

  return (
    <button
      type="button"
      className={`watch ${on ? "on" : ""} ${compact ? "compact" : "btn secondary small"}`}
      aria-pressed={on}
      aria-label={compact ? label : undefined}
      title={label}
      disabled={pending}
      onClick={() => {
        if (!signedIn) {
          router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
          return;
        }
        const next = !on;
        setOn(next);
        start(async () => {
          const res = await setWatched(assetId, next);
          if (!res.ok) {
            setOn(!next);
            alertLater(res.error);
          } else if (refresh) router.refresh();
        });
      }}
    >
      <span aria-hidden>{on ? "★" : "☆"}</span>
      {!compact && (on ? " Watching" : " Watch")}
    </button>
  );
}

function alertLater(message: string) {
  // A plain message is enough here; it only happens at the watchlist limit.
  setTimeout(() => window.alert(message), 0);
}
