"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import type { VoteValue } from "@midbig/shared";
import { castVote } from "@/app/forum-actions";
import type { ForumMe } from "@/lib/types";

/** Up and down arrows with the net score. Votes show at once and roll back if the server says no. */
export function VoteButtons({
  postId,
  score,
  myVote,
  me,
  mine,
  compact = false,
}: {
  postId: string;
  score: number;
  myVote: VoteValue;
  me: ForumMe | null;
  mine: boolean;
  compact?: boolean;
}) {
  const path = usePathname();
  const [vote, setVote] = useState<VoteValue>(myVote);
  const [shown, setShown] = useState(score);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  const click = (dir: 1 | -1) => {
    setNote("");
    if (!me) return setNote("login");
    if (mine) return setNote("Your own post.");
    const block = dir === 1 ? me.voteBlock : me.downBlock;
    if (block) return setNote(block);
    const next: VoteValue = vote === dir ? 0 : dir;
    const before = vote;
    setVote(next);
    setShown((s) => s - before + next);
    start(async () => {
      const r = await castVote(postId, next);
      if (!r.ok) {
        setVote(before);
        setShown((s) => s - next + before);
        setNote(r.error);
      }
    });
  };

  return (
    <div className={`votes${compact ? " compact" : ""}`}>
      <button
        type="button"
        className={`vote up${vote === 1 ? " on" : ""}`}
        aria-label="Upvote"
        aria-pressed={vote === 1}
        disabled={pending}
        onClick={() => click(1)}
      >
        ▲
      </button>
      <span className={`score${shown > 0 ? " pos" : shown < 0 ? " neg" : ""}`} aria-label={`Score ${shown}`}>
        {shown}
      </span>
      <button
        type="button"
        className={`vote down${vote === -1 ? " on" : ""}`}
        aria-label="Downvote"
        aria-pressed={vote === -1}
        disabled={pending}
        onClick={() => click(-1)}
      >
        ▼
      </button>
      {note && (
        <span className="vote-note small" role="status">
          {note === "login" ? <Link href={`/login?next=${encodeURIComponent(path)}`}>Log in to vote</Link> : note}
        </span>
      )}
    </div>
  );
}
