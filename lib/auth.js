import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SECRET_FILE = resolve("data", "session-secret.key");
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

let cachedSecret = null;

function loadOrCreateSecret() {
  if (cachedSecret) return cachedSecret;
  if (existsSync(SECRET_FILE)) {
    cachedSecret = readFileSync(SECRET_FILE, "utf8").trim();
    return cachedSecret;
  }
  const secret = randomBytes(32).toString("hex");
  writeFileSync(SECRET_FILE, secret, "utf8");
  cachedSecret = secret;
  return secret;
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hashHex] = stored.split(":");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, 64);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function signSession(payload) {
  const secret = loadOrCreateSecret();
  const encoded = base64url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(encoded).digest("hex");
  return `${encoded}.${signature}`;
}

function verifySession(token) {
  if (!token || !token.includes(".")) return null;
  const [encoded, signature] = token.split(".");
  const secret = loadOrCreateSecret();
  const expected = createHmac("sha256", secret).update(encoded).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signature || "", "hex");
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const cookies = {};
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function buildSetCookie(name, value, { maxAgeMs, secure = false, clear = false } = {}) {
  const parts = [`${name}=${encodeURIComponent(clear ? "" : value)}`];
  parts.push("Path=/");
  parts.push("HttpOnly");
  parts.push("SameSite=Lax");
  if (secure) parts.push("Secure");
  if (clear) {
    parts.push("Max-Age=0");
  } else if (maxAgeMs) {
    parts.push(`Max-Age=${Math.floor(maxAgeMs / 1000)}`);
  }
  return parts.join("; ");
}

function isSecureRequest(req) {
  return Boolean(req.socket?.encrypted) || req.headers["x-forwarded-proto"] === "https";
}

function createSessionCookie(req, userId) {
  const token = signSession({ uid: userId, exp: Date.now() + SESSION_MAX_AGE_MS });
  return buildSetCookie("pf_session", token, {
    maxAgeMs: SESSION_MAX_AGE_MS,
    secure: isSecureRequest(req),
  });
}

function clearSessionCookie(req) {
  return buildSetCookie("pf_session", "", { clear: true, secure: isSecureRequest(req) });
}

function getSessionUserId(req) {
  const cookies = parseCookies(req);
  const payload = verifySession(cookies.pf_session);
  return payload?.uid ?? null;
}

export {
  hashPassword,
  verifyPassword,
  loadOrCreateSecret,
  signSession,
  verifySession,
  parseCookies,
  buildSetCookie,
  createSessionCookie,
  clearSessionCookie,
  getSessionUserId,
};
