// "Edit as text" on a setting opens its file at that key (spec 005 A5).
import { describe, expect, test } from "bun:test";
import { lineOfKey } from "../../web/src/lib/jsonKey";

const text = `{
  "env": { "model": "x", "note": "sandbox: \\"quoted\\"" },
  "model": "opus",
  "sandbox": {
    "network": {
      "allowedDomains": ["a.com"]
    }
  },
  "network": {}
}`;

describe("lineOfKey", () => {
  test("a top-level key is found at the top level, not inside another object or a value", () => {
    expect(lineOfKey(text, "model")).toBe(3);
    expect(lineOfKey(text, "sandbox")).toBe(4);
    expect(lineOfKey(text, "network")).toBe(9);
  });
  test("a dotted key is found part by part", () => {
    expect(lineOfKey(text, "sandbox.network.allowedDomains")).toBe(6);
  });
  test("a missing key gives undefined", () => {
    expect(lineOfKey(text, "hooks")).toBeUndefined();
    expect(lineOfKey(text, "sandbox.filesystem")).toBeUndefined();
    expect(lineOfKey(text, "env.allowedDomains")).toBeUndefined();
  });
});
