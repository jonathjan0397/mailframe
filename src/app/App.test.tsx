import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "./App";

// applyTheme uses CSS custom properties — mock it to keep tests DOM-clean
vi.mock("../themes/tokens", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../themes/tokens")>();
  return { ...mod, applyTheme: vi.fn() };
});

describe("App", () => {
  it("renders the MailFrame logo", () => {
    render(<App />);
    expect(screen.getByText("MailFrame")).toBeDefined();
  });

  it("renders the compose button", () => {
    render(<App />);
    expect(screen.getByText("+ Compose")).toBeDefined();
  });

  it("renders the settings button", () => {
    render(<App />);
    expect(screen.getByLabelText("Open settings")).toBeDefined();
  });

  it("renders the empty reading pane message initially", () => {
    render(<App />);
    expect(screen.getByText("Select a message to read")).toBeDefined();
  });

  it("renders the search input", () => {
    render(<App />);
    expect(screen.getByPlaceholderText("Search mail")).toBeDefined();
  });
});
