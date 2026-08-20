import http from "node:http";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import {
  buildComfyUIPayload,
  getWorkflowSummary,
  loadWorkflowGraph,
} from "./lib/workflow.js";
import { addTalent, deleteTalent, getTalent, listTalents, updateTalentOwner } from "./lib/talentStore.js";
import {
  createSessionCookie,
  clearSessionCookie,
  getSessionUserId,
  verifyPassword,
} from "./lib/auth.js";
import {
  createUser,
  getUserByEmail,
  getUserById,
  listUsers,
  updateApiKey,
} from "./lib/userStore.js";

const ROOT = resolve(".");
const PUBLIC_DIR = join(ROOT, "public");
const GENERATED_DIR = join(PUBLIC_DIR, "generated");
const COMFYUI_ENV_PATH = resolve("C:/Users/Administrator/Documents/Comfyui/.env.local");

const TALENT_ASSET_NODES = {
  "209": { key: "characterDownload", base: "character-download" },
  "89": { key: "editorial1", base: "editorial-1" },
  "90": { key: "editorial2", base: "editorial-2" },
  "91": { key: "editorial3", base: "editorial-3" },
  "114": { key: "video", base: "video" },
};

const activeGenerations = new Map();

const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
const COMFYUI_ENDPOINT = process.env.COMFYUI_URL ?? "https://cloud.comfy.org";

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnv(COMFYUI_ENV_PATH);
loadDotEnv(resolve(ROOT, ".env.local"));
loadDotEnv(resolve(ROOT, ".env"));

function send(res, statusCode, payload, headers = {}) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type":
      typeof payload === "string"
        ? "text/plain; charset=utf-8"
        : "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

function sendJson(res, data, status = 200, headers = {}) {
  send(res, status, data, headers);
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    hasApiKey: Boolean(user.comfyApiKey),
  };
}

async function getOptionalUser(req) {
  const uid = getSessionUserId(req);
  if (!uid) return null;
  return await getUserById(uid);
}

async function requireAuth(req, res) {
  const uid = getSessionUserId(req);
  if (!uid) {
    sendJson(res, { error: "Authentication required" }, 401);
    return null;
  }
  const user = await getUserById(uid);
  if (!user) {
    sendJson(res, { error: "Authentication required" }, 401);
    return null;
  }
  return user;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function readRequest(req) {
  return await new Promise((resolvePromise, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolvePromise(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function serveStatic(res, pathname) {
  const safeName = pathname === "/" ? "/index.html" : pathname;
  const filePath = join(PUBLIC_DIR, safeName);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, { error: "Forbidden" }, 403);
    return;
  }

  try {
    const data = await readFile(filePath);
    const headers = {
      "Content-Type": CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    };
    if (safeName.startsWith("/generated/")) {
      headers["Content-Disposition"] = `attachment; filename="${basename(filePath)}"`;
    }
    res.writeHead(200, headers);
    res.end(data);
  } catch {
    sendJson(res, { error: "Not found" }, 404);
  }
}

function normalizeBody(fields = {}) {
  const body = { ...fields };
  for (const key of ["seed", "width", "height"]) {
    if (body[key] !== undefined && body[key] !== "") {
      body[key] = Number(body[key]);
    }
  }

  for (const key of ["wardrobe", "references"]) {
    if (typeof body[key] === "string" && body[key].trim()) {
      try {
        body[key] = JSON.parse(body[key]);
      } catch {
        // Keep raw string if parsing fails.
      }
    }
  }

  return body;
}

function trimMultipartTail(buffer) {
  if (buffer.length >= 2 && buffer.at(-2) === 13 && buffer.at(-1) === 10) {
    return buffer.subarray(0, -2);
  }
  return buffer;
}

async function parseMultipart(req) {
  const contentType = req.headers["content-type"] || "";
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) throw new Error("Expected multipart/form-data request.");

  const boundary = `--${match[1] || match[2]}`;
  const buffer = await readRequest(req);
  const parts = buffer.toString("binary").split(boundary).slice(1, -1);
  const fields = {};
  const files = {};

  for (const rawPart of parts) {
    const part = rawPart.replace(/^\r\n/, "").replace(/\r\n$/, "");
    const index = part.indexOf("\r\n\r\n");
    if (index === -1) continue;

    const headerText = part.slice(0, index);
    const bodyBinary = part.slice(index + 4);
    const name = /name="([^"]+)"/.exec(headerText)?.[1];
    if (!name) continue;

    const filename = /filename="([^"]*)"/.exec(headerText)?.[1];
    const type = /Content-Type:\s*([^\r\n]+)/i.exec(headerText)?.[1] || "application/octet-stream";
    const body = Buffer.from(bodyBinary, "binary");

    if (filename) {
      files[name] = { filename, type, buffer: trimMultipartTail(body) };
    } else {
      fields[name] = body.toString("utf8").trim();
    }
  }

  return { fields, files };
}

async function uploadImage(file, apiKey) {
  const form = new FormData();
  form.set("image", new Blob([file.buffer], { type: file.type || "application/octet-stream" }), file.filename || "reference.png");
  form.set("type", "input");
  form.set("overwrite", "true");

  const response = await fetch(`${COMFYUI_ENDPOINT}/api/upload/image`, {
    method: "POST",
    headers: { "X-API-Key": apiKey },
    body: form,
  });

  const body = await readResponse(response);
  if (!response.ok) throw new Error(`Upload failed: ${body}`);

  const data = JSON.parse(body);
  return {
    filename: data.filename || data.name,
    subfolder: data.subfolder || "",
    type: data.type || "input",
  };
}

function patchReferenceNodes(workflow, uploadedRefs) {
  const nodeIds = ["38", "12", "37", "160"];
  for (let index = 0; index < uploadedRefs.length && index < nodeIds.length; index += 1) {
    const nodeId = nodeIds[index];
    if (!workflow[nodeId]?.inputs) continue;
    workflow[nodeId].inputs.image = uploadedRefs[index].filename;
  }
}

async function submitWorkflow(workflow, apiKey) {
  const response = await fetch(`${COMFYUI_ENDPOINT}/api/prompt`, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: workflow,
      extra_data: {
        api_key_comfy_org: apiKey,
      },
    }),
  });
  const body = await readResponse(response);
  if (!response.ok) throw new Error(`Workflow submit failed: ${body}`);
  const data = JSON.parse(body);
  return data.prompt_id;
}

async function waitForCompletion(promptId, apiKey, signal) {
  const timeoutMs = 15 * 60 * 1000;
  const startedAt = Date.now();
  const wsUrl = `wss://cloud.comfy.org/ws?clientId=${randomUUID()}&token=${encodeURIComponent(apiKey)}`;

  return new Promise((resolvePromise, reject) => {
    const outputs = {};
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("Job timed out after 15 minutes."));
    }, timeoutMs);

    const onAbort = () => {
      clearTimeout(timer);
      ws.close();
      interruptComfyJob(promptId, apiKey);
      const error = new Error("Generation cancelled.");
      error.status = 499;
      reject(error);
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    ws.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      const message = JSON.parse(event.data);
      const data = message.data || {};
      if (data.prompt_id && data.prompt_id !== promptId) return;

      if (message.type === "executed" && data.output) {
        outputs[data.node] = data.output;
      }

      if (message.type === "execution_success") {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        ws.close();
        resolvePromise(outputs);
      }

      if (message.type === "execution_error") {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        ws.close();
        reject(new Error(data.exception_message || "Comfy Cloud execution failed."));
      }
    });

    ws.addEventListener("error", async () => {
      try {
        const status = await pollJobStatus(promptId, apiKey, startedAt, timeoutMs);
        signal?.removeEventListener("abort", onAbort);
        if (status.status === "completed") {
          resolvePromise(outputs);
        } else {
          reject(new Error(`WebSocket failed and job status is ${status.status || "unknown"}.`));
        }
      } catch (error) {
        signal?.removeEventListener("abort", onAbort);
        reject(error);
      }
    });
  });
}

async function interruptComfyJob(promptId, apiKey) {
  const headers = { "X-API-Key": apiKey, "Content-Type": "application/json" };
  try {
    await fetch(`${COMFYUI_ENDPOINT}/api/interrupt`, {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt_id: promptId }),
    });
  } catch {
    // Best-effort: cloud endpoint may not support this, ignore failures.
  }
  try {
    await fetch(`${COMFYUI_ENDPOINT}/api/queue`, {
      method: "POST",
      headers,
      body: JSON.stringify({ delete: [promptId] }),
    });
  } catch {
    // Best-effort: cloud endpoint may not support this, ignore failures.
  }
}

async function pollJobStatus(promptId, apiKey, startedAt, timeoutMs) {
  while (Date.now() - startedAt < timeoutMs) {
    const response = await fetch(`${COMFYUI_ENDPOINT}/api/job/${promptId}/status`, {
      headers: { "X-API-Key": apiKey },
    });
    const body = await readResponse(response);
    if (!response.ok) throw new Error(`Status check failed: ${body}`);
    const data = JSON.parse(body);
    if (["completed", "failed", "cancelled"].includes(data.status)) return data;
    await delay(4000);
  }
  throw new Error("Job status polling timed out.");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readResponse(response) {
  return await response.text();
}

function setInput(workflow, nodeId, key, value) {
  if (!workflow[nodeId]?.inputs) return;
  workflow[nodeId].inputs[key] = value;
}

function collectAssets(workflow, outputs) {
  const assets = [];

  for (const [nodeId, output] of Object.entries(outputs)) {
    const node = workflow[nodeId];
    if (!node || (node.class_type !== "SaveImage" && node.class_type !== "SaveVideo")) continue;

    const label = node.inputs?.filename_prefix || node._meta?.title || `Node ${nodeId}`;
    const groups = Object.values(output || {}).filter((value) => Array.isArray(value));

    for (const files of groups) {
      for (const file of files || []) {
        if (!file?.filename) continue;
        const params = new URLSearchParams({
          filename: file.filename,
          subfolder: file.subfolder || "",
          type: file.type || "output",
        });
        const kind = node.class_type === "SaveVideo" || isVideoFile(file.filename) ? "video" : "image";
        assets.push({
          nodeId,
          label,
          kind,
          filename: file.filename,
          url: `/api/view?${params.toString()}`,
          downloadUrl: `/api/view?${params.toString()}`,
        });
      }
    }
  }

  return assets;
}

function isVideoFile(filename = "") {
  return /\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(filename);
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    const error = new Error("Generation cancelled.");
    error.status = 499;
    throw error;
  }
}

async function runComfyGeneration(apiKey, fields, files, signal) {
  const body = normalizeBody(fields);
  const references = ["ref1", "ref2", "ref3", "ref4"].map((name) => files[name]).filter(Boolean);
  if (references.length !== 4) {
    const error = new Error("Please upload exactly 4 reference images.");
    error.status = 400;
    throw error;
  }

  const uploadedRefs = [];
  for (const file of references) {
    throwIfAborted(signal);
    uploadedRefs.push(await uploadImage(file, apiKey));
  }

  if (files.clientOutfit) {
    throwIfAborted(signal);
    const uploadedOutfit = await uploadImage(files.clientOutfit, apiKey);
    body.clientOutfit = {
      ...(body.clientOutfit || {}),
      name: uploadedOutfit.filename,
      uploaded: true,
    };
  }

  const payload = buildComfyUIPayload(workflowGraph, body);
  const workflow = JSON.parse(JSON.stringify(payload.workflow));
  patchReferenceNodes(workflow, uploadedRefs);
  if (body.clientOutfit?.name && workflow["157"]?.inputs) {
    workflow["157"].inputs.image = body.clientOutfit.name;
  }

  throwIfAborted(signal);
  const promptId = await submitWorkflow(workflow, apiKey);
  const outputs = await waitForCompletion(promptId, apiKey, signal);
  const assets = collectAssets(workflow, outputs);

  return { body, payload, workflow, uploadedRefs, referenceFiles: references, promptId, outputs, assets };
}

async function downloadComfyAsset(filename, subfolder, type, apiKey) {
  const params = new URLSearchParams({ filename, subfolder: subfolder || "", type: type || "output" });
  const response = await fetch(`${COMFYUI_ENDPOINT}/api/view?${params.toString()}`, {
    headers: { "X-API-Key": apiKey },
  });
  if (!response.ok) throw new Error(`Failed to download asset ${filename}: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function persistTalentAssets(talentId, assets, referenceFiles, apiKey) {
  const talentDir = join(GENERATED_DIR, talentId);
  await mkdir(talentDir, { recursive: true });

  const assetMap = {};
  for (const asset of assets) {
    const mapping = TALENT_ASSET_NODES[String(asset.nodeId)];
    if (!mapping) continue;

    const query = new URL(asset.url, "http://internal").searchParams;
    const buffer = await downloadComfyAsset(
      query.get("filename"),
      query.get("subfolder"),
      query.get("type"),
      apiKey,
    );
    const ext = extname(asset.filename) || (asset.kind === "video" ? ".mp4" : ".png");
    const outFilename = `${mapping.base}${ext}`;
    await writeFile(join(talentDir, outFilename), buffer);
    assetMap[mapping.key] = {
      nodeId: asset.nodeId,
      kind: asset.kind,
      url: `/generated/${talentId}/${outFilename}`,
    };
  }

  const references = [];
  for (let index = 0; index < referenceFiles.length; index += 1) {
    const file = referenceFiles[index];
    if (!file) continue;
    const ext = extname(file.filename || "") || ".jpg";
    const outFilename = `ref-${index + 1}${ext}`;
    await writeFile(join(talentDir, outFilename), file.buffer);
    references.push({ url: `/generated/${talentId}/${outFilename}` });
  }

  return { assetMap, references };
}

async function proxyComfyView(res, url, apiKey) {
  if (!apiKey) {
    sendJson(res, { error: "Set your ComfyUI Cloud API key first.", redirectHint: "/#/account" }, 400);
    return;
  }

  const response = await fetch(`${COMFYUI_ENDPOINT}/api/view?${url.searchParams.toString()}`, {
    headers: { "X-API-Key": apiKey },
    redirect: "manual",
  });

  if (response.status === 302) {
    res.writeHead(302, { Location: response.headers.get("location") });
    res.end();
    return;
  }

  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  res.end(Buffer.from(await response.arrayBuffer()));
}

const workflowGraph = loadWorkflowGraph();
const workflowSummary = getWorkflowSummary(workflowGraph);
const wardrobeGroups = [
  {
    id: "shirt",
    label: "Shirt",
    tone: "top only",
    items: [
      { id: "shirt-a", label: "Shirt A", imageUrl: "/assets/wardrobe/Shirt-A.png" },
      { id: "shirt-b", label: "Shirt B", imageUrl: "/assets/wardrobe/Shirt-B.png" },
      { id: "shirt-c", label: "Shirt C", imageUrl: "/assets/wardrobe/Shirt-C.png" },
      { id: "shirt-d", label: "Shirt D", imageUrl: "/assets/wardrobe/Shirt-D.png" },
    ],
  },
  {
    id: "pants",
    label: "Pants",
    tone: "bottom only",
    items: [
      { id: "pants-a", label: "Pants A", imageUrl: "/assets/wardrobe/Pants-A.png" },
      { id: "pants-b", label: "Pants B", imageUrl: "/assets/wardrobe/Pants-B.png" },
      { id: "pants-c", label: "Pants C", imageUrl: "/assets/wardrobe/Pants-C.png" },
      { id: "pants-d", label: "Pants D", imageUrl: "/assets/wardrobe/Pants-D.png" },
    ],
  },
  {
    id: "dress",
    label: "Dress",
    tone: "one piece",
    items: [
      { id: "dress-a", label: "Dress A", imageUrl: "/assets/wardrobe/Dress-A.png" },
      { id: "dress-b", label: "Dress B", imageUrl: "/assets/wardrobe/Dress-B.png" },
      { id: "dress-c", label: "Dress C", imageUrl: "/assets/wardrobe/Dress-C.png" },
      { id: "dress-d", label: "Dress D", imageUrl: "/assets/wardrobe/Dress-D.png" },
    ],
  },
];

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, {
        ok: true,
        service: "proxify-comfyui-workflow-studio",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/signup") {
      try {
        const body = await readJsonBody(req);
        const email = (body.email || "").trim();
        const password = body.password || "";
        if (!email || !email.includes("@")) {
          sendJson(res, { error: "Valid email is required." }, 400);
          return;
        }
        if (password.length < 8) {
          sendJson(res, { error: "Password must be at least 8 characters." }, 400);
          return;
        }
        const user = await createUser({ email, password });
        const cookie = createSessionCookie(req, user.id);
        sendJson(res, { user: publicUser(user) }, 200, { "Set-Cookie": cookie });
      } catch (error) {
        if (error.message === "EMAIL_TAKEN") {
          sendJson(res, { error: "An account with that email already exists." }, 409);
          return;
        }
        sendJson(res, { error: "Signup failed" }, 400);
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readJsonBody(req);
      const email = (body.email || "").trim();
      const password = body.password || "";
      const user = await getUserByEmail(email);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        sendJson(res, { error: "Invalid email or password." }, 401);
        return;
      }
      const cookie = createSessionCookie(req, user.id);
      sendJson(res, { user: publicUser(user) }, 200, { "Set-Cookie": cookie });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      const cookie = clearSessionCookie(req);
      sendJson(res, { ok: true }, 200, { "Set-Cookie": cookie });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/auth/me") {
      const user = await getOptionalUser(req);
      sendJson(res, { user: user ? publicUser(user) : null });
      return;
    }

    if (req.method === "PUT" && url.pathname === "/api/account/api-key") {
      const user = await requireAuth(req, res);
      if (!user) return;
      const body = await readJsonBody(req);
      const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
      const updated = await updateApiKey(user.id, apiKey);
      sendJson(res, { user: publicUser(updated) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/users") {
      const user = await requireAuth(req, res);
      if (!user) return;
      if (user.role !== "admin") {
        sendJson(res, { error: "Forbidden" }, 403);
        return;
      }
      const [users, talents] = await Promise.all([listUsers(), listTalents()]);
      const counts = {};
      for (const talent of talents) {
        if (!talent.ownerId) continue;
        counts[talent.ownerId] = (counts[talent.ownerId] || 0) + 1;
      }
      sendJson(res, {
        users: users.map((item) => ({
          id: item.id,
          email: item.email,
          role: item.role,
          createdAt: item.createdAt,
          hasApiKey: Boolean(item.comfyApiKey),
          maskedApiKey: item.comfyApiKey
            ? `${item.comfyApiKey.slice(0, 4)}••••${item.comfyApiKey.slice(-4)}`
            : null,
          talentCount: counts[item.id] || 0,
        })),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/workflow") {
      const user = await getOptionalUser(req);
      sendJson(res, {
        summary: workflowSummary,
        workflow: workflowGraph,
        wardrobeGroups,
        hasApiKey: Boolean(user?.comfyApiKey),
        comfyuiEndpoint: COMFYUI_ENDPOINT,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/intake") {
      const user = await getOptionalUser(req);
      sendJson(res, {
        workflow: workflowSummary,
        wardrobeGroups,
        hasApiKey: Boolean(user?.comfyApiKey),
        comfyuiEndpoint: COMFYUI_ENDPOINT,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/workflow/render") {
      const user = await requireAuth(req, res);
      if (!user) return;
      try {
        const body = normalizeBody(await readJsonBody(req));
        const payload = buildComfyUIPayload(workflowGraph, body);

        sendJson(res, {
          client_id: body.client_id ?? randomUUID(),
          mode: body.mode ?? "character-sheet",
          intake: {
            references: Array.isArray(body.references) ? body.references : [],
            wardrobe: body.wardrobe ?? null,
            clientOutfit: body.clientOutfit ?? null,
          },
          hasApiKey: Boolean(user.comfyApiKey),
          activeNodeId: payload.activeNodeId,
          activeNodeTitle: payload.activeNodeTitle,
          comfyuiEndpoint: COMFYUI_ENDPOINT,
          prompt: payload.workflow,
          selectedPrompt: payload.selectedPrompt,
          selectedEditorialNodeId: payload.selectedEditorialNodeId,
          wardrobe: payload.wardrobe,
        });
      } catch (error) {
        sendJson(res, {
          error: "Invalid workflow payload",
          message: error instanceof Error ? error.message : "Unknown error",
        }, 400);
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/workflow/run") {
      const user = await requireAuth(req, res);
      if (!user) return;
      try {
        if (!user.comfyApiKey) {
          sendJson(res, {
            error: "Set your ComfyUI Cloud API key to generate.",
            redirectHint: "/#/account",
          }, 400);
          return;
        }

        const { fields, files } = await parseMultipart(req);
        const result = await runComfyGeneration(user.comfyApiKey, fields, files);

        sendJson(res, {
          promptId: result.promptId,
          mode: result.body.mode ?? "character-sheet",
          activeNodeId: result.payload.activeNodeId,
          activeNodeTitle: result.payload.activeNodeTitle,
          selectedEditorialNodeId: result.payload.selectedEditorialNodeId,
          outputs: result.assets,
          rawOutputs: result.outputs,
        });
      } catch (error) {
        sendJson(res, {
          error: "Workflow execution failed",
          message: error instanceof Error ? error.message : "Unknown error",
        }, error.status || 400);
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/talents") {
      const user = await requireAuth(req, res);
      if (!user) return;
      try {
        if (!user.comfyApiKey) {
          sendJson(res, {
            error: "Set your ComfyUI Cloud API key to generate.",
            redirectHint: "/#/account",
          }, 400);
          return;
        }
        const apiKey = user.comfyApiKey;

        const { fields, files } = await parseMultipart(req);
        const name = (fields.name || "").trim();
        if (!name) {
          sendJson(res, { error: "Talent name is required." }, 400);
          return;
        }

        const requestId = fields.requestId || randomUUID();
        const abortController = new AbortController();
        activeGenerations.set(requestId, { controller: abortController, ownerId: user.id });
        req.on("aborted", () => abortController.abort());
        req.on("close", () => {
          if (!res.writableEnded) abortController.abort();
        });

        let result;
        try {
          result = await runComfyGeneration(apiKey, fields, files, abortController.signal);
        } finally {
          activeGenerations.delete(requestId);
        }
        const talentId = randomUUID();
        const { assetMap, references } = await persistTalentAssets(
          talentId,
          result.assets,
          result.referenceFiles,
          apiKey,
        );

        const requiredKeys = Object.values(TALENT_ASSET_NODES).map((mapping) => mapping.key);
        const missing = requiredKeys.filter((key) => !assetMap[key]);
        if (missing.length) {
          throw new Error(`Generation completed but missing expected outputs: ${missing.join(", ")}`);
        }

        const talent = await addTalent({
          id: talentId,
          ownerId: user.id,
          name,
          wardrobe: result.payload.wardrobe,
          clientOutfitUsed: result.payload.wardrobe?.source === "client",
          promptId: result.promptId,
          assets: assetMap,
          references,
        });

        sendJson(res, { talent });
      } catch (error) {
        sendJson(res, {
          error: "Talent generation failed",
          message: error instanceof Error ? error.message : "Unknown error",
        }, error.status || 400);
      }
      return;
    }

    if (req.method === "POST" && url.pathname.startsWith("/api/generations/") && url.pathname.endsWith("/cancel")) {
      const user = await requireAuth(req, res);
      if (!user) return;
      const requestId = url.pathname.slice("/api/generations/".length, -"/cancel".length);
      const entry = activeGenerations.get(requestId);
      if (!entry || (entry.ownerId !== user.id && user.role !== "admin")) {
        sendJson(res, { ok: false, message: "No active generation found (it may have already finished)." }, 404);
        return;
      }
      entry.controller.abort();
      sendJson(res, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/talents") {
      const user = await requireAuth(req, res);
      if (!user) return;
      const talents = await listTalents();
      const visible = user.role === "admin" ? talents : talents.filter((talent) => talent.ownerId === user.id);
      const ownerEmailById = {};
      if (user.role === "admin") {
        for (const account of await listUsers()) ownerEmailById[account.id] = account.email;
      }
      sendJson(res, {
        talents: visible.map((talent) => ({
          id: talent.id,
          name: talent.name,
          createdAt: talent.createdAt,
          wardrobe: talent.wardrobe,
          coverUrl: talent.assets?.editorial1?.url ?? talent.assets?.characterDownload?.url ?? null,
          ...(user.role === "admin" ? { ownerEmail: ownerEmailById[talent.ownerId] || "unknown" } : {}),
        })),
      });
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/talents/")) {
      const user = await requireAuth(req, res);
      if (!user) return;
      const id = url.pathname.slice("/api/talents/".length);
      const talent = await getTalent(id);
      if (!talent || (talent.ownerId !== user.id && user.role !== "admin")) {
        sendJson(res, { error: "Not found" }, 404);
        return;
      }
      sendJson(res, { talent });
      return;
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/talents/")) {
      const user = await requireAuth(req, res);
      if (!user) return;
      const id = url.pathname.slice("/api/talents/".length);
      const talent = await getTalent(id);
      if (!talent || (talent.ownerId !== user.id && user.role !== "admin")) {
        sendJson(res, { error: "Not found" }, 404);
        return;
      }
      const removed = await deleteTalent(id);
      if (!removed) {
        sendJson(res, { error: "Not found" }, 404);
        return;
      }
      await rm(join(GENERATED_DIR, id), { recursive: true, force: true });
      sendJson(res, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/view") {
      const user = await requireAuth(req, res);
      if (!user) return;
      await proxyComfyView(res, url, user.comfyApiKey);
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/generated/")) {
      const user = await requireAuth(req, res);
      if (!user) return;
      const talentId = url.pathname.slice("/generated/".length).split("/")[0];
      const talent = await getTalent(talentId);
      if (!talent || (talent.ownerId !== user.id && user.role !== "admin")) {
        sendJson(res, { error: "Not found" }, 404);
        return;
      }
      await serveStatic(res, url.pathname);
      return;
    }

    if (req.method === "GET") {
      await serveStatic(res, url.pathname);
      return;
    }

    sendJson(res, { error: "Method not allowed" }, 405);
  } catch (error) {
    console.error(error);
    sendJson(res, { error: error.message || "Unexpected server error" }, 500);
  }
});

async function migrateOrphanedTalents() {
  const users = await listUsers();
  const admin = users.find((user) => user.role === "admin");
  if (!admin) return;
  const talents = await listTalents();
  const orphaned = talents.filter((talent) => !talent.ownerId);
  for (const talent of orphaned) {
    await updateTalentOwner(talent.id, admin.id);
  }
}

await migrateOrphanedTalents();

server.listen(PORT, () => {
  console.log(`ComfyUI workflow studio running on http://localhost:${PORT}`);
});
