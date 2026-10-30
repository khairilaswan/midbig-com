import { Fragment } from "react";

/** Member text with http(s) links made clickable (never followed by search engines). */
export function Body({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <a key={i} href={p} target="_blank" rel="nofollow ugc noopener noreferrer">
            {p}
          </a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
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
