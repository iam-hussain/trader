import { request } from "undici";
import { env } from "../env.js";

/** Thin client for the Python quant service. */
export async function quantGet<T>(path: string): Promise<T> {
  const url = `${env.QUANT_PUBLIC_URL}${path}`;
  const { statusCode, body } = await request(url, { method: "GET" });
  const text = await body.text();
  if (statusCode >= 400) {
    throw new Error(`quant ${statusCode}: ${text}`);
  }
  return JSON.parse(text) as T;
}

/** POST JSON to the Python quant service. */
export async function quantPost<T>(path: string, body: unknown): Promise<T> {
  const url = `${env.QUANT_PUBLIC_URL}${path}`;
  const { statusCode, body: respBody } = await request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const text = await respBody.text();
  if (statusCode >= 400) {
    throw new Error(`quant ${statusCode}: ${text}`);
  }
  return JSON.parse(text) as T;
}
