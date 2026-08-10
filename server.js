import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import {
  buildComfyUIPayload,
  getWorkflowSummary,
  loadWorkflowGraph,
} from "./lib/workflow.js";

const ROOT = resolve(".");
const PUBLIC_DIR = join(ROOT, "public");
const COMFYUI_ENV_PATH = resolve("C:/Users/Administrator/Documents/Comfyui/.env.local");

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

function sendJson(res, data, status = 200) {
  send(res, status, data);
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
    res.writeHead(200, {
      "Content-Type": CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
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

async function waitForCompletion(promptId, apiKey) {
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
        ws.close();
        resolvePromise(outputs);
      }

      if (message.type === "execution_error") {
        clearTimeout(timer);
        ws.close();
        reject(new Error(data.exception_message || "Comfy Cloud execution failed."));
      }
    });

    ws.addEventListener("error", async () => {
      try {
        const status = await pollJobStatus(promptId, apiKey, startedAt, timeoutMs);
        if (status.status === "completed") {
          resolvePromise(outputs);
        } else {
          reject(new Error(`WebSocket failed and job status is ${status.status || "unknown"}.`));
        }
      } catch (error) {
        reject(error);
      }
    });
  });
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

async function proxyComfyView(res, url) {
  const apiKey = getApiKey();
  if (!apiKey) {
    sendJson(res, { error: "Missing COMFY_CLOUD_API_KEY." }, 500);
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

function getApiKey() {
  return process.env.COMFY_CLOUD_API_KEY || "";
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

    if (req.method === "GET" && url.pathname === "/api/workflow") {
      sendJson(res, {
        summary: workflowSummary,
        workflow: workflowGraph,
        wardrobeGroups,
        hasApiKey: Boolean(getApiKey()),
        comfyuiEndpoint: COMFYUI_ENDPOINT,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/intake") {
      sendJson(res, {
        workflow: workflowSummary,
        wardrobeGroups,
        hasApiKey: Boolean(getApiKey()),
        comfyuiEndpoint: COMFYUI_ENDPOINT,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/workflow/render") {
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
          hasApiKey: Boolean(getApiKey()),
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
      try {
        const apiKey = getApiKey();
        if (!apiKey) {
          sendJson(res, { error: "Missing COMFY_CLOUD_API_KEY in .env.local." }, 500);
          return;
        }

        const { fields, files } = await parseMultipart(req);
        const body = normalizeBody(fields);
        const references = ["ref1", "ref2", "ref3", "ref4"].map((name) => files[name]).filter(Boolean);
        if (references.length !== 4) {
          sendJson(res, { error: "Please upload exactly 4 reference images." }, 400);
          return;
        }

        const uploadedRefs = [];
        for (const file of references) {
          uploadedRefs.push(await uploadImage(file, apiKey));
        }

        if (files.clientOutfit) {
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

        const promptId = await submitWorkflow(workflow, apiKey);
        const outputs = await waitForCompletion(promptId, apiKey);
        const assets = collectAssets(workflow, outputs);

        sendJson(res, {
          promptId,
          mode: body.mode ?? "character-sheet",
          activeNodeId: payload.activeNodeId,
          activeNodeTitle: payload.activeNodeTitle,
          selectedEditorialNodeId: payload.selectedEditorialNodeId,
          outputs: assets,
          rawOutputs: outputs,
        });
      } catch (error) {
        sendJson(res, {
          error: "Workflow execution failed",
          message: error instanceof Error ? error.message : "Unknown error",
        }, 400);
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/view") {
      await proxyComfyView(res, url);
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

server.listen(PORT, () => {
  console.log(`ComfyUI workflow studio running on http://localhost:${PORT}`);
});
