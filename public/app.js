import { getIntake, getMe, logout } from "./js/api.js";
import { initRouter, refresh } from "./js/router.js";
import { openPipeline } from "./js/views/pipeline.js";
import { getCurrentUser, setCurrentUser } from "./js/session.js";

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

function initUserMenu() {
  const btn = document.getElementById("userMenuBtn");
  const drop = document.getElementById("userMenuDrop");

  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    drop.hidden = !drop.hidden;
  });
  document.addEventListener("click", (event) => {
    if (!drop.hidden && !drop.contains(event.target) && event.target !== btn) drop.hidden = true;
  });
  document.getElementById("userMenuAccount").addEventListener("click", () => {
    drop.hidden = true;
    location.hash = "#/account";
  });
  document.getElementById("userMenuAdmin").addEventListener("click", () => {
    drop.hidden = true;
    location.hash = "#/admin";
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
initStatus();
initRouter();
