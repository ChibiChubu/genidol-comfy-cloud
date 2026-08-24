import { getTalent, deleteTalent, generateVoiceSample } from "../api.js";
import { escapeHtml, showToast } from "../util.js";
import { goToRoster } from "../router.js";
import { takePendingVoiceAudio } from "../pendingAudio.js";

const OUTPUT_ORDER = [
  ["characterDownload", "Character download"],
  ["editorial1", "Editorial 1"],
  ["editorial2", "Editorial 2"],
  ["editorial3", "Editorial 3"],
];

let bound = false;
let currentTalent = null;

function bindOnce() {
  if (bound) return;
  bound = true;

  document.getElementById("pfBack").addEventListener("click", goToRoster);
  document.querySelector('[data-nav="roster"]').addEventListener("click", goToRoster);
  document.getElementById("pfDelete").addEventListener("click", async () => {
    if (!currentTalent) return;
    if (!confirm(`Delete "${currentTalent.name}" from your library? This can't be undone.`)) return;
    try {
      await deleteTalent(currentTalent.id);
      showToast(`Deleted "${currentTalent.name}".`);
      goToRoster();
    } catch (error) {
      showToast(error.message, true);
    }
  });

  const subs = Array.from(document.querySelectorAll("#subnav a"));
  subs.forEach((a) => {
    a.addEventListener("click", () => {
      const el = document.getElementById(a.dataset.t);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      setSub(a.dataset.t);
    });
  });

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setSub(entry.target.id);
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    ["assets", "twin", "motion", "voice"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
  }

  document.getElementById("pfVoiceGenerate").addEventListener("click", async () => {
    if (!currentTalent) return;
    const audioInput = document.getElementById("pfVoiceAudio");
    const file = audioInput.files?.[0];
    if (!file) {
      showToast("Please choose a voice reference audio file first.", true);
      return;
    }

    const genBtn = document.getElementById("pfVoiceGenerate");
    const status = document.getElementById("pfVoiceStatus");
    genBtn.disabled = true;
    status.innerHTML = `<div class="review-note"><span class="spin"></span> Cloning voice and generating sample...</div>`;

    try {
      const formData = new FormData();
      formData.set("audio", file, file.name);
      const talent = await generateVoiceSample(currentTalent.id, formData);
      currentTalent = talent;
      status.innerHTML = "";
      renderVoiceResult(talent);
      showToast("Voice sample generated.");
    } catch (error) {
      status.innerHTML = `<div class="review-note" style="border-color:#e0607a;color:#e0607a">${escapeHtml(error.message)}</div>`;
      showToast(error.message, true);
    } finally {
      genBtn.disabled = false;
    }
  });
}

function renderVoiceResult(talent) {
  const voice = talent.assets?.voiceSample;
  document.getElementById("pfVoiceResult").innerHTML = voice
    ? `<audio src="${voice.url}" controls></audio>
       <div style="margin-top:10px"><a class="btn sm" href="${voice.url}" download><svg class="ic" style="width:14px;height:14px"><use href="#i-download"/></svg> Download voice sample</a></div>`
    : "";
}

function setSub(t) {
  document.querySelectorAll("#subnav a").forEach((a) => a.classList.toggle("on", a.dataset.t === t));
}

function outputCard(label, asset) {
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
}

export async function renderProfile(id) {
  bindOnce();
  setSub("assets");

  document.getElementById("pfName").textContent = "Loading...";
  document.getElementById("pfRefs").innerHTML = "";
  document.getElementById("pfTwinGrid").innerHTML = "";
  document.getElementById("pfVideoHost").innerHTML = "";
  document.getElementById("pfWardrobeMeta").innerHTML = "";
  document.getElementById("pfVoiceStatus").innerHTML = "";
  document.getElementById("pfVoiceResult").innerHTML = "";
  const voiceAudioInput = document.getElementById("pfVoiceAudio");
  const pendingAudio = takePendingVoiceAudio();
  if (pendingAudio) {
    const dt = new DataTransfer();
    dt.items.add(pendingAudio);
    voiceAudioInput.files = dt.files;
    document.getElementById("pfVoiceStatus").innerHTML = `<div class="review-note">Voice sample carried over from intake — ready to generate.</div>`;
  } else {
    voiceAudioInput.value = "";
  }

  let talent;
  try {
    talent = await getTalent(id);
  } catch (error) {
    currentTalent = null;
    document.getElementById("pfName").textContent = "Not found";
    document.getElementById("pfRefs").innerHTML = `<div class="empty-roster">${escapeHtml(error.message)}</div>`;
    return;
  }

  currentTalent = talent;
  document.getElementById("pfName").textContent = talent.name;

  const refs = talent.references ?? [];
  document.getElementById("pfRefs").innerHTML = refs.length
    ? refs.map((ref, i) => `<div class="thumb filled"><img src="${ref.url}" alt="Reference ${i + 1}"></div>`).join("")
    : Array.from({ length: 4 }, () => `<div class="thumb"><svg class="ic" style="width:20px;height:20px"><use href="#i-image"/></svg></div>`).join("");

  const wardrobe = talent.wardrobe || {};
  const wardrobeLabel = talent.clientOutfitUsed
    ? "Client-uploaded outfit"
    : [wardrobe.mode, wardrobe.shirtId, wardrobe.pantsId, wardrobe.dressId].filter(Boolean).join(" · ");
  document.getElementById("pfWardrobeMeta").innerHTML = `
    <div class="stat"><div class="k">Height</div><div class="v">${escapeHtml(talent.height || "—")}</div></div>
    <div class="stat"><div class="k">Eyes</div><div class="v">${escapeHtml(talent.eyes || "—")}</div></div>
    <div class="stat"><div class="k">Hair</div><div class="v">${escapeHtml(talent.hair || "—")}</div></div>
    <div class="stat"><div class="k">Wardrobe</div><div class="v">${escapeHtml(wardrobeLabel || "—")}</div></div>
  `;

  document.getElementById("pfTwinGrid").innerHTML = OUTPUT_ORDER
    .map(([key, label]) => outputCard(label, talent.assets?.[key]))
    .join("");

  const video = talent.assets?.video;
  document.getElementById("pfVideoHost").innerHTML = video
    ? `<video src="${video.url}" controls playsinline></video>
       <div style="margin-top:10px"><a class="btn sm" href="${video.url}" download><svg class="ic" style="width:14px;height:14px"><use href="#i-download"/></svg> Download video</a></div>`
    : `<div class="vp" style="height:426px"><span class="ph">No video</span></div>`;

  renderVoiceResult(talent);
}
