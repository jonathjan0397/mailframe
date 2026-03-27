/**
 * Theme registry — single source of truth for all available themes.
 * To add a new theme: create src/themes/mytheme.ts and append it here.
 * The app resolves the active theme by id from this array.
 */
import { lumenTheme } from "./lumen";
import { eclipseTheme } from "./eclipse";
import { auroraTheme } from "./aurora";
import { midnightTheme } from "./midnight";
import { cardinalTheme } from "./cardinal";
import type { ThemeTokens } from "./tokens";

export const themeRegistry: ThemeTokens[] = [
  lumenTheme,
  eclipseTheme,
  auroraTheme,
  midnightTheme,
  cardinalTheme,
];
