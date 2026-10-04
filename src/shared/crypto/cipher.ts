import "server-only";
import { getEnv } from "@/shared/config/env";
import { FieldCipher, parseEncryptionKey } from "./field-encryption";

let cached: FieldCipher | undefined;

/** The app's field cipher, keyed by DATA_ENCRYPTION_KEY. */
export function fieldCipher(): FieldCipher {
  if (cached) return cached;
  const key = parseEncryptionKey(getEnv().DATA_ENCRYPTION_KEY);
  if (!key) throw new Error("DATA_ENCRYPTION_KEY must be 32 bytes (openssl rand -base64 32)");
  cached = new FieldCipher(key);
  return cached;
}
