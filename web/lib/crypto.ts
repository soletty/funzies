import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }
  return Buffer.from(hex, "hex");
}

export function encryptApiKey(key: string): { encrypted: Buffer; iv: Buffer } {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const encrypted = Buffer.concat([
    cipher.update(key, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return { encrypted, iv };
}

export function decryptApiKey(encrypted: Buffer, iv: Buffer): string {
  const authTag = encrypted.subarray(encrypted.length - AUTH_TAG_LENGTH);
  const ciphertext = encrypted.subarray(0, encrypted.length - AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}

export function getKeyPrefix(key: string): string {
  if (key.length <= 10) {
    return key;
  }
  return `${key.slice(0, 7)}...${key.slice(-3)}`;
}
