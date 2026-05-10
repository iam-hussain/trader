import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { env } from "../env.js";

const ALG = "aes-256-gcm";
const KEY = scryptSync(env.NEXTAUTH_SECRET, "trader-apikey-v1", 32);

/** Returns base64(iv).base64(ciphertext+tag). */
export function encrypt(plaintext: string): { ciphertext: string; iv: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    ciphertext: Buffer.concat([enc, tag]).toString("base64"),
  };
}

export function decrypt(ciphertextB64: string, ivB64: string): string {
  const data = Buffer.from(ciphertextB64, "base64");
  const enc = data.subarray(0, data.length - 16);
  const tag = data.subarray(data.length - 16);
  const decipher = createDecipheriv(ALG, KEY, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function lastFour(s: string): string {
  return s.length <= 4 ? s : s.slice(-4);
}
