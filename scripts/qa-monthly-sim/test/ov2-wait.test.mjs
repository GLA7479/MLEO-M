import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { urlHasRoomQuery } from "../lib/ov2PageWait.mjs";

describe("OV2 CSP-safe URL wait helpers", () => {
  it("detects room= in query string", () => {
    assert.equal(urlHasRoomQuery("https://example.com/online-v2/rooms?room=abc"), true);
    assert.equal(urlHasRoomQuery("https://example.com/online-v2/rooms"), false);
    assert.equal(urlHasRoomQuery("https://example.com/online-v2/rooms?foo=1"), false);
  });
});
