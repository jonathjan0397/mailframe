import { describe, it, expect } from "vitest";
import { encodeMessageId, decodeMessageId } from "./encode.js";

describe("encodeMessageId / decodeMessageId", () => {
  it("round-trips a simple INBOX uid", () => {
    const encoded = encodeMessageId(42, "INBOX");
    expect(decodeMessageId(encoded)).toEqual({ uid: 42, mailbox: "INBOX" });
  });

  it("round-trips a mailbox name with spaces", () => {
    const encoded = encodeMessageId(100, "Sent Items");
    expect(decodeMessageId(encoded)).toEqual({ uid: 100, mailbox: "Sent Items" });
  });

  it("round-trips a hierarchical mailbox path with slashes", () => {
    const encoded = encodeMessageId(7, "INBOX/Work/Projects");
    expect(decodeMessageId(encoded)).toEqual({ uid: 7, mailbox: "INBOX/Work/Projects" });
  });

  it("round-trips a mailbox path with dots", () => {
    const encoded = encodeMessageId(1, "INBOX.Subfolder");
    expect(decodeMessageId(encoded)).toEqual({ uid: 1, mailbox: "INBOX.Subfolder" });
  });

  it("round-trips unicode mailbox names", () => {
    const encoded = encodeMessageId(55, "Écrits");
    expect(decodeMessageId(encoded)).toEqual({ uid: 55, mailbox: "Écrits" });
  });

  it("returns null for a string with no colon separator", () => {
    expect(decodeMessageId("nocolon")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(decodeMessageId("")).toBeNull();
  });

  it("returns null when uid part is not a number", () => {
    expect(decodeMessageId("notanumber:INBOX")).toBeNull();
  });

  it("preserves uid=0 correctly", () => {
    const encoded = encodeMessageId(0, "Trash");
    expect(decodeMessageId(encoded)).toEqual({ uid: 0, mailbox: "Trash" });
  });

  it("preserves large uid values", () => {
    const encoded = encodeMessageId(999999, "Archive");
    expect(decodeMessageId(encoded)).toEqual({ uid: 999999, mailbox: "Archive" });
  });
});
