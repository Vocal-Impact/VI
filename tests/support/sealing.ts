import { FieldCipher, parseEncryptionKey } from "@/shared/crypto/field-encryption";
import { TEST_ENV } from "./test-env";

/** The cipher the app uses in integration tests, for writing and checking encrypted columns directly. */
export const testCipher = new FieldCipher(parseEncryptionKey(TEST_ENV.DATA_ENCRYPTION_KEY as string)!);

export function sealedPhone(e164: string) {
  return { whatsappNumberEncrypted: testCipher.encrypt(e164), whatsappNumberHash: testCipher.blindIndex(e164) };
}

export function sealedCoordinates(latitude: number, longitude: number) {
  return testCipher.encrypt(`${latitude},${longitude}`);
}
