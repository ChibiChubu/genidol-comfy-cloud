import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { extname, normalize, resolve } from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const PUBLIC_DIR = resolve(ROOT, "public");
const WORKFLOW_PATH = resolve(ROOT, "data", "workflow-api.json");
const BASE_URL = "https://cloud.comfy.org";

loadDotEnv();
const PORT = Number(process.env.PORT || 8787);

const WARDROBE = [
  { id: "outfit-a", label: "Outfit A", node: "44", select: 1, filename: "FK_00033_.png", imageUrl: "/assets/wardrobe/FK_00033_.png", tone: "black blazer + denim" },
  { id: "outfit-b", label: "Outfit B", node: "45", select: 2, filename: "FK_00038_.png", imageUrl: "/assets/wardrobe/FK_00038_.png", tone: "cream shirt + black trouser" },
  { id: "outfit-c", label: "Outfit C", node: "53", select: 3, filename: "FK_00042_.png", imageUrl: "/assets/wardrobe/FK_00042_.png", tone: "navy jacket + light denim" },
  { id: "outfit-d", label: "Outfit D", node: "52", select: 4, filename: "FK_00043_.png", imageUrl: "/assets/wardrobe/FK_00043_.png", tone: "white tiered dress" }
];

const OUTPUT_NODE_LABELS = {
  89: "Editorial 1",
  90: "Editorial 2",
  91: "Editorial 3",
  130: "White Studio",
  114: "Final Video"
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/config") {
      return sendJson(res, {
        wardrobe: WARDROBE,
        hasApiKey: Boolean(getApiKey())
      });
    }

    if (req.method === "POST" && url.pathname === "/api/generate") {
      return handleGenerate(req, res);
    }

    if (req.method === "GET" && url.pathname === "/api/view") {
      return proxyComfyView(url, res);
    }

    return serveStatic(url.pathname, res);
  } catch (error) {
    console.error(error);
    sendJson(res, { error: error.message || "Unexpected server error" }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`GenIDOL console running at http://localhost:${PORT}`);
});

async function handleGenerate(req, res) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return sendJson(res, { error: "Missing COMFY_CLOUD_API_KEY. Add it to .env or your shell environment." }, 500);
  }

  const { fields, files } = await parseMultipart(req);
  const refs = ["ref1", "ref2", "ref3"].map((name) => files[name]).filter(Boolean);
  if (refs.length !== 3) {
    return sendJson(res, { error: "Please upload exactly 3 reference images." }, 400);
  }

  const wardrobe = WARDROBE.find((item) => item.id === fields.wardrobe) || WARDROBE[0];
  const uploaded = [];
  for (const file of refs) {
    uploaded.push(await uploadImage(file, apiKey));
  }

  const workflow = JSON.parse(await readFile(WORKFLOW_PATH, "utf8"));
  setImage(workflow, "38", uploaded[0].filename);
  setImage(workflow, "12", uploaded[1].filename);
  setImage(workflow, "37", uploaded[2].filename);
  workflow["47"].inputs.select = wardrobe.select;

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  setPrefix(workflow, "58", `Character Sheet/${runId}`);
  setPrefix(workflow, "50", `Character Wardrobe/${runId}`);
  setPrefix(workflow, "89", `Editorial 1/${runId}`);
  setPrefix(workflow, "90", `Editorial 2/${runId}`);
  setPrefix(workflow, "91", `Editorial 3/${runId}`);
  setPrefix(workflow, "130", `Editorial 4 White/${runId}`);
  setPrefix(workflow, "114", `Final Video/${runId}`);
  randomizeSeeds(workflow);

  const promptId = await submitWorkflow(workflow, apiKey);
  const outputs = await waitForCompletion(promptId, apiKey);
  const assets = collectAssets(outputs);

  sendJson(res, {
    promptId,
    wardrobe,
    outputs: assets,
    rawOutputs: outputs
  });
}

function getApiKey() {
  return process.env.COMFY_CLOUD_API_KEY || "";
}

function loadDotEnv() {
  const envPath = resolve(ROOT, ".env");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
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

async function uploadImage(file, apiKey) {
  const form = new FormData();
  form.set("image", new Blob([file.buffer], { type: file.type || "application/octet-stream" }), file.filename || "reference.png");
  form.set("type", "input");
  form.set("overwrite", "true");

  const response = await fetch(`${BASE_URL}/api/upload/image`, {
    method: "POST",
    headers: { "X-API-Key": apiKey },
    body: form
  });
  const body = await readResponse(response);
  if (!response.ok) throw new Error(`Upload failed: ${body}`);

  const data = JSON.parse(body);
  return {
    filename: data.filename || data.name,
    subfolder: data.subfolder || "",
    type: data.type || "input"
  };
}

async function submitWorkflow(workflow, apiKey) {
  const response = await fetch(`${BASE_URL}/api/prompt`, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      prompt: workflow,
      extra_data: {
        api_key_comfy_org: apiKey
      }
    })
  });
  const body = await readResponse(response);
  if (!response.ok) throw new Error(`Workflow submit failed: ${body}`);
  const data = JSON.parse(body);
  return data.prompt_id;
}

async function waitForCompletion(promptId, apiKey) {
  const timeoutMs = 15 * 60 * 1000;
  const startedAt = Date.now();
  const wsUrl = `wss://cloud.comfy.org/ws?clientId=${crypto.randomUUID()}&token=${encodeURIComponent(apiKey)}`;

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
    const response = await fetch(`${BASE_URL}/api/job/${promptId}/status`, {
      headers: { "X-API-Key": apiKey }
    });
    const body = await readResponse(response);
    if (!response.ok) throw new Error(`Status check failed: ${body}`);
    const data = JSON.parse(body);
    if (["completed", "failed", "cancelled"].includes(data.status)) return data;
    await delay(4000);
  }
  throw new Error("Job status polling timed out.");
}

function collectAssets(outputs) {
  const assets = [];
  const allowedNodes = new Set(Object.keys(OUTPUT_NODE_LABELS));
  for (const [nodeId, output] of Object.entries(outputs)) {
    if (!allowedNodes.has(nodeId)) continue;
    for (const type of ["images", "video", "videos", "gifs", "animated", "audio"]) {
      for (const file of output[type] || []) {
        const isVideo = isVideoFile(file.filename);
        if (nodeId === "114" && !isVideo) continue;

        const params = new URLSearchParams({
          filename: file.filename,
          subfolder: file.subfolder || "",
          type: file.type || "output"
        });
        assets.push({
          nodeId,
          label: OUTPUT_NODE_LABELS[nodeId] || `Node ${nodeId}`,
          kind: isVideo ? "video" : "image",
          filename: file.filename,
          url: `/api/view?${params.toString()}`,
          downloadUrl: `/api/view?${params.toString()}`
        });
      }
    }
  }
  return assets;
}

function isVideoFile(filename = "") {
  return /\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(filename);
}

async function proxyComfyView(url, res) {
  const apiKey = getApiKey();
  if (!apiKey) return sendJson(res, { error: "Missing COMFY_CLOUD_API_KEY." }, 500);

  const response = await fetch(`${BASE_URL}/api/view?${url.searchParams.toString()}`, {
    headers: { "X-API-Key": apiKey },
    redirect: "manual"
  });

  if (response.status === 302) {
    res.writeHead(302, { Location: response.headers.get("location") });
    return res.end();
  }

  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  res.end(Buffer.from(await response.arrayBuffer()));
}

function setImage(workflow, nodeId, filename) {
  workflow[nodeId].inputs.image = filename;
}

function setPrefix(workflow, nodeId, prefix) {
  if (workflow[nodeId]?.inputs?.filename_prefix !== undefined) {
    workflow[nodeId].inputs.filename_prefix = prefix;
  }
}

function randomizeSeeds(workflow) {
  for (const node of Object.values(workflow)) {
    if (node.inputs && Object.hasOwn(node.inputs, "seed")) {
      node.inputs.seed = Math.floor(Math.random() * 2147483647);
    }
  }
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

function trimMultipartTail(buffer) {
  if (buffer.length >= 2 && buffer.at(-2) === 13 && buffer.at(-1) === 10) {
    return buffer.subarray(0, -2);
  }
  return buffer;
}

function readRequest(req) {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolvePromise(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readResponse(response) {
  return await response.text();
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function serveStatic(pathname, res) {
  const requestPath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const filePath = normalize(resolve(PUBLIC_DIR, `.${requestPath}`));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  const contentType = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml"
  }[extname(filePath).toLowerCase()] || "application/octet-stream";

  if (!existsSync(filePath)) {
    res.writeHead(404);
    return res.end("Not found");
  }

  res.writeHead(200, { "Content-Type": contentType });
  createReadStream(filePath).pipe(res);
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
