import { getIntake } from "./js/api.js";
import { initRouter } from "./js/router.js";
import { openPipeline } from "./js/views/pipeline.js";

function initTheme() {
  const btn = document.getElementById("themeToggle");
  btn.addEventListener("click", () => {
    const goingDark = document.documentElement.getAttribute("data-theme") !== "light";
    document.documentElement.setAttribute("data-theme", goingDark ? "light" : "dark");
    document.querySelectorAll(".theicon").forEach((use) => use.setAttribute("href", goingDark ? "#i-sun" : "#i-moon"));
  });
}

async function initStatus() {
  const pill = document.getElementById("apiStatus");
  try {
    const data = await getIntake();
    pill.innerHTML = data.hasApiKey
      ? `<span class="ldot"></span> Comfy Cloud connected`
      : `<span class="ldot" style="background:#e0607a"></span> Missing Comfy Cloud key`;
  } catch {
    pill.innerHTML = `<span class="ldot" style="background:#e0607a"></span> Comfy Cloud unavailable`;
  }
}

document.getElementById("newTwinBtn").addEventListener("click", () => openPipeline());

initTheme();
initStatus();
initRouter();
