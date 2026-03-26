/**
 * Aurora — rich, vibrant, expressive.
 * Inspired by portal-style webmail with bold color personality.
 * Deep indigo-to-purple surfaces, high contrast accent.
 */
import type { ThemeTokens } from "./tokens";

export const auroraTheme: ThemeTokens = {
  id: "aurora",
  label: "Aurora",
  description: "Rich, vibrant, expressive. Deep purple tones with bold accents.",
  family: "aurora",

  colorBg: "#f4f0fb",
  colorSurface: "#ffffff",
  colorSurfaceAlt: "#faf7ff",
  colorBorder: "#e1d8f5",

  colorText: "#1b1033",
  colorTextMuted: "#6b5c8a",
  colorTextInverse: "#ffffff",

  colorAccent: "#6001d2",
  colorAccentHover: "#4a01a8",
  colorAccentText: "#ffffff",

  colorUnread: "#6001d2",
  colorSelected: "#ede7f6",
  colorHover: "#f4f0fb",

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
