import { escapeHtml, formatFileSize } from "./util.js";

const WARDROBE_MODE_META = [
  { key: "shirt", label: "Shirt" },
  { key: "pants", label: "Pants" },
  { key: "shirt-pants", label: "Shirt + Pants" },
  { key: "dress", label: "Dress" },
  { key: "client", label: "Client Outfit" },
];

export function createWardrobeController({ wardrobeGroups, modesHost, groupsHost, onChange }) {
  const state = {
    wardrobeMode: "shirt-pants",
    wardrobeSource: "wardrobe",
    selectedShirtId: "shirt-a",
    selectedPantsId: "pants-a",
    selectedDressId: "dress-a",
    clientOutfit: null,
  };

  function notify() {
    if (onChange) onChange();
  }

  function renderModes() {
    modesHost.innerHTML = "";
    const bar = document.createElement("div");
    bar.className = "mode-bar";
    for (const mode of WARDROBE_MODE_META) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `mode-chip ${state.wardrobeMode === mode.key ? "on" : ""}`;
      button.textContent = mode.label;
      button.addEventListener("click", () => {
        state.wardrobeMode = mode.key;
        state.wardrobeSource = mode.key === "client" && state.clientOutfit ? "client" : "wardrobe";
        renderAll();
        notify();
      });
      bar.appendChild(button);
    }
    modesHost.appendChild(bar);
  }

  function renderGroup(groupId, label, selectedItemId) {
    const group = wardrobeGroups.find((entry) => entry.id === groupId) || { items: [] };
    const section = document.createElement("section");
    section.style.marginBottom = "22px";

    const heading = document.createElement("div");
    heading.className = "lbl";
    heading.textContent = label;
    section.appendChild(heading);

    const items = document.createElement("div");
    items.className = "wgrid";
    for (const item of group.items) {
      const button = document.createElement("button");
      button.type = "button";
      const selected = state.wardrobeSource === "wardrobe" && selectedItemId === item.id;
      button.className = `wcard ${selected ? "sel" : ""}`;
      button.innerHTML = `
        <div class="wthumb"><img src="${item.imageUrl}" alt="${escapeHtml(item.label)}" loading="lazy"></div>
        <div class="wrow"><span class="n">${escapeHtml(item.label)}</span><span class="check"><svg class="ic" style="width:13px;height:13px"><use href="#i-check"/></svg></span></div>
      `;
      button.addEventListener("click", () => {
        state.wardrobeSource = "wardrobe";
        if (groupId === "shirt") state.selectedShirtId = item.id;
        if (groupId === "pants") state.selectedPantsId = item.id;
        if (groupId === "dress") state.selectedDressId = item.id;
        renderAll();
        notify();
      });
      items.appendChild(button);
    }
    section.appendChild(items);
    return section;
  }

  function renderClientPanel() {
    const section = document.createElement("section");

    const heading = document.createElement("div");
    heading.className = "lbl";
    heading.textContent = "Client Outfit";
    section.appendChild(heading);

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.hidden = true;
    input.addEventListener("change", () => {
      const file = input.files?.[0] ?? null;
      if (state.clientOutfit?.previewUrl) URL.revokeObjectURL(state.clientOutfit.previewUrl);
      state.clientOutfit = file
        ? { file, name: file.name, sizeLabel: formatFileSize(file.size), previewUrl: URL.createObjectURL(file) }
        : null;
      state.wardrobeSource = state.clientOutfit ? "client" : "wardrobe";
      renderAll();
      notify();
    });
    section.appendChild(input);

    const items = document.createElement("div");
    items.className = "wgrid";

    const card = document.createElement("button");
    card.type = "button";
    card.className = `wcard ${state.clientOutfit ? "sel" : ""}`;
    card.innerHTML = state.clientOutfit
      ? `
        <div class="wthumb"><img src="${state.clientOutfit.previewUrl}" alt="Client outfit"></div>
        <div class="wrow"><span class="n">${escapeHtml(state.clientOutfit.name)}</span><span class="check"><svg class="ic" style="width:13px;height:13px"><use href="#i-check"/></svg></span></div>
      `
      : `
        <div class="wthumb" style="display:flex;align-items:center;justify-content:center;color:var(--text3)"><svg class="ic" style="width:22px;height:22px"><use href="#i-image"/></svg></div>
        <div class="wrow"><span class="n">Upload outfit photo</span></div>
      `;
    card.addEventListener("click", () => input.click());
    items.appendChild(card);
    section.appendChild(items);

    if (state.clientOutfit) {
      const hint = document.createElement("p");
      hint.className = "muted";
      hint.style.cssText = "margin-top:14px;font-size:13px";
      hint.textContent = "This outfit will override the wardrobe selection for this twin.";
      section.appendChild(hint);
    }

    return section;
  }

  function renderGroups() {
    groupsHost.innerHTML = "";
    if (state.wardrobeMode === "client") {
      groupsHost.appendChild(renderClientPanel());
      return;
    }
    if (state.wardrobeMode === "shirt-pants") {
      groupsHost.appendChild(renderGroup("shirt", "Shirt", state.selectedShirtId));
      groupsHost.appendChild(renderGroup("pants", "Pants", state.selectedPantsId));
      return;
    }
    if (state.wardrobeMode === "shirt") {
      groupsHost.appendChild(renderGroup("shirt", "Shirt", state.selectedShirtId));
      return;
    }
    if (state.wardrobeMode === "pants") {
      groupsHost.appendChild(renderGroup("pants", "Pants", state.selectedPantsId));
      return;
    }
    if (state.wardrobeMode === "dress") {
      groupsHost.appendChild(renderGroup("dress", "Dress", state.selectedDressId));
    }
  }

  function renderAll() {
    renderModes();
    renderGroups();
  }

  function getPayload() {
    return {
      mode: state.wardrobeMode,
      source: state.wardrobeSource,
      shirtId: state.selectedShirtId,
      pantsId: state.selectedPantsId,
      dressId: state.selectedDressId,
    };
  }

  function getClientOutfitFile() {
    return state.clientOutfit?.file ?? null;
  }

  renderAll();
  return { getPayload, getClientOutfitFile };
}
