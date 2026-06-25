const form = document.querySelector("#generateForm");
const wardrobeGrid = document.querySelector("#wardrobeGrid");
const resultGrid = document.querySelector("#resultGrid");
const keyStatus = document.querySelector("#keyStatus");
const toast = document.querySelector("#toast");
const steps = Array.from(document.querySelectorAll("#steps li"));

const response = await fetch("/api/config");
const config = await response.json();

keyStatus.textContent = config.hasApiKey ? "API key connected" : "Missing backend API key";
keyStatus.classList.add(config.hasApiKey ? "ok" : "bad");
renderWardrobe(config.wardrobe || []);
bindUploads();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button[type='submit']");
  button.disabled = true;
  button.textContent = "Generating...";
  resultGrid.className = "result-grid empty";
  resultGrid.innerHTML = `<div class="empty-state">Submitting workflow to Comfy Cloud...</div>`;
  setStep(1);

  try {
    const data = new FormData(form);
    if (!data.get("wardrobe")) data.set("wardrobe", config.wardrobe?.[0]?.id || "outfit-a");
    const generateResponse = await fetch("/api/generate", { method: "POST", body: data });
    const payload = await generateResponse.json();
    if (!generateResponse.ok) throw new Error(payload.error || "Generation failed");

    setStep(4);
    renderResults(payload.outputs || []);
    showToast(`Done: ${payload.outputs?.length || 0} assets generated.`);
  } catch (error) {
    resultGrid.className = "result-grid empty";
    resultGrid.innerHTML = `<div class="empty-state">Generation failed. ${escapeHtml(error.message)}</div>`;
    showToast(error.message, true);
  } finally {
    button.disabled = false;
    button.innerHTML = `<svg><use href="#i-spark"></use></svg> Generate Pack`;
  }
});

function renderWardrobe(items) {
  wardrobeGrid.innerHTML = "";
  for (const [index, item] of items.entries()) {
    const label = document.createElement("label");
    label.className = `wardrobe-card${index === 0 ? " selected" : ""}`;
    label.innerHTML = `
      <input type="radio" name="wardrobe" value="${item.id}" ${index === 0 ? "checked" : ""}>
      <div class="hanger"><img src="${item.imageUrl}" alt="${escapeHtml(item.label)}"></div>
      <strong>${escapeHtml(item.label)}</strong>
      <span>${escapeHtml(item.tone)}</span>
    `;
    label.addEventListener("click", () => {
      document.querySelectorAll(".wardrobe-card").forEach((card) => card.classList.remove("selected"));
      label.classList.add("selected");
    });
    wardrobeGrid.appendChild(label);
  }
}

function bindUploads() {
  document.querySelectorAll(".upload-card input").forEach((input) => {
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      const preview = input.closest(".upload-card").querySelector(".preview");
      if (!file) return;
      const url = URL.createObjectURL(file);
      preview.innerHTML = `<img alt="" src="${url}">`;
    });
  });
}

function renderResults(outputs) {
  const order = ["89", "90", "91", "130", "114"];
  const finalOutputs = outputs
    .filter((asset) => order.includes(String(asset.nodeId)))
    .sort((a, b) => order.indexOf(String(a.nodeId)) - order.indexOf(String(b.nodeId)));

  resultGrid.className = "result-grid";
  if (!finalOutputs.length) {
    resultGrid.className = "result-grid empty";
    resultGrid.innerHTML = `<div class="empty-state">Job completed, but final editorial/video outputs were not returned by websocket.</div>`;
    return;
  }
  resultGrid.innerHTML = finalOutputs.map((asset) => {
    const media = asset.kind === "video"
      ? `<video src="${asset.url}" controls playsinline preload="metadata"></video>`
      : `<img src="${asset.url}" alt="${escapeHtml(asset.label)}">`;
    return `
      <figure class="asset">
        <div class="asset-media">${media}</div>
        <figcaption>
          <strong>${escapeHtml(asset.label)}</strong>
          <a class="download-btn" href="${asset.downloadUrl || asset.url}" download="${escapeHtml(asset.filename)}">Download file</a>
        </figcaption>
      </figure>
    `;
  }).join("");
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
  setTimeout(() => {
    toast.hidden = true;
  }, 4200);
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}
