import { describe, expect, it } from "vitest";
import { signString, signToken, verifyString, verifyToken } from "./signed-token";

const SECRET = "test-secret-0123456789abcdef0123456789";

describe("signed tokens", () => {
  it("round-trips the payload", () => {
    const token = signToken({ key: "song-bank/x/a.mp3", exp: 123 }, SECRET);
    expect(verifyToken(token, SECRET)).toEqual({ key: "song-bank/x/a.mp3", exp: 123 });
  });

  it("rejects a changed payload, another secret and junk", () => {
    const token = signToken({ userId: "a" }, SECRET);
    const [, signature] = token.split(".");
    const forged = `${Buffer.from(JSON.stringify({ userId: "b" })).toString("base64url")}.${signature}`;
    expect(verifyToken(forged, SECRET)).toBeNull();
    expect(verifyToken(token, `${SECRET}-other`)).toBeNull();
    expect(verifyToken("not-a-token", SECRET)).toBeNull();
    expect(verifyToken(`${token}.extra`, SECRET)).toBeNull();
  });

  it("signs and checks plain strings", () => {
    const signature = signString("get:key:100", SECRET);
    expect(verifyString("get:key:100", signature, SECRET)).toBe(true);
    expect(verifyString("put:key:100", signature, SECRET)).toBe(false);
    expect(verifyString("get:key:100", "short", SECRET)).toBe(false);
  });
});
