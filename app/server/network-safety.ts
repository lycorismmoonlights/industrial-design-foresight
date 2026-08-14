import { AppError } from "./errors";

export const MAX_FEED_BYTES = 1024 * 1024;
export const FEED_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((part) => part > 255)) return true;
  const [a, b] = octets;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}

function isPrivateIpv6(hostname: string): boolean {
  const value = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!value.includes(":")) return false;
  if (value === "::" || value === "::1") return true;
  if (/^f[cd]/.test(value) || /^fe[89ab]/.test(value)) return true;
  const mapped = value.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return Boolean(mapped && isPrivateIpv4(mapped[1]));
}

export function assertPublicHttpUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AppError(400, "INVALID_SOURCE_URL", "来源地址不是有效 URL。");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AppError(400, "UNSAFE_SOURCE_URL", "来源仅支持 HTTP 或 HTTPS。");
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname
    || hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || hostname.endsWith(".internal")
    || isPrivateIpv4(hostname)
    || isPrivateIpv6(hostname)) {
    throw new AppError(400, "UNSAFE_SOURCE_URL", "来源地址不能指向本机或私有网络。");
  }
  url.username = "";
  url.password = "";
  return url;
}

async function readLimited(response: Response, maxBytes: number): Promise<string> {
  const declaredSize = Number(response.headers.get("content-length") ?? "0");
  if (declaredSize > maxBytes) throw new AppError(413, "SOURCE_TOO_LARGE", "来源响应超过 1 MB 限制。");
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new AppError(413, "SOURCE_TOO_LARGE", "来源响应超过 1 MB 限制。");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export interface SafeFetchResult {
  response: Response;
  body: string;
  finalUrl: string;
}

export async function safeFetchText(rawUrl: string, init: RequestInit = {}, fetcher: typeof fetch = fetch): Promise<SafeFetchResult> {
  let url = assertPublicHttpUrl(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("feed timeout"), FEED_TIMEOUT_MS);
  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      let response: Response;
      try {
        response = await fetcher(url.toString(), { ...init, redirect: "manual", signal: controller.signal });
      } catch (error) {
        if (controller.signal.aborted) throw new AppError(504, "SOURCE_TIMEOUT", "来源请求超过 10 秒。");
        throw new AppError(502, "SOURCE_FETCH_FAILED", error instanceof Error ? error.message : "来源请求失败。");
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) throw new AppError(502, "INVALID_REDIRECT", "来源返回了无地址的重定向。");
        if (redirects === MAX_REDIRECTS) throw new AppError(502, "TOO_MANY_REDIRECTS", "来源重定向次数过多。");
        url = assertPublicHttpUrl(new URL(location, url).toString());
        continue;
      }
      const body = response.status === 304 ? "" : await readLimited(response, MAX_FEED_BYTES);
      return { response, body, finalUrl: url.toString() };
    }
    throw new AppError(502, "TOO_MANY_REDIRECTS", "来源重定向次数过多。");
  } finally {
    clearTimeout(timeout);
  }
}
