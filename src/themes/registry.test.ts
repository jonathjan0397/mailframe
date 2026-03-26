import { describe, it, expect } from "vitest";
import { themeRegistry } from "./registry";

describe("themeRegistry", () => {
  it("contains at least two themes", () => {
    expect(themeRegistry.length).toBeGreaterThanOrEqual(2);
  });

  it("contains lumen and aurora themes", () => {
    const ids = themeRegistry.map((t) => t.id);
    expect(ids).toContain("lumen");
    expect(ids).toContain("aurora");
  });

  it("all theme ids are unique", () => {
    const ids = themeRegistry.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all themes have required color tokens", () => {
    for (const theme of themeRegistry) {
      expect(theme.colorAccent, `${theme.id}.colorAccent`).toBeTruthy();
      expect(theme.colorBg, `${theme.id}.colorBg`).toBeTruthy();
      expect(theme.colorSurface, `${theme.id}.colorSurface`).toBeTruthy();
      expect(theme.colorText, `${theme.id}.colorText`).toBeTruthy();
      expect(theme.colorBorder, `${theme.id}.colorBorder`).toBeTruthy();
    }
  });

  it("all themes have required typography tokens", () => {
    for (const theme of themeRegistry) {
      expect(theme.fontBase, `${theme.id}.fontBase`).toBeTruthy();
      expect(theme.fontSizeBase, `${theme.id}.fontSizeBase`).toBeTruthy();
    }
  });

  it("all themes have required layout tokens", () => {
    for (const theme of themeRegistry) {
      expect(theme.sidebarWidth, `${theme.id}.sidebarWidth`).toBeTruthy();
      expect(theme.listWidth, `${theme.id}.listWidth`).toBeTruthy();
    }
  });
});
