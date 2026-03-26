/**
 * Midnight — dark, immersive, expressive.
 * Rich deep-purple dark mode with a vibrant lilac accent.
 * Pairs visually with Aurora (same family, opposite luminosity).
 */
import type { ThemeTokens } from "./tokens";

export const midnightTheme: ThemeTokens = {
  id: "midnight",
  label: "Midnight",
  description: "Dark, immersive, expressive. Deep purples with a vibrant lilac accent.",
  family: "aurora",

  colorBg: "#0f0d17",
  colorSurface: "#1a1726",
  colorSurfaceAlt: "#151220",
  colorBorder: "#2d2740",

  colorText: "#e4deff",
  colorTextMuted: "#9c88cc",
  colorTextInverse: "#0f0d17",

  colorAccent: "#bb86fc",
  colorAccentHover: "#d0a8ff",
  colorAccentText: "#0f0d17",

  colorUnread: "#bb86fc",
  colorSelected: "#2a1f4e",
  colorHover: "#221d32",

  radiusSm: "6px",
  radiusMd: "12px",
  radiusLg: "20px",

  fontBase: "'Yahoo Sans', 'Helvetica Neue', system-ui, sans-serif",
  fontMono: "monospace",
  fontSizeBase: "14px",
  fontSizeSm: "12px",
  fontSizeLg: "16px",
  fontWeightNormal: "400",
  fontWeightMedium: "500",
  fontWeightBold: "700",

  sidebarWidth: "240px",
  listWidth: "360px",
};
