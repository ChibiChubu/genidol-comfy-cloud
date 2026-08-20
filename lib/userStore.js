import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { hashPassword } from "./auth.js";

const DATA_DIR = resolve("data");
const DATA_FILE = resolve(DATA_DIR, "users.json");

let writeChain = Promise.resolve();

async function ensureDataFile() {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
  if (!existsSync(DATA_FILE)) {
    await writeFile(DATA_FILE, "[]\n", "utf8");
  }
}

async function readAll() {
  await ensureDataFile();
  const text = await readFile(DATA_FILE, "utf8");
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

async function writeAll(users) {
  const tmpFile = `${DATA_FILE}.tmp`;
  await writeFile(tmpFile, JSON.stringify(users, null, 2), "utf8");
  await rename(tmpFile, DATA_FILE);
}

function withWriteLock(task) {
  const next = writeChain.then(task, task);
  writeChain = next.catch(() => {});
  return next;
}

async function listUsers() {
  const users = await readAll();
  return [...users].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

async function getUserById(id) {
  const users = await readAll();
  return users.find((user) => user.id === id) ?? null;
}

async function getUserByEmail(email) {
  const users = await readAll();
  const normalized = email.trim().toLowerCase();
  return users.find((user) => user.email === normalized) ?? null;
}

async function createUser({ email, password }) {
  return withWriteLock(async () => {
    const users = await readAll();
    const normalized = email.trim().toLowerCase();
    if (users.some((user) => user.email === normalized)) {
      throw new Error("EMAIL_TAKEN");
    }
    const user = {
      id: randomUUID(),
      email: normalized,
      passwordHash: hashPassword(password),
      role: users.length === 0 ? "admin" : "client",
      comfyApiKey: null,
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    await writeAll(users);
    return user;
  });
}

async function updateApiKey(id, apiKey) {
  return withWriteLock(async () => {
    const users = await readAll();
    const user = users.find((item) => item.id === id);
    if (!user) return null;
    user.comfyApiKey = apiKey ? apiKey.trim() : null;
    await writeAll(users);
    return user;
  });
}

export { listUsers, getUserById, getUserByEmail, createUser, updateApiKey, DATA_DIR };
