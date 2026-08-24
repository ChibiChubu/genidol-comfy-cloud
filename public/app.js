import { getIntake, getMe, logout, updateApiKey } from "./js/api.js";
import { initRouter, refresh } from "./js/router.js";
import { openPipeline } from "./js/views/pipeline.js";
import { getCurrentUser, setCurrentUser } from "./js/session.js";
import { showToast } from "./js/util.js";

function initTheme() {
  const btn = document.getElementById("themeToggle");
  btn.addEventListener("click", () => {
    const goingDark = document.documentElement.getAttribute("data-theme") !== "light";
    document.documentElement.setAttribute("data-theme", goingDark ? "light" : "dark");
    document.querySelectorAll(".theicon").forEach((use) => use.setAttribute("href", goingDark ? "#i-sun" : "#i-moon"));
    applyAccentColor(getStoredAccent());
  });
}

const DEFAULT_ACCENT = "#9d8dff";

function getStoredAccent() {
  const stored = localStorage.getItem("pf-accent");
  return /^#[0-9a-fA-F]{6}$/.test(stored) ? stored : DEFAULT_ACCENT;
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
}

function adjustLightness(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r + amount, g + amount, b + amount);
}

function applyAccentColor(hex) {
  const { r, g, b } = hexToRgb(hex);
  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  const bgAlpha = isLight ? 0.1 : 0.16;
  const bdAlpha = isLight ? 0.28 : 0.36;
  const root = document.documentElement.style;
  root.setProperty("--iris", hex);
  root.setProperty("--iris2", adjustLightness(hex, isLight ? -24 : 24));
  root.setProperty("--iris-bg", `rgba(${r}, ${g}, ${b}, ${bgAlpha})`);
  root.setProperty("--iris-bd", `rgba(${r}, ${g}, ${b}, ${bdAlpha})`);
}

function initAccent() {
  const picker = document.getElementById("accentColorPicker");
  const stored = getStoredAccent();
  picker.value = stored;
  applyAccentColor(stored);

  picker.addEventListener("input", () => {
    applyAccentColor(picker.value);
    localStorage.setItem("pf-accent", picker.value);
  });
}

async function initStatus() {
  if (!getCurrentUser()) return;
  const pill = document.getElementById("apiStatus");
  try {
    const data = await getIntake();
    pill.innerHTML = data.hasApiKey
      ? `<span class="ldot"></span> API connected`
      : `<span class="ldot" style="background:#e0607a"></span> Missing API key`;
  } catch {
    pill.innerHTML = `<span class="ldot" style="background:#e0607a"></span> API unavailable`;
  }
}

function applyKeyStatus() {
  const user = getCurrentUser();
  const status = document.getElementById("userMenuKeyStatus");
  const emailHost = document.getElementById("userMenuEmail");
  if (!user) return;
  emailHost.textContent = user.email;
  status.className = `usermenu-key-status pill ${user.hasApiKey ? "mint" : "amber"}`;
  status.textContent = user.hasApiKey ? "API key connected" : "No API key set yet";
}

function initUserMenu() {
  const btn = document.getElementById("userMenuBtn");
  const drop = document.getElementById("userMenuDrop");
  const keyInput = document.getElementById("userMenuApiKey");
  const keySave = document.getElementById("userMenuApiKeySave");

  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    drop.hidden = !drop.hidden;
    if (!drop.hidden) applyKeyStatus();
  });
  document.addEventListener("click", (event) => {
    if (!drop.hidden && !drop.contains(event.target) && event.target !== btn) drop.hidden = true;
  });

  keySave.addEventListener("click", async () => {
    keySave.disabled = true;
    try {
      const updated = await updateApiKey(keyInput.value.trim());
      setCurrentUser(updated);
      keyInput.value = "";
      applyKeyStatus();
      initStatus();
      showToast("API key saved.");
    } catch (error) {
      showToast(error.message, true);
    } finally {
      keySave.disabled = false;
    }
  });

  document.getElementById("userMenuLogout").addEventListener("click", async () => {
    drop.hidden = true;
    await logout().catch(() => {});
    setCurrentUser(null);
    refresh();
  });
}

document.getElementById("newTwinBtn").addEventListener("click", () => openPipeline());

initTheme();
initAccent();
initUserMenu();

setCurrentUser(await getMe());
applyKeyStatus();
initStatus();
initRouter();
