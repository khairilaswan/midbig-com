/**
 * Looks: the theme style, its main color, light or dark mode, and the page
 * template. The admin picks the site's default look; members (and visitors,
 * by cookie) can pick their own in Appearance settings. The CSS for each
 * style lives in apps/web/app/themes.css and keys off data attributes on
 * <html>; the colors here become CSS variables.
 */

export type ThemeStyle = "classic" | "glass" | "brutal" | "minimal" | "swiss" | "darkmin";
export type ThemeMode = "auto" | "light" | "dark";
export type TemplateId = "markets" | "hub" | "dashboard" | "feed" | "terminal";

export interface ThemeColor {
  id: string;
  name: string;
  /** The main color: buttons, links, highlights. */
  accent: string;
  /** A second color for gradients and combinations; the accent again when there's none. */
  accent2: string;
}

export interface ThemeStyleInfo {
  id: ThemeStyle;
  name: string;
  blurb: string;
  /** Modes a member can pick; the first is the default. */
  modes: ThemeMode[];
  colors: ThemeColor[];
}

function c(id: string, name: string, accent: string, accent2 = accent): ThemeColor {
  return { id, name, accent, accent2 };
}

export const THEME_STYLES: Record<ThemeStyle, ThemeStyleInfo> = {
  classic: {
    id: "classic",
    name: "midbig Classic",
    blurb: "The original look: clean, quick and familiar.",
    modes: ["auto", "light", "dark"],
    colors: [c("blue", "Blue", "#2f6fed")],
  },
  glass: {
    id: "glass",
    name: "Glassmorphism",
    blurb: "Frosted, see-through panels floating over a soft color glow.",
    modes: ["auto", "light", "dark"],
    colors: [
      c("red", "Red", "#ef4444"),
      c("blue", "Blue", "#3b82f6"),
      c("green", "Green", "#22c55e"),
      c("orange", "Orange", "#f97316"),
      c("black", "Black", "#1f2937", "#6b7280"),
      c("pink", "Pink", "#ec4899"),
      c("sunset", "Sunset (orange + pink)", "#f97316", "#ec4899"),
      c("ocean", "Ocean (blue + cyan)", "#2563eb", "#06b6d4"),
      c("aurora", "Aurora (green + purple)", "#10b981", "#8b5cf6"),
      c("twilight", "Twilight (purple + blue)", "#8b5cf6", "#3b82f6"),
    ],
  },
  brutal: {
    id: "brutal",
    name: "Neo-brutalism",
    blurb: "Thick black outlines, hard shadows and loud flat color.",
    modes: ["light"],
    colors: [
      c("lemon", "Lemon", "#ffe14d"),
      c("pink", "Bubblegum", "#ff6fb5"),
      c("lime", "Lime", "#b8ff5c"),
      c("sky", "Sky", "#5cc8ff"),
      c("orange", "Tangerine", "#ff8a3d"),
      c("violet", "Violet", "#a78bfa"),
      c("mint", "Mint", "#5eead4"),
      c("red", "Tomato", "#ff5a5a"),
      c("blue", "Royal", "#4d7cff"),
      c("sand", "Sand", "#f2d398"),
    ],
  },
  minimal: {
    id: "minimal",
    name: "Minimalism",
    blurb: "Lots of white space, hairline borders and one quiet accent.",
    modes: ["light", "auto", "dark"],
    colors: [
      c("ink", "Ink", "#111827"),
      c("slate", "Slate", "#475569"),
      c("blue", "Blue", "#2563eb"),
      c("teal", "Teal", "#0d9488"),
      c("green", "Sage", "#4d7c0f"),
      c("amber", "Amber", "#b45309"),
      c("rust", "Rust", "#c2410c"),
      c("rose", "Rose", "#e11d48"),
      c("plum", "Plum", "#7e22ce"),
      c("indigo", "Indigo", "#4f46e5"),
    ],
  },
  swiss: {
    id: "swiss",
    name: "Swiss style",
    blurb: "Strict grid, bold sans-serif type, flat blocks and strong rules.",
    modes: ["light", "auto", "dark"],
    colors: [
      c("red", "Swiss red", "#e30613"),
      c("black", "Black", "#111111"),
      c("cobalt", "Cobalt", "#0047bb"),
      c("yellow", "Signal yellow", "#ffcc00"),
      c("green", "Green", "#008c45"),
      c("orange", "Orange", "#ff6b00"),
      c("ultramarine", "Ultramarine", "#3f00ff"),
      c("magenta", "Magenta", "#d6007e"),
      c("teal", "Teal", "#00857c"),
      c("brown", "Umber", "#7a4b2a"),
    ],
  },
  darkmin: {
    id: "darkmin",
    name: "Dark Minimalism",
    blurb: "Near-black, calm and low-glare, with a single glowing accent.",
    modes: ["dark"],
    colors: [
      c("emerald", "Emerald", "#34d399"),
      c("cyan", "Cyan", "#22d3ee"),
      c("violet", "Violet", "#a78bfa"),
      c("amber", "Amber", "#fbbf24"),
      c("rose", "Rose", "#fb7185"),
      c("lime", "Lime", "#a3e635"),
      c("sky", "Sky", "#38bdf8"),
      c("orange", "Orange", "#fb923c"),
      c("red", "Red", "#f87171"),
      c("white", "Mono", "#e5e7eb"),
    ],
  },
};

export const STYLE_IDS = Object.keys(THEME_STYLES) as ThemeStyle[];

export interface TemplateInfo {
  id: TemplateId;
  name: string;
  blurb: string;
}

export const TEMPLATES: Record<TemplateId, TemplateInfo> = {
  markets: {
    id: "markets",
    name: "Markets",
    blurb: "Price table first, like a market tracker. Movers on top, communities one click away.",
  },
  hub: {
    id: "hub",
    name: "Community hub",
    blurb: "A forum front page: hot posts in the middle, communities on the left, markets on the right.",
  },
  dashboard: {
    id: "dashboard",
    name: "Dashboard",
    blurb: "Tiles for top assets, movers, trending tickers, hot posts and top members at a glance.",
  },
  feed: {
    id: "feed",
    name: "Social feed",
    blurb: "One column of posts with photos, like a social app, with a live ticker tape on top.",
  },
  terminal: {
    id: "terminal",
    name: "Trader terminal",
    blurb: "Dense two-pane screen: compact prices beside the live discussion, for big monitors.",
  },
};

export const TEMPLATE_IDS = Object.keys(TEMPLATES) as TemplateId[];

export interface Look {
  style: ThemeStyle;
  color: string;
  mode: ThemeMode;
  template: TemplateId;
}

export const DEFAULT_LOOK: Look = { style: "classic", color: "blue", mode: "auto", template: "markets" };

/** Fixes a look so every part is valid together: a known style, one of its colors and modes, a known template. */
export function normalizeLook(raw: Partial<Record<keyof Look, unknown>> | null | undefined, base: Look = DEFAULT_LOOK): Look {
  const style = STYLE_IDS.includes(raw?.style as ThemeStyle) ? (raw!.style as ThemeStyle) : base.style;
  const info = THEME_STYLES[style];
  const fallbackColor = style === base.style ? base.color : info.colors[0]!.id;
  const color = info.colors.some((x) => x.id === raw?.color)
    ? (raw!.color as string)
    : info.colors.some((x) => x.id === fallbackColor)
      ? fallbackColor
      : info.colors[0]!.id;
  const mode = info.modes.includes(raw?.mode as ThemeMode)
    ? (raw!.mode as ThemeMode)
    : info.modes.includes(base.mode)
      ? base.mode
      : info.modes[0]!;
  const template = TEMPLATE_IDS.includes(raw?.template as TemplateId) ? (raw!.template as TemplateId) : base.template;
  return { style, color, mode, template };
}

/** The look as a cookie value: "glass.red.auto.hub". */
export function lookToString(l: Look): string {
  return `${l.style}.${l.color}.${l.mode}.${l.template}`;
}

/** A cookie value back to a look, filling gaps from the base; null when it isn't one. */
export function parseLook(s: string | null | undefined, base: Look = DEFAULT_LOOK): Look | null {
  if (!s || s.length > 60) return null;
  const [style, color, mode, template] = s.split(".");
  if (!STYLE_IDS.includes(style as ThemeStyle)) return null;
  return normalizeLook({ style, color, mode, template }, base);
}

export function themeColor(l: Pick<Look, "style" | "color">): ThemeColor {
  const info = THEME_STYLES[l.style];
  return info.colors.find((x) => x.id === l.color) ?? info.colors[0]!;
}

// ---------------------------------------------------------------------------
// Color math, so any accent stays readable on any background.

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.replace(/./g, (x) => x + x) : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(color: string): number {
  const [r, g, b] = rgb(color).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colors, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Mixes a toward b by t (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return hex([0, 1, 2].map((i) => x[i]! + (y[i]! - x[i]!) * t) as [number, number, number]);
}

/** Black or white, whichever reads better on this color. */
export function onColor(bg: string): string {
  return contrast(bg, "#000000") >= contrast(bg, "#ffffff") ? "#000000" : "#ffffff";
}

/**
 * The color, darkened (on a light background) or lightened (on a dark one)
 * just enough to reach the contrast ratio, for links and text in the accent.
 */
export function readableOn(color: string, bg: string, ratio = 4.5): string {
  if (contrast(color, bg) >= ratio) return color;
  const toward = luminance(bg) > 0.4 ? "#000000" : "#ffffff";
  for (let t = 0.05; t <= 1; t += 0.05) {
    const next = mix(color, toward, t);
    if (contrast(next, bg) >= ratio) return next;
  }
  return toward;
}

/** Backgrounds the accent text is checked against, in each mode. */
const LIGHT_BG = "#ffffff";
const DARK_BG = "#0d1117";

/**
 * The CSS variables a look sets on <html>: the accent pair, the text color on
 * top of them, and accent text tuned for light and dark backgrounds.
 */
export function lookVars(l: Pick<Look, "style" | "color">): Record<string, string> {
  const col = themeColor(l);
  return {
    "--accent-base": col.accent,
    "--accent-2": col.accent2,
    "--on-accent": onColor(col.accent),
    "--accent-ink-light": readableOn(col.accent, l.style === "brutal" ? "#fffdf5" : LIGHT_BG),
    "--accent-ink-dark": readableOn(col.accent, l.style === "darkmin" ? "#0a0a0b" : DARK_BG),
  };
}
