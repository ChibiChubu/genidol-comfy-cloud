import { getIntake, createTalent, cancelGeneration } from "../api.js";
import { createWardrobeController } from "../wardrobe.js";
import { escapeHtml, formatFileSize, showToast } from "../util.js";
import { goToTalent } from "../router.js";

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
let generating = false;
let savedTalentId = null;
let abortController = null;
let currentRequestId = null;
let cancelling = false;

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
  els.backBtn.disabled = cur === 0 || generating;
  els.cancelBtn.hidden = !generating;
  els.cancelBtn.disabled = cancelling;
  els.cancelBtn.textContent = cancelling ? "Cancelling..." : "Cancel generate";
  els.closeBtn.disabled = generating;

  const last = cur === TOTAL - 1;
  if (last) {
    if (savedTalentId) {
      els.primaryBtn.innerHTML = `<svg class="ic"><use href="#i-check"/></svg> View twin`;
      els.primaryBtn.disabled = false;
    } else {
      els.primaryBtn.textContent = generating ? "Generating..." : "Generate twin";
      els.primaryBtn.disabled = generating;
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
  if (savedTalentId) {
    const id = savedTalentId;
    closePipeline();
    goToTalent(id);
    return;
  }
  await runGeneration();
}

async function runGeneration() {
  generating = true;
  cancelling = false;
  savedTalentId = null;
  currentRequestId = crypto.randomUUID();
  abortController = new AbortController();
  els.genResults.hidden = true;
  els.genResults.innerHTML = "";
  els.genVideoHost.innerHTML = "";
  els.genStatus.innerHTML = `<div class="review-note"><span class="spin"></span> Generating character download, editorials, and video — this can take a few minutes...</div>`;
  render();

  try {
    const formData = new FormData();
    formData.set("requestId", currentRequestId);
    formData.set("name", els.twinName.value.trim());
    formData.set("mode", "character-sheet");
    formData.set("wardrobe", JSON.stringify(wardrobeController.getPayload()));
    formData.set("selectedEditorialNodeId", "editorial-1");
    for (let i = 0; i < 4; i += 1) {
      formData.set(`ref${i + 1}`, references[i].file, references[i].name);
    }
    const clientFile = wardrobeController.getClientOutfitFile();
    if (clientFile) formData.set("clientOutfit", clientFile, clientFile.name);

    const talent = await createTalent(formData, abortController.signal);
    savedTalentId = talent.id;
    els.genStatus.innerHTML = `<div class="review-note"><svg class="ic" style="color:var(--mint);width:16px;height:16px"><use href="#i-check"/></svg> Saved to your library as "${escapeHtml(talent.name)}".</div>`;
    renderReview(talent);
    showToast("New twin generated and saved to the library.");
  } catch (error) {
    const cancelled = error?.name === "AbortError";
    els.genStatus.innerHTML = cancelled
      ? `<div class="review-note">Generation cancelled.</div>`
      : `<div class="review-note" style="border-color:#e0607a;color:#e0607a">${escapeHtml(error.message)}</div>`;
    if (!cancelled) showToast(error.message, true);
  } finally {
    generating = false;
    cancelling = false;
    abortController = null;
    currentRequestId = null;
    render();
  }
}

async function onCancel() {
  if (!generating || cancelling || !currentRequestId) return;
  cancelling = true;
  render();
  if (abortController) abortController.abort();
  try {
    await cancelGeneration(currentRequestId);
  } catch {
    // Ignore — the generation may have already finished server-side.
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
  generating = false;
  cancelling = false;
  currentRequestId = null;
  savedTalentId = null;
  intakeLoaded = false;
  wardrobeController = null;
  references = [null, null, null, null];
  els.twinName.value = "";
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
  if (generating) {
    showToast("Cancel the generation first.", true);
    return;
  }
  els.overlay.hidden = true;
  document.body.classList.remove("locked");
}
