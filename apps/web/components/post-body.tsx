import Link from "next/link";
import { Fragment } from "react";
import { profilePath, splitMentions, tickerPath } from "@midbig/shared";

/**
 * Member text with http(s) links made clickable (never followed by search
 * engines), $TICKER tags linked to their community and @names to profiles.
 */
export function Body({ text }: { text: string }) {
  return (
    <>
      {splitMentions(text).map((p, i) =>
        p.kind === "link" ? (
          <a key={i} href={p.url} target="_blank" rel="nofollow ugc noopener noreferrer">
            {p.url}
          </a>
        ) : p.kind === "ticker" ? (
          <Link key={i} href={tickerPath(p.symbol)} className="ticker-tag" prefetch={false}>
            {p.text}
          </Link>
        ) : p.kind === "user" ? (
          <Link key={i} href={profilePath(p.name)} className="mention" prefetch={false}>
            {p.text}
          </Link>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </>
  );
}

/** A forum post: paragraphs on blank lines, line breaks kept. */
export function PostText({ text }: { text: string }) {
  return (
    <div className="post-text">
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i}>
          <Body text={para} />
        </p>
      ))}
    </div>
  );
}
