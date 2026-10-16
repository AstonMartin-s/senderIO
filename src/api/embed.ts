import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";

/** Orígenes que pueden meter el panel en un iframe. Los pasó TOB. */
export const EMBED_ORIGINS = [
  "https://panel.trackerapp.site",
  "https://tobyap-production.up.railway.app",
] as const;

export const EMBED_VIEWS = [
  "overview",
  "bms",
  "plantillas",
  "funnel",
  "log",
  "clientes",
  "verificador",
] as const;

const COOKIE = "snd_embed";
const TTL_SEC = 12 * 60 * 60;

export function embedView(url: string): string | null {
  const path = url.split("?")[0] ?? "";
  const m = /^\/embed\/([a-z]+)\/?$/.exec(path);
  if (!m) return null;
  return (EMBED_VIEWS as readonly string[]).includes(m[1]) ? m[1] : null;
}

function originOf(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

export function embedRefererOk(referer: string | undefined): boolean {
  const origin = originOf(referer);
  return origin != null && (EMBED_ORIGINS as readonly string[]).includes(origin);
}

/** La página /embed llama al API en el mismo origen. El host tiene que ser el nuestro. */
export function refererIsEmbedPage(
  referer: string | undefined,
  host: string | undefined
): boolean {
  if (!referer || !host) return false;
  try {
    const u = new URL(referer);
    if (u.host !== host.split(",")[0]?.trim()) return false;
    return embedView(u.pathname) != null;
  } catch {
    return false;
  }
}

function mac(exp: string): string {
  return createHmac("sha256", config.api.adminPassword)
    .update(exp)
    .digest("base64url");
}

export function embedCookieValue(): string {
  const exp = String(Math.floor(Date.now() / 1000) + TTL_SEC);
  return `${exp}.${mac(exp)}`;
}

export function embedCookieValid(header: string | undefined): boolean {
  if (!header) return false;
  const raw = header
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!raw) return false;
  const [exp, sig] = raw.split(".");
  if (!exp || !sig) return false;
  const expected = mac(exp);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const n = Number(exp);
  return Number.isFinite(n) && n > Date.now() / 1000;
}

export function setEmbedCookie(reply: FastifyReply): void {
  const secure = Boolean(process.env.RAILWAY_ENVIRONMENT);
  const parts = [
    `${COOKIE}=${embedCookieValue()}`,
    "HttpOnly",
    "Path=/",
    `Max-Age=${TTL_SEC}`,
    secure ? "SameSite=None" : "SameSite=Lax",
  ];
  if (secure) parts.push("Secure", "Partitioned");
  reply.header("Set-Cookie", parts.join("; "));
}

export function setEmbedFrameHeaders(reply: FastifyReply): void {
  reply.header(
    "Content-Security-Policy",
    `frame-ancestors ${EMBED_ORIGINS.join(" ")}`
  );
}

export function requestHasEmbedCookie(req: FastifyRequest): boolean {
  return embedCookieValid(req.headers.cookie);
}
