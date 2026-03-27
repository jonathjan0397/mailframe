/**
 * Cardinal — crisp white canvas, bold cardinal accent.
 *
 * A clean, productivity-first theme inspired by the clarity of modern
 * webmail. White surfaces, cool blue-gray background wash, and a
 * confident cardinal-red accent that makes actions unmistakable.
 *
 * The cardinal bird: sharp, vivid, always the first thing you notice.
 */
import type { ThemeTokens } from "./tokens";

export const cardinalTheme: ThemeTokens = {
  id: "cardinal",
  label: "Cardinal",
  description: "Crisp white canvas with a bold cardinal-red accent.",
  family: "cardinal",

  // Background wash — a cool blue-gray that recedes behind white panels
  colorBg:         "#f0f4f9",
  colorSurface:    "#ffffff",
  colorSurfaceAlt: "#f8fafd",
  colorBorder:     "#dadce0",

  // Text — near-black for maximum readability, warm gray for secondary
  colorText:        "#1f2328",
  colorTextMuted:   "#606770",
  colorTextInverse: "#ffffff",

  // Cardinal red — the signature accent
  // Distinct from any brand palette: a deep, saturated bird-wing red
  colorAccent:      "#c5221f",
  colorAccentHover: "#a01a18",
  colorAccentText:  "#ffffff",

  // State colors — warm red tint for selected rows (vs blue in Lumen)
  colorUnread:   "#c5221f",
  colorSelected: "#fde8e7",
  colorHover:    "#f0f4f9",

  // Shape — slightly more generous rounding than Lumen for a softer feel
  radiusSm: "6px",
  radiusMd: "10px",
  radiusLg: "20px",

  // Typography — Inter as the clean neutral sans-serif anchor
  // Falls back gracefully through common system fonts
  fontBase: "'Inter', 'Segoe UI', 'Helvetica Neue', system-ui, sans-serif",
  fontMono: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
  fontSizeBase: "14px",
  fontSizeSm:   "12px",
  fontSizeLg:   "16px",
  fontWeightNormal: "400",
  fontWeightMedium: "500",
  fontWeightBold:   "600",

  // Layout — slightly wider sidebar and list pane for comfortable scanning
  sidebarWidth: "240px",
  listWidth:    "400px",
};
