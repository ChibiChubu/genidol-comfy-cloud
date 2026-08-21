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
initUserMenu();

setCurrentUser(await getMe());
applyKeyStatus();
initStatus();
initRouter();
