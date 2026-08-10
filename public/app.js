const state = {
  workflowSummary: null,
  wardrobeGroups: [],
  workflowMode: "character-sheet",
  wardrobeMode: "shirt-pants",
  wardrobeSource: "wardrobe",
  selectedShirtId: "shirt-a",
  selectedPantsId: "pants-a",
  selectedDressId: "dress-a",
  selectedEditorialKey: "editorial-1",
  seed: 135,
  width: 2752,
  height: 1536,
  references: Array.from({ length: 4 }, () => null),
  clientOutfit: null,
  payload: null,
  clientId: crypto.randomUUID(),
  latestOutputs: [],
};

const EDITORIAL_SOURCES = [
  { key: "editorial-1", label: "Editorial 1", nodeId: "280:27", subtitle: "Primary editorial frame" },
  { key: "editorial-2", label: "Editorial 2", nodeId: "290:285", subtitle: "Alternate editorial frame" },
  { key: "editorial-3", label: "Editorial 3", nodeId: "300:295", subtitle: "Alternate editorial frame" },
];

const referenceGrid = document.getElementById("referenceGrid");
const wardrobeModes = document.getElementById("wardrobeModes");
const wardrobeGroupsHost = document.getElementById("wardrobeGroups");
const wardrobeUploadHost = document.getElementById("wardrobeUpload");
const fileInputPool = document.getElementById("fileInputPool");
const promptInput = document.getElementById("promptInput");
const payloadPreview = document.getElementById("payloadPreview");
const activeNodeLabel = document.getElementById("activeNodeLabel");
const workflowLabel = document.getElementById("workflowLabel");
const modeLabel = document.getElementById("modeLabel");
const selectionHint = document.getElementById("selectionHint");
const clientOutfitToggleBtn = document.getElementById("clientOutfitToggleBtn");
const generateCharacterBtn = document.getElementById("generateCharacterBtn");
const keyStatus = document.getElementById("keyStatus");
const toast = document.getElementById("toast");
const steps = Array.from(document.querySelectorAll("#steps li"));

const fileInputs = [];

const referenceMeta = [
  { title: "Reference 1", subtitle: "Primary face" },
  { title: "Reference 2", subtitle: "Angle / hair" },
  { title: "Reference 3", subtitle: "Body / pose" },
  { title: "Reference 4", subtitle: "Body pose from behind" },
];

const WARDROBE_MODE_META = [
  { key: "shirt", label: "Shirt" },
  { key: "pants", label: "Pants" },
  { key: "shirt-pants", label: "Shirt + Pants" },
  { key: "dress", label: "Dress" },
];

const WARDROBE_SELECTION_BY_MODE = {
  shirt: ["shirt"],
  pants: ["pants"],
  "shirt-pants": ["shirt", "pants"],
  dress: ["dress"],
};

mountHiddenInputs();
await init().catch((error) => {
  keyStatus.textContent = "Comfy Cloud unavailable";
  keyStatus.classList.add("bad");
  showToast(error instanceof Error ? error.message : "Failed to initialize workflow studio", true);
});

async function init() {
  const response = await fetch("/api/intake");
  const data = await response.json();

  state.workflowSummary = data.workflow ?? null;
  state.wardrobeGroups = data.wardrobeGroups ?? [];

  keyStatus.textContent = data.hasApiKey ? "Comfy Cloud key connected" : "Missing Comfy Cloud key";
  keyStatus.classList.add(data.hasApiKey ? "ok" : "bad");

  if (state.workflowSummary?.modes?.length) {
    state.workflowMode = state.workflowSummary.modes[0].key || state.workflowMode;
    promptInput.value = state.workflowSummary.modes[0].prompt || "";
  }

  renderReferenceUploads();
  renderWardrobeModes();
  renderWardrobeGroups();
  renderClientOutfitUpload();
  bindUploads();
  updateSelectionLabels();
  try {
    await refreshPayload();
  } catch {
    // Keep the UI alive even when the preview endpoint is temporarily unavailable.
  }
}

function bindUploads() {
  fileInputs.forEach((input, index) => {
    input.addEventListener("change", () => {
      syncReferenceSlot(index, input.files?.[0] ?? null);
      renderReferenceUploads();
      void refreshPayload().catch(() => {});
    });
  });
}

function syncReferenceSlot(index, file) {
  const previous = state.references[index];
  if (previous?.previewUrl) {
    URL.revokeObjectURL(previous.previewUrl);
  }

  state.references[index] = file
    ? {
        file,
        name: file.name,
        sizeLabel: formatFileSize(file.size),
        previewUrl: URL.createObjectURL(file),
      }
    : null;
}

function syncClientOutfit(file) {
  const previous = state.clientOutfit;
  if (previous?.previewUrl) {
    URL.revokeObjectURL(previous.previewUrl);
  }

  state.clientOutfit = file
    ? {
        file,
        name: file.name,
        sizeLabel: formatFileSize(file.size),
        previewUrl: URL.createObjectURL(file),
      }
    : null;
}

function renderReferenceUploads() {
  referenceGrid.innerHTML = "";

  for (let index = 0; index < 4; index += 1) {
    const input = fileInputs[index];
    const slot = state.references[index];
    referenceGrid.appendChild(
      createPreviewCard({
        slot,
        title: referenceMeta[index].title,
        subtitle: referenceMeta[index].subtitle,
        onPick: () => input.click(),
        kind: "reference",
      }),
    );
  }
}

function renderWardrobeModes() {
  wardrobeModes.innerHTML = "";

  const bar = document.createElement("div");
  bar.className = "mode-bar";

  for (const mode of WARDROBE_MODE_META) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `mode-chip ${state.wardrobeMode === mode.key ? "active" : ""}`;
    button.disabled = state.wardrobeSource === "client" && Boolean(state.clientOutfit);
    button.textContent = mode.label;
    button.addEventListener("click", () => {
      if (button.disabled) return;
      state.wardrobeMode = mode.key;
      state.wardrobeSource = "wardrobe";
      renderWardrobeModes();
      renderWardrobeGroups();
      renderClientOutfitUpload();
      void refreshPayload().catch(() => {});
    });
    bar.appendChild(button);
  }

  wardrobeModes.appendChild(bar);
}

function renderWardrobeGroups() {
  wardrobeGroupsHost.innerHTML = "";

  if (state.wardrobeMode === "shirt-pants") {
    wardrobeGroupsHost.appendChild(renderWardrobeGroup("shirt", "Shirt", "top only", state.selectedShirtId));
    wardrobeGroupsHost.appendChild(renderWardrobeGroup("pants", "Pants", "bottom only", state.selectedPantsId));
    return;
  }

  if (state.wardrobeMode === "shirt") {
    wardrobeGroupsHost.appendChild(renderWardrobeGroup("shirt", "Shirt", "top only", state.selectedShirtId));
    return;
  }

  if (state.wardrobeMode === "pants") {
    wardrobeGroupsHost.appendChild(renderWardrobeGroup("pants", "Pants", "bottom only", state.selectedPantsId));
    return;
  }

  if (state.wardrobeMode === "dress") {
    wardrobeGroupsHost.appendChild(renderWardrobeGroup("dress", "Dress", "one piece", state.selectedDressId));
  }
}

function renderWardrobeGroup(groupId, label, tone, selectedItemId) {
  const group = state.wardrobeGroups.find((entry) => entry.id === groupId) || { items: [] };
  const section = document.createElement("section");
  section.className = "wardrobe-group";

  section.innerHTML = `
    <div class="section-title">
      <span class="section-badge">02</span>
      <div>
        <h2>${escapeHtml(label)}</h2>
        <p>${escapeHtml(tone)}</p>
      </div>
    </div>
  `;

  const items = document.createElement("div");
  items.className = "wardrobe-items";

  for (const item of group.items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `wardrobe-card ${state.wardrobeSource === "wardrobe" && selectedItemId === item.id ? "active" : ""}`;
    button.disabled = state.wardrobeSource === "client" && Boolean(state.clientOutfit);
    button.innerHTML = `
      <div class="wardrobe-art">
        <img src="${item.imageUrl}" alt="${escapeHtml(item.label)}" />
      </div>
      <div class="wardrobe-meta">
        <strong>${escapeHtml(item.label)}</strong>
        <span>${escapeHtml(item.tone || tone)}</span>
      </div>
    `;

    const img = button.querySelector("img");
    img.addEventListener("error", () => {
      img.onerror = null;
      img.src = wardrobeFallback(item.label, item.tone || tone);
    });

    button.addEventListener("click", () => {
      if (button.disabled) return;
      state.wardrobeSource = "wardrobe";
      if (groupId === "shirt") state.selectedShirtId = item.id;
      if (groupId === "pants") state.selectedPantsId = item.id;
      if (groupId === "dress") state.selectedDressId = item.id;
      renderWardrobeGroups();
      renderClientOutfitUpload();
      void refreshPayload().catch(() => {});
    });
    items.appendChild(button);
  }

  section.appendChild(items);
  return section;
}

function renderClientOutfitUpload() {
  wardrobeUploadHost.innerHTML = "";

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.hidden = true;
  input.addEventListener("change", () => {
    syncClientOutfit(input.files?.[0] ?? null);
    state.wardrobeSource = state.clientOutfit ? "client" : "wardrobe";
    renderWardrobeGroups();
    renderWardrobeModes();
    renderClientOutfitUpload();
    void refreshPayload().catch(() => {});
  });

  const card = createPreviewCard({
    slot: state.clientOutfit,
    title: "Uploaded by Client",
    subtitle: "Client outfit source",
    kind: "outfit",
    active: state.wardrobeSource === "client" && Boolean(state.clientOutfit),
    onPick: () => input.click(),
  });

  wardrobeUploadHost.appendChild(input);
  wardrobeUploadHost.appendChild(card);

  if (clientOutfitToggleBtn) {
    clientOutfitToggleBtn.disabled = !state.clientOutfit;
    clientOutfitToggleBtn.classList.toggle("active", state.wardrobeSource === "client" && Boolean(state.clientOutfit));
    clientOutfitToggleBtn.textContent =
      state.wardrobeSource === "client" && state.clientOutfit ? "Client outfit active" : "Use client outfit";
    clientOutfitToggleBtn.onclick = () => {
      if (!state.clientOutfit) return;
      state.wardrobeSource = state.wardrobeSource === "client" ? "wardrobe" : "client";
      renderWardrobeModes();
      renderWardrobeGroups();
      renderClientOutfitUpload();
      void refreshPayload().catch(() => {});
    };
  }
}

function createPreviewCard({ slot, title, subtitle, onPick, kind, active = false }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `upload-card ${slot?.previewUrl ? "filled" : ""} ${active ? "active" : ""}`;
  button.innerHTML = `
    <div class="upload-preview ${kind}-preview ${slot?.previewUrl ? "has-image" : ""}">
      ${
        slot?.previewUrl
          ? `<img src="${slot.previewUrl}" alt="${escapeHtml(title)}" />`
          : `<span class="upload-icon">⤴</span>`
      }
    </div>
    <div class="upload-meta">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(slot?.name ?? subtitle)}</span>
      <small>${escapeHtml(slot?.sizeLabel ?? (kind === "outfit" ? "Upload client outfit" : "Drop or choose an image"))}</small>
    </div>
  `;
  button.addEventListener("click", onPick);
  return button;
}

function mountHiddenInputs() {
  for (let index = 0; index < 4; index += 1) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.hidden = true;
    fileInputs.push(input);
    fileInputPool.appendChild(input);
  }
}

function getEditorialSource() {
  return EDITORIAL_SOURCES.find((source) => source.key === state.selectedEditorialKey) || EDITORIAL_SOURCES[0];
}

function getReferencePayload() {
  return state.references.map((ref, index) =>
    ref
      ? {
          slot: index + 1,
          kind: index === 3 ? "body-pose-from-behind" : "reference",
          name: ref.name,
          size: ref.file.size,
        }
      : null,
  );
}

function getWardrobePayload() {
  return {
    mode: state.wardrobeMode,
    source: state.wardrobeSource,
    shirtId: state.selectedShirtId,
    pantsId: state.selectedPantsId,
    dressId: state.selectedDressId,
  };
}

async function refreshPayload() {
  modeLabel.textContent = state.workflowMode;
  selectionHint.textContent = state.wardrobeSource === "client"
    ? "Client outfit selected. Wardrobe cards are cleared."
    : "Ready for character download.";

  try {
    const response = await fetch("/api/workflow/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: state.clientId,
        mode: state.workflowMode,
        prompt: promptInput.value,
        seed: state.seed,
        width: state.width,
        height: state.height,
        wardrobe: getWardrobePayload(),
        clientOutfit: state.clientOutfit
          ? {
              name: state.clientOutfit.name,
              size: state.clientOutfit.file.size,
            }
          : null,
        references: getReferencePayload(),
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message || payload.error || "Workflow preview failed");
    }

    state.payload = payload;
    activeNodeLabel.textContent = `${state.payload.activeNodeTitle} (${state.payload.activeNodeId})`;
    payloadPreview.textContent = JSON.stringify(state.payload, null, 2);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workflow preview failed";
    payloadPreview.textContent = JSON.stringify({ error: message }, null, 2);
    activeNodeLabel.textContent = "Unavailable";
    throw error;
  }
}

function updateSelectionLabels() {
  selectionHint.textContent = state.wardrobeSource === "client"
    ? "Client outfit selected. Wardrobe cards are cleared."
    : "Ready for character download.";
  generateCharacterBtn.disabled = false;
}

async function runGeneration(mode) {
  if (state.references.some((ref) => !ref?.file)) {
    showToast("Please upload all 4 reference images first.", true);
    return;
  }

  const button = generateCharacterBtn;
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Generating character download...";
  setStep(2);

  try {
    const formData = new FormData();
    formData.set("client_id", state.clientId);
    formData.set("mode", mode);
    formData.set("prompt", promptInput.value);
    formData.set("seed", String(state.seed));
    formData.set("width", String(state.width));
    formData.set("height", String(state.height));
    formData.set("wardrobe", JSON.stringify(getWardrobePayload()));
    formData.set("selectedEditorialNodeId", getEditorialSource().nodeId);
    formData.set("references", JSON.stringify(getReferencePayload()));
    if (state.clientOutfit?.file) {
      formData.set("clientOutfit", state.clientOutfit.file, state.clientOutfit.file.name);
    }

    state.references.forEach((ref, index) => {
      if (ref?.file) {
        formData.set(`ref${index + 1}`, ref.file, ref.file.name);
      }
    });

    const response = await fetch("/api/workflow/run", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || payload.message || "Generation failed");

    if (payload.outputs?.length) {
      state.latestOutputs = payload.outputs;
      renderResults(payload.outputs);

    }

    state.workflowMode = mode;
    updateSelectionLabels();
    await refreshPayload();
    setStep(2);
    showToast("Character download generated.");
  } catch (error) {
    showToast(error.message, true);
    resultGridEmptyState(error.message);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function renderResults(outputs) {
  const resultGrid = document.getElementById("resultGrid");
  const order = ["209", "89", "90", "91"];
  const filtered = outputs
    .filter((asset) => order.includes(String(asset.nodeId)))
    .sort((a, b) => order.indexOf(String(a.nodeId)) - order.indexOf(String(b.nodeId)));

  if (!filtered.length) {
    resultGridEmptyState("Job completed, but final outputs were not returned.");
    return;
  }

  resultGrid.className = "result-grid";
  resultGrid.innerHTML = filtered
    .map((asset) => {
      const media =
        asset.kind === "video"
          ? `<video src="${asset.url}" controls playsinline preload="metadata"></video>`
          : `<img src="${asset.url}" alt="${escapeHtml(asset.label)}">`;
      return `
        <figure class="asset" data-node-id="${escapeHtml(asset.nodeId)}">
          <div class="asset-media">${media}</div>
          <figcaption>
            <strong>${escapeHtml(asset.label)}</strong>
            <a class="download-btn" href="${asset.downloadUrl || asset.url}" download="${escapeHtml(asset.filename)}">Download file</a>
          </figcaption>
        </figure>
      `;
    })
    .join("");

  resultGrid.querySelectorAll(".asset").forEach((card) => {
    card.addEventListener("click", () => {
      const nodeId = card.getAttribute("data-node-id");
      void refreshPayload().catch(() => {});
    });
  });
}

function resultGridEmptyState(message) {
  const resultGrid = document.getElementById("resultGrid");
  resultGrid.className = "result-grid empty";
  resultGrid.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function setStep(index) {
  steps.forEach((step, stepIndex) => {
    step.classList.toggle("active", stepIndex === index);
    step.classList.toggle("done", stepIndex < index);
  });
}

function showToast(message, error = false) {
  toast.hidden = false;
  toast.textContent = message;
  toast.classList.toggle("error", error);
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.hidden = true;
  }, 4200);
}

function formatFileSize(bytes) {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size < 10 && index > 0 ? 1 : 0)} ${units[index]}`;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

function wardrobeFallback(label, tone) {
  const safeLabel = escapeHtml(label);
  const safeTone = escapeHtml(tone);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
      <defs>
        <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#12141a" />
          <stop offset="100%" stop-color="#1b1f2a" />
        </linearGradient>
      </defs>
      <rect width="640" height="640" fill="url(#g)" />
      <rect x="44" y="44" width="552" height="552" rx="18" fill="none" stroke="rgba(255,255,255,.16)" stroke-dasharray="10 8"/>
      <text x="70" y="150" fill="#f3c567" font-size="56" font-family="Space Mono, monospace">${safeLabel}</text>
      <text x="70" y="210" fill="#7f8596" font-size="26" font-family="Space Grotesk, sans-serif">${safeTone}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

generateCharacterBtn.addEventListener("click", () => {
  state.workflowMode = "character-sheet";
  renderWardrobeModes();
  void runGeneration("character-sheet");
});

promptInput.addEventListener("input", () => {
  refreshPayload().catch(() => {});
});
