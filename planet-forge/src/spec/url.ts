// A Planet Spec in a URL: how Aion Forge hands a planet to Planet Forge.
//
// The spec travels after `#`, as `#spec=<encoded>`, which browsers never send
// to a server. <encoded> is the spec's JSON, compressed with deflate-raw (the
// browser's CompressionStream) and written in base64url.
//
// Reading stops at the first step that fails, with a plain message: not
// base64url, not compressed data, not JSON, or the spec's own errors. Unpacked
// text is capped at MAX_SPEC_BYTES, so a hostile link cannot inflate into
// gigabytes.

import type { PlanetSpec } from "./schema";
import type { SpecCheck } from "./check";
import { checkSpec } from "./check";

/** The fragment's parameter that holds the spec. */
export const SPEC_PARAMETER = "spec";
/** Largest spec JSON read from a URL, bytes. */
export const MAX_SPEC_BYTES = 2 * 1024 * 1024;

export type FragmentRead = { found: false } | ({ found: true } & SpecCheck);

const BASE64URL = /^[A-Za-z0-9_-]*$/;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  // In chunks: String.fromCharCode takes its arguments on the stack
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array | null {
  if (!BASE64URL.test(text) || text.length % 4 === 1) return null;
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "="));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The inflated bytes; null if they are not deflate-raw data, "too large" past `limit` bytes. */
async function inflate(bytes: Uint8Array, limit: number): Promise<Uint8Array | null | "too large"> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) {
        await reader.cancel();
        return "too large";
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** The URL fragment that carries a spec, without the `#`: `spec=…`. */
export async function encodeSpec(spec: PlanetSpec): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(spec));
  return `${SPEC_PARAMETER}=${toBase64Url(await deflate(json))}`;
}

/** Reads and checks the spec in a URL fragment (`location.hash`, with or without its `#`). */
export async function readSpecFromFragment(hash: string): Promise<FragmentRead> {
  const encoded = new URLSearchParams(hash.replace(/^#/, "")).get(SPEC_PARAMETER);
  if (encoded === null) return { found: false };
  const fail = (message: string): FragmentRead => ({ found: true, ok: false, errors: [message] });

  const compressed = fromBase64Url(encoded);
  if (!compressed) return fail("the link's spec is not base64url text; it may have been cut short or changed");
  const bytes = await inflate(compressed, MAX_SPEC_BYTES);
  if (bytes === "too large") return fail(`the link's spec unpacks to more than ${MAX_SPEC_BYTES / (1024 * 1024)} MB`);
  if (!bytes) return fail("the link's spec is not compressed data; it may have been cut short or changed");
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return fail("the link's spec is not JSON");
  }
  return { found: true, ...checkSpec(input) };
}
