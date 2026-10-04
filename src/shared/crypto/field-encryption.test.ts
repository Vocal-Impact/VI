import { describe, expect, it } from "vitest";
import { FieldCipher, isEncrypted, parseEncryptionKey } from "./field-encryption";

const KEY = parseEncryptionKey("dGVzdC1vbmx5LWtleS1kby1ub3QtdXNlLWFueXdoZXI=")!;
const cipher = new FieldCipher(KEY);

/** Shared with scripts/geocode/test_geocode_locations.py — both languages must agree. */
export const KNOWN_VECTOR = {
  iv: Buffer.from("000102030405060708090a0b", "hex"),
  plaintext: "+94771234567",
  stored: "v1:AAECAwQFBgcICQoL3uDtZIB3Vbo8t_lOiFE7h4pNn5Zw2lrmQN_vIQ",
};

describe("parseEncryptionKey", () => {
  it("accepts 32 bytes as base64 or hex and rejects anything else", () => {
    expect(KEY).toHaveLength(32);
    expect(parseEncryptionKey("ab".repeat(32))).toHaveLength(32);
    expect(parseEncryptionKey("too-short")).toBeNull();
    expect(parseEncryptionKey("")).toBeNull();
  });
});

describe("FieldCipher", () => {
  it("round-trips text, including unicode", () => {
    for (const text of ["+94771234567", "Near Kohuwala junction", "Vegetarian 🥗 / no nuts", "6.895, 79.856"]) {
      const stored = cipher.encrypt(text);
      expect(isEncrypted(stored)).toBe(true);
      expect(stored).not.toContain(text);
      expect(cipher.decrypt(stored)).toBe(text);
    }
  });

  it("uses a fresh IV, so equal values look different in the database", () => {
    expect(cipher.encrypt("same")).not.toBe(cipher.encrypt("same"));
  });

  it("matches the known vector (the Python geocoder uses the same format)", () => {
    expect(cipher.encrypt(KNOWN_VECTOR.plaintext, KNOWN_VECTOR.iv)).toBe(KNOWN_VECTOR.stored);
    expect(cipher.decrypt(KNOWN_VECTOR.stored)).toBe(KNOWN_VECTOR.plaintext);
  });

  it("rejects tampered values and the wrong key", () => {
    const stored = cipher.encrypt("+94771234567");
    const tampered = stored.slice(0, -2) + (stored.endsWith("A") ? "BB" : "AA");
    expect(() => cipher.decrypt(tampered)).toThrow();
    const other = new FieldCipher(Buffer.alloc(32, 7));
    expect(() => other.decrypt(stored)).toThrow();
  });

  it("passes legacy plaintext (written before encryption) through unchanged", () => {
    expect(cipher.decrypt("+94771234567")).toBe("+94771234567");
    expect(cipher.decryptOptional(null)).toBeNull();
    expect(cipher.encryptOptional("")).toBeNull();
  });

  it("makes stable, key-dependent blind indexes", () => {
    expect(cipher.blindIndex("+94771234567")).toBe(cipher.blindIndex("+94771234567"));
    expect(cipher.blindIndex("+94771234567")).not.toBe(cipher.blindIndex("+94771234568"));
    expect(new FieldCipher(Buffer.alloc(32, 7)).blindIndex("+94771234567")).not.toBe(cipher.blindIndex("+94771234567"));
  });
});
