import { createTalent, cancelGeneration } from "./api.js";
import { showToast } from "./util.js";
import { refresh } from "./router.js";

const queue = [];
let processing = false;
const listeners = new Set();

function notify() {
  const snapshot = getQueueSnapshot();
  listeners.forEach((fn) => fn(snapshot));
}

export function onQueueChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getQueueSnapshot() {
  return queue.map(({ id, name, status, talent, errorMessage }) => ({ id, name, status, talent, errorMessage }));
}

export function getJob(id) {
  return queue.find((job) => job.id === id) ?? null;
}

export function enqueueGeneration(name, formData) {
  const id = crypto.randomUUID();
  queue.push({
    id,
    name,
    formData,
    status: "queued",
    requestId: null,
    abortController: null,
    talent: null,
    errorMessage: null,
  });
  notify();
  processQueue();
  return id;
}

export function cancelQueuedJob(id) {
  const job = queue.find((item) => item.id === id);
  if (!job) return;
  if (job.status === "generating") {
    job.abortController?.abort();
    if (job.requestId) cancelGeneration(job.requestId).catch(() => {});
  } else if (job.status === "queued") {
    queue.splice(queue.indexOf(job), 1);
    notify();
  }
}

async function processQueue() {
  if (processing) return;
  const next = queue.find((job) => job.status === "queued");
  if (!next) return;
  processing = true;

  next.status = "generating";
  next.requestId = crypto.randomUUID();
  next.abortController = new AbortController();
  next.formData.set("requestId", next.requestId);
  notify();

  try {
    const talent = await createTalent(next.formData, next.abortController.signal);
    next.status = "done";
    next.talent = talent;
    notify();
    showToast(`"${talent.name}" generated and saved to the library.`);
  } catch (error) {
    const cancelled = error?.name === "AbortError";
    next.status = "error";
    next.errorMessage = cancelled ? "Cancelled." : error.message;
    notify();
    if (!cancelled) showToast(`"${next.name}" failed: ${error.message}`, true);
  } finally {
    const index = queue.indexOf(next);
    if (index !== -1) queue.splice(index, 1);
    processing = false;
    notify();
    refresh();
    processQueue();
  }
}
