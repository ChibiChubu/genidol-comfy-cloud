import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DATA_DIR = resolve("data");
const DATA_FILE = resolve(DATA_DIR, "talents.json");

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

async function writeAll(talents) {
  const tmpFile = `${DATA_FILE}.tmp`;
  await writeFile(tmpFile, JSON.stringify(talents, null, 2), "utf8");
  await rename(tmpFile, DATA_FILE);
}

function withWriteLock(task) {
  const next = writeChain.then(task, task);
  writeChain = next.catch(() => {});
  return next;
}

async function listTalents() {
  const talents = await readAll();
  return [...talents].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function getTalent(id) {
  const talents = await readAll();
  return talents.find((talent) => talent.id === id) ?? null;
}

async function addTalent(record) {
  return withWriteLock(async () => {
    const talents = await readAll();
    const talent = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      ...record,
    };
    talents.push(talent);
    await writeAll(talents);
    return talent;
  });
}

async function deleteTalent(id) {
  return withWriteLock(async () => {
    const talents = await readAll();
    const index = talents.findIndex((talent) => talent.id === id);
    if (index === -1) return false;
    talents.splice(index, 1);
    await writeAll(talents);
    return true;
  });
}

async function updateTalentOwner(id, ownerId) {
  return withWriteLock(async () => {
    const talents = await readAll();
    const talent = talents.find((item) => item.id === id);
    if (!talent) return false;
    talent.ownerId = ownerId;
    await writeAll(talents);
    return true;
  });
}

export { listTalents, getTalent, addTalent, deleteTalent, updateTalentOwner, DATA_DIR };
