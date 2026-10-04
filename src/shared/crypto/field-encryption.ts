import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

/**
 * Encryption at rest for sensitive personal fields (WhatsApp number, home
 * area, coordinates, dietary preferences). See docs/adr/0008.
 *
 * Stored format: `v1:` + base64url(iv[12] ‖ ciphertext ‖ GCM tag[16]) with
 * AES-256-GCM, so the database (and its backups) never hold the real values.
 * scripts/geocode/geocode_locations.py reads and writes the same format.
 *
 * Values without the `v1:` prefix are legacy plaintext from before encryption
 * was added; they are returned as-is until `npm run db:encrypt` rewrites them.
 */

const VERSION = "v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Parses DATA_ENCRYPTION_KEY: 32 bytes as base64 (openssl rand -base64 32) or 64 hex characters. */
export function parseEncryptionKey(raw: string): Buffer | null {
  const value = raw.trim();
  const key = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  return key.length === 32 ? key : null;
}

export class FieldCipher {
  private readonly indexKey: Buffer;

  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error("The data encryption key must be 32 bytes");
    // A separate sub-key, so blind indexes reveal nothing about the encryption key.
    this.indexKey = Buffer.from(hkdfSync("sha256", key, Buffer.alloc(0), "vocal-impact/blind-index/v1", 32));
  }

  encrypt(plaintext: string, iv: Buffer = randomBytes(IV_BYTES)): string {
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return VERSION + Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64url");
  }

  decrypt(stored: string): string {
    if (!isEncrypted(stored)) return stored; // legacy plaintext
    const data = Buffer.from(stored.slice(VERSION.length), "base64url");
    if (data.length < IV_BYTES + TAG_BYTES) throw new Error("Encrypted value is truncated");
    const iv = data.subarray(0, IV_BYTES);
    const tag = data.subarray(data.length - TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(data.subarray(IV_BYTES, data.length - TAG_BYTES)),
      decipher.final(),
    ]).toString("utf8");
  }

  encryptOptional(plaintext: string | null | undefined): string | null {
    return plaintext ? this.encrypt(plaintext) : null;
  }

  decryptOptional(stored: string | null | undefined): string | null {
    return stored ? this.decrypt(stored) : null;
  }

  /**
   * Deterministic keyed fingerprint ("blind index") of a normalised value, so
   * exact-match lookups (duplicate WhatsApp numbers, geocode cache) work
   * without storing the value. Cannot be reversed without the key.
   */
  blindIndex(normalised: string): string {
    return createHmac("sha256", this.indexKey).update(normalised, "utf8").digest("base64url");
  }
}

export function isEncrypted(stored: string): boolean {
  return stored.startsWith(VERSION);
}
