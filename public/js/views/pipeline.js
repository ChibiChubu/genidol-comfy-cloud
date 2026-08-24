import { getIntake } from "../api.js";
import { createWardrobeController } from "../wardrobe.js";
import { escapeHtml, formatFileSize, showToast } from "../util.js";
import { goToTalent } from "../router.js";
import { enqueueGeneration, cancelQueuedJob, getJob, onQueueChange } from "../queue.js";
import { setPendingVoiceAudio } from "../pendingAudio.js";

const REF_META = [
  { title: "Reference 1", subtitle: "Primary face" },
  { title: "Reference 2", subtitle: "Angle / hair" },
  { title: "Reference 3", subtitle: "Body / pose" },
  { title: "Reference 4", subtitle: "Body pose from behind" },
];

const OUTPUT_ORDER = [
  ["characterDownload", "Character download"],
  ["editorial1", "Editorial 1"],
  ["editorial2", "Editorial 2"],
  ["editorial3", "Editorial 3"],
];

const NAMES = ["Name & assets", "Wardrobe selection", "Generate & review"];
const VERBS = ["Select wardrobe", "Review & generate"];
const TOTAL = 3;

let els = null;
let fileInputs = [];
let cur = 0;
let references = [null, null, null, null];
let wardrobeController = null;
let intakeLoaded = false;

let currentJobId = null;
let currentJobStatus = null;
let currentJobTalent = null;
let currentJobError = null;
let cancelRequested = false;

function q(id) {
  return document.getElementById(id);
}

function bindOnce() {
  if (els) return;
  els = {
    overlay: q("overlay"),
    scrim: q("overlayScrim"),
    closeBtn: q("pClose"),
    backBtn: q("pBack"),
    primaryBtn: q("pPrimary"),
    crumb: q("pCrumb"),
    count: q("pCount"),
    rail: Array.from(document.querySelectorAll("#rail .nav")),
    panels: Array.from(document.querySelectorAll("#pStage .panel")),
    refGrid: q("refGrid"),
    twinName: q("twinName"),
    twinHeight: q("twinHeight"),
    twinEyes: q("twinEyes"),
    twinHair: q("twinHair"),
    twinVoiceAudio: q("twinVoiceAudio"),
    fileInputPool: q("fileInputPool"),
    wardrobeModes: q("wardrobeModes"),
    wardrobeGroups: q("wardrobeGroups"),
    cancelBtn: q("pCancel"),
    genStatus: q("genStatus"),
    genResults: q("genResults"),
    genVideoHost: q("genVideoHost"),
  };

  for (let i = 0; i < 4; i += 1) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.hidden = true;
    input.addEventListener("change", () => {
      syncRef(i, input.files?.[0] ?? null);
      renderRefs();
    });
    fileInputs.push(input);
    els.fileInputPool.appendChild(input);
  }

  els.scrim.addEventListener("click", closePipeline);
  els.closeBtn.addEventListener("click", closePipeline);
  els.backBtn.addEventListener("click", () => go(cur - 1));
  els.primaryBtn.addEventListener("click", onPrimary);
  els.cancelBtn.addEventListener("click", onCancel);
  els.rail.forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.i);
      if (i <= cur) go(i);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (els.overlay.hidden) return;
    if (event.key === "Escape") closePipeline();
  });

  onQueueChange(() => {
    syncCurrentJob();
    if (!els.overlay.hidden) {
      updateGenStatus();
      render();
    }
  });
}

function syncRef(index, file) {
  const previous = references[index];
  if (previous?.previewUrl) URL.revokeObjectURL(previous.previewUrl);
  references[index] = file
    ? { file, name: file.name, sizeLabel: formatFileSize(file.size), previewUrl: URL.createObjectURL(file) }
    : null;
}

function renderRefs() {
  els.refGrid.innerHTML = "";
  for (let i = 0; i < 4; i += 1) {
    const meta = REF_META[i];
    const slot = references[i];
    const card = document.createElement("button");
    card.type = "button";
    card.className = `thumb upload ${slot ? "filled" : ""}`;
    card.innerHTML = slot
      ? `<img src="${slot.previewUrl}" alt="${escapeHtml(meta.title)}">`
      : `<span class="ph"><svg class="ic" style="width:20px;height:20px"><use href="#i-image"/></svg>${escapeHtml(meta.title)}<br><small>${escapeHtml(meta.subtitle)}</small></span>`;
    card.addEventListener("click", () => fileInputs[i].click());
    els.refGrid.appendChild(card);
  }
}

async function ensureIntake() {
  if (intakeLoaded) return;
  const data = await getIntake();
  wardrobeController = createWardrobeController({
    wardrobeGroups: data.wardrobeGroups ?? [],
    modesHost: els.wardrobeModes,
    groupsHost: els.wardrobeGroups,
    onChange: () => {},
  });
  intakeLoaded = true;
}

function inProgress() {
  return currentJobStatus === "queued" || currentJobStatus === "generating";
}

function render() {
  els.panels.forEach((panel, i) => {
    const was = panel.classList.contains("active");
    panel.classList.toggle("active", i === cur);
    if (i === cur && !was) {
      const anim = panel.querySelector(".panel-anim");
      anim.style.animation = "none";
      void anim.offsetHeight;
      anim.style.animation = "";
    }
  });
  els.rail.forEach((btn, i) => {
    btn.classList.toggle("on", i === cur);
    btn.classList.toggle("done", i < cur);
    btn.querySelector(".node").innerHTML =
      i < cur ? `<svg class="ic" style="width:15px;height:15px"><use href="#i-check"/></svg>` : String(i + 1);
  });
  els.crumb.textContent = NAMES[cur];
  els.count.textContent = `Stage ${cur + 1} / ${TOTAL}`;
  els.backBtn.disabled = cur === 0 || inProgress();
  els.cancelBtn.hidden = !inProgress();
  els.cancelBtn.disabled = cancelRequested;
  els.cancelBtn.textContent = cancelRequested
    ? "Cancelling..."
    : currentJobStatus === "queued"
      ? "Cancel (remove from queue)"
      : "Cancel generate";
  els.closeBtn.disabled = false;

  const last = cur === TOTAL - 1;
  if (last) {
    if (currentJobStatus === "done" && currentJobTalent) {
      els.primaryBtn.innerHTML = `<svg class="ic"><use href="#i-check"/></svg> View twin`;
      els.primaryBtn.disabled = false;
    } else {
      els.primaryBtn.textContent = inProgress()
        ? currentJobStatus === "queued" ? "Queued..." : "Generating..."
        : "Generate twin";
      els.primaryBtn.disabled = inProgress();
    }
  } else {
    els.primaryBtn.innerHTML = `${VERBS[cur]} <svg class="ic"><use href="#i-right"/></svg>`;
    els.primaryBtn.disabled = false;
  }
}

function go(i) {
  cur = Math.max(0, Math.min(TOTAL - 1, i));
  render();
}

function validateStage(i) {
  if (i === 0) {
    if (!els.twinName.value.trim()) {
      showToast("Please name this twin first.", true);
      return false;
    }
    if (references.some((ref) => !ref?.file)) {
      showToast("Please upload all 4 reference photos.", true);
      return false;
    }
  }
  return true;
}

async function onPrimary() {
  if (cur < TOTAL - 1) {
    if (!validateStage(cur)) return;
    if (cur === 0) await ensureIntake();
    go(cur + 1);
    return;
  }
  if (currentJobStatus === "done" && currentJobTalent) {
    const id = currentJobTalent.id;
    setPendingVoiceAudio(els.twinVoiceAudio.files?.[0] ?? null);
    closePipeline();
    goToTalent(id);
    return;
  }
  if (!inProgress()) startGeneration();
}

function syncCurrentJob() {
  if (!currentJobId) return;
  const job = getJob(currentJobId);
  if (!job) return;
  currentJobStatus = job.status;
  if (job.talent) currentJobTalent = job.talent;
  if (job.errorMessage) currentJobError = job.errorMessage;
}

function startGeneration() {
  const formData = new FormData();
  const name = els.twinName.value.trim();
  formData.set("name", name);
  formData.set("height", els.twinHeight.value.trim());
  formData.set("eyes", els.twinEyes.value.trim());
  formData.set("hair", els.twinHair.value.trim());
  formData.set("mode", "character-sheet");
  formData.set("wardrobe", JSON.stringify(wardrobeController.getPayload()));
  formData.set("selectedEditorialNodeId", "editorial-1");
  for (let i = 0; i < 4; i += 1) {
    formData.set(`ref${i + 1}`, references[i].file, references[i].name);
  }
  const clientFile = wardrobeController.getClientOutfitFile();
  if (clientFile) formData.set("clientOutfit", clientFile, clientFile.name);

  cancelRequested = false;
  currentJobTalent = null;
  currentJobError = null;
  els.genResults.hidden = true;
  els.genResults.innerHTML = "";
  els.genVideoHost.innerHTML = "";

  currentJobId = enqueueGeneration(name, formData);
  currentJobStatus = "queued";
  syncCurrentJob();
  updateGenStatus();
  render();
}

function onCancel() {
  if (!currentJobId || !inProgress()) return;
  cancelRequested = true;
  render();
  cancelQueuedJob(currentJobId);
}

function updateGenStatus() {
  if (currentJobStatus === "queued") {
    els.genStatus.innerHTML = `<div class="review-note"><span class="spin"></span> Queued — another twin is generating first. This one starts automatically.</div>`;
  } else if (currentJobStatus === "generating") {
    els.genStatus.innerHTML = `<div class="review-note"><span class="spin"></span> Generating character download, editorials, and video — this can take a few minutes. You can close this and start another twin; this one keeps going in the background.</div>`;
  } else if (currentJobStatus === "done" && currentJobTalent) {
    els.genStatus.innerHTML = `<div class="review-note"><svg class="ic" style="color:var(--mint);width:16px;height:16px"><use href="#i-check"/></svg> Saved to your library as "${escapeHtml(currentJobTalent.name)}".</div>`;
    renderReview(currentJobTalent);
  } else if (currentJobStatus === "error") {
    els.genStatus.innerHTML = `<div class="review-note" style="border-color:#e0607a;color:#e0607a">${escapeHtml(currentJobError || "Generation failed.")}</div>`;
  }
}

function renderReview(talent) {
  els.genResults.hidden = false;
  els.genResults.innerHTML = OUTPUT_ORDER.map(([key, label]) => {
    const asset = talent.assets?.[key];
    if (!asset) return "";
    return `
      <div>
        <div class="vp filled">
          <span class="tag pill iris" style="font-size:11px;padding:3px 9px">${escapeHtml(label)}</span>
          <img src="${asset.url}" alt="${escapeHtml(label)}">
        </div>
        <div style="margin-top:10px"><a class="btn sm" href="${asset.url}" download><svg class="ic" style="width:14px;height:14px"><use href="#i-download"/></svg> Download</a></div>
      </div>
    `;
  }).join("");

  const video = talent.assets?.video;
  els.genVideoHost.innerHTML = video
    ? `
      <div class="player" style="margin-top:16px;width:272px">
        <video src="${video.url}" controls playsinline></video>
        <div style="margin-top:10px"><a class="btn sm" href="${video.url}" download><svg class="ic" style="width:14px;height:14px"><use href="#i-download"/></svg> Download video</a></div>
      </div>
    `
    : "";
}

export function openPipeline() {
  bindOnce();
  cur = 0;
  currentJobId = null;
  currentJobStatus = null;
  currentJobTalent = null;
  currentJobError = null;
  cancelRequested = false;
  intakeLoaded = false;
  wardrobeController = null;
  references = [null, null, null, null];
  els.twinName.value = "";
  els.twinHeight.value = "";
  els.twinEyes.value = "";
  els.twinHair.value = "";
  els.twinVoiceAudio.value = "";
  els.genStatus.innerHTML = "";
  els.genResults.hidden = true;
  els.genResults.innerHTML = "";
  els.genVideoHost.innerHTML = "";
  els.wardrobeModes.innerHTML = "";
  els.wardrobeGroups.innerHTML = "";
  renderRefs();
  render();
  els.overlay.hidden = false;
  document.body.classList.add("locked");
}

function closePipeline() {
  els.overlay.hidden = true;
  document.body.classList.remove("locked");
}
