/**
 * Eclipse — dark, neutral, focused.
 * High-contrast dark mode with a soft blue accent.
 * Pairs visually with Lumen (same family, opposite luminosity).
 */
import type { ThemeTokens } from "./tokens";

export const eclipseTheme: ThemeTokens = {
  id: "eclipse",
  label: "Eclipse",
  description: "Dark, neutral, focused. High contrast with a soft blue accent.",
  family: "lumen",

  colorBg: "#1c1e21",
  colorSurface: "#27282c",
  colorSurfaceAlt: "#202224",
  colorBorder: "#3c3f42",

  colorText: "#e8eaed",
  colorTextMuted: "#9aa0a6",
  colorTextInverse: "#1c1e21",

  colorAccent: "#8ab4f8",
  colorAccentHover: "#aecbfa",
  colorAccentText: "#1c1e21",

  colorUnread: "#8ab4f8",
  colorSelected: "#283141",
  colorHover: "#35373a",

  radiusSm: "4px",
  radiusMd: "8px",
  radiusLg: "16px",

  fontBase: "'Google Sans', 'Roboto', system-ui, sans-serif",
  fontMono: "'Roboto Mono', monospace",
  fontSizeBase: "14px",
  fontSizeSm: "12px",
  fontSizeLg: "16px",
  fontWeightNormal: "400",
  fontWeightMedium: "500",
  fontWeightBold: "700",

  sidebarWidth: "220px",
  listWidth: "380px",
};
