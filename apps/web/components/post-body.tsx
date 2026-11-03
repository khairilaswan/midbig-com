import Link from "next/link";
import { Fragment } from "react";
import { profilePath, splitBlocks, splitInline, splitMentions, tickerPath } from "@midbig/shared";

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

/** **bold**, *italic*, `code`, ~~strike~~ and ||spoilers|| inside a line, with links and tags in the plain parts. */
function Formatted({ text }: { text: string }) {
  return (
    <>
      {splitInline(text).map((p, i) =>
        p.kind === "plain" ? (
          <Body key={i} text={p.text} />
        ) : p.kind === "bold" ? (
          <strong key={i}>
            <Body text={p.text} />
          </strong>
        ) : p.kind === "italic" ? (
          <em key={i}>
            <Body text={p.text} />
          </em>
        ) : p.kind === "strike" ? (
          <s key={i}>
            <Body text={p.text} />
          </s>
        ) : p.kind === "code" ? (
          <code key={i}>{p.text}</code>
        ) : (
          <span key={i} className="spoiler" tabIndex={0} title="Spoiler: tap to show">
            <Body text={p.text} />
          </span>
        ),
      )}
    </>
  );
}

/** A forum post: paragraphs on blank lines, line breaks kept, "> " lines as quotes. */
export function PostText({ text }: { text: string }) {
  return (
    <div className="post-text">
      {splitBlocks(text).map((b, i) =>
        b.kind === "quote" ? (
          <blockquote key={i}>
            <Formatted text={b.text} />
          </blockquote>
        ) : (
          <p key={i}>
            <Formatted text={b.text} />
          </p>
        ),
      )}
    </div>
  );
}
