/** Initial-letter colors for members without a photo, picked by name so each person keeps theirs. */
const TINTS = ["#2f6fed", "#0a8a4a", "#d1242f", "#b26b00", "#8250df", "#0e7490", "#be185d", "#4d7c0f"];

function tint(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length]!;
}

/** A member's round profile photo, or their initial on a color. */
export function Avatar({ name, src, size = 24 }: { name: string; src: string | null; size?: number }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.45) };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="pfp" src={src} alt="" width={size} height={size} style={style} loading="lazy" decoding="async" />;
  }
  return (
    <span className="pfp pfp-initial" style={{ ...style, background: tint(name) }} aria-hidden>
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
