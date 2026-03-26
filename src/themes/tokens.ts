/**
 * MailFrame Theme Token System
 *
 * Themes define these tokens. The app applies them as CSS custom properties
 * on the root element. All component styles reference var(--mf-*) variables
 * so swapping a theme requires no component changes.
 */

export type ThemeTokens = {
  // Identity
  id: string;
  label: string;
  description?: string;
  family: "lumen" | "aurora" | string;

  // Color — surface
  colorBg: string;
  colorSurface: string;
  colorSurfaceAlt: string;
  colorBorder: string;

  // Color — text
  colorText: string;
  colorTextMuted: string;
  colorTextInverse: string;

  // Color — accent
  colorAccent: string;
  colorAccentHover: string;
  colorAccentText: string;

  // Color — state
  colorUnread: string;
  colorSelected: string;
  colorHover: string;

  // Shape
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;

  // Typography
  fontBase: string;
  fontMono: string;
  fontSizeBase: string;
  fontSizeSm: string;
  fontSizeLg: string;
  fontWeightNormal: string;
  fontWeightMedium: string;
  fontWeightBold: string;

  // Layout
  sidebarWidth: string;
  listWidth: string;
};

export function applyTheme(tokens: ThemeTokens): void {
  const root = document.documentElement;
  root.setAttribute("data-theme", tokens.id);
  root.style.setProperty("--mf-color-bg", tokens.colorBg);
  root.style.setProperty("--mf-color-surface", tokens.colorSurface);
  root.style.setProperty("--mf-color-surface-alt", tokens.colorSurfaceAlt);
  root.style.setProperty("--mf-color-border", tokens.colorBorder);
  root.style.setProperty("--mf-color-text", tokens.colorText);
  root.style.setProperty("--mf-color-text-muted", tokens.colorTextMuted);
  root.style.setProperty("--mf-color-text-inverse", tokens.colorTextInverse);
  root.style.setProperty("--mf-color-accent", tokens.colorAccent);
  root.style.setProperty("--mf-color-accent-hover", tokens.colorAccentHover);
  root.style.setProperty("--mf-color-accent-text", tokens.colorAccentText);
  root.style.setProperty("--mf-color-unread", tokens.colorUnread);
  root.style.setProperty("--mf-color-selected", tokens.colorSelected);
  root.style.setProperty("--mf-color-hover", tokens.colorHover);
  root.style.setProperty("--mf-radius-sm", tokens.radiusSm);
  root.style.setProperty("--mf-radius-md", tokens.radiusMd);
  root.style.setProperty("--mf-radius-lg", tokens.radiusLg);
  root.style.setProperty("--mf-font-base", tokens.fontBase);
  root.style.setProperty("--mf-font-mono", tokens.fontMono);
  root.style.setProperty("--mf-font-size-base", tokens.fontSizeBase);
  root.style.setProperty("--mf-font-size-sm", tokens.fontSizeSm);
  root.style.setProperty("--mf-font-size-lg", tokens.fontSizeLg);
  root.style.setProperty("--mf-font-weight-normal", tokens.fontWeightNormal);
  root.style.setProperty("--mf-font-weight-medium", tokens.fontWeightMedium);
  root.style.setProperty("--mf-font-weight-bold", tokens.fontWeightBold);
  root.style.setProperty("--mf-sidebar-width", tokens.sidebarWidth);
  root.style.setProperty("--mf-list-width", tokens.listWidth);
}
