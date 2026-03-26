/**
 * Theme registry scaffold.
 * Themes register here and the app resolves the active theme by ID.
 * Drop-in themes are auto-discovered from src/themes/dropins/.
 */

export type ThemeTokens = {
  colorAccent: string;
  colorBackground: string;
  colorSurface: string;
  colorText: string;
  colorTextMuted: string;
  colorBorder: string;
  radiusBase: string;
  fontBase: string;
};

export type ThemeDefinition = {
  id: string;
  label: string;
  tokens: ThemeTokens;
};

const registry = new Map<string, ThemeDefinition>();

export function registerTheme(theme: ThemeDefinition): void {
  registry.set(theme.id, theme);
}

export function resolveTheme(id: string): ThemeDefinition | undefined {
  return registry.get(id);
}

export function listThemes(): ThemeDefinition[] {
  return Array.from(registry.values());
}
