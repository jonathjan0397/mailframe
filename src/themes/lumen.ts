/**
 * Lumen — clean, bright, minimal.
 * Inspired by modern productivity webmail aesthetics.
 * White surfaces, clear hierarchy, blue accent.
 */
import type { ThemeTokens } from "./tokens";

export const lumenTheme: ThemeTokens = {
  id: "lumen",
  label: "Lumen",
  description: "Clean, bright, minimal. White surfaces with a blue accent.",
  family: "lumen",

  colorBg: "#f1f3f4",
  colorSurface: "#ffffff",
  colorSurfaceAlt: "#f8f9fa",
  colorBorder: "#e0e0e0",

  colorText: "#202124",
  colorTextMuted: "#5f6368",
  colorTextInverse: "#ffffff",

  colorAccent: "#1a73e8",
  colorAccentHover: "#1557b0",
  colorAccentText: "#ffffff",

  colorUnread: "#1a73e8",
  colorSelected: "#e8f0fe",
  colorHover: "#f1f3f4",

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
