"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setWatched } from "@/app/actions";
import { SearchBox } from "./search-box";

export function WatchlistAdd() {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <div className="watchlist-add">
      <SearchBox
        placeholder="Add a coin, stock or forex pair"
        onPick={async (r) => {
          const res = await setWatched(r.id, true);
          setError(res.ok ? "" : res.error);
          router.refresh();
        }}
      />
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
