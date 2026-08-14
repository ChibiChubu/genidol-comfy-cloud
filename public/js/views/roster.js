import { getTalents, deleteTalent } from "../api.js";
import { escapeHtml, showToast } from "../util.js";
import { goToTalent } from "../router.js";
import { openPipeline } from "./pipeline.js";

export async function renderRoster() {
  const gallery = document.getElementById("gallery");
  const statTwins = document.getElementById("statTwins");
  gallery.innerHTML = `<div class="empty-roster">Loading your twins...</div>`;

  let talents = [];
  try {
    talents = await getTalents();
  } catch (error) {
    gallery.innerHTML = `<div class="empty-roster">${escapeHtml(error.message)}</div>`;
    return;
  }

  statTwins.textContent = String(talents.length);
  gallery.innerHTML = "";

  for (const talent of talents) {
    const card = document.createElement("div");
    card.className = "twin";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.innerHTML = `
      <div class="cov">
        <div class="vp ${talent.coverUrl ? "filled" : ""}">
          <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
          ${
            talent.coverUrl
              ? `<img src="${talent.coverUrl}" alt="${escapeHtml(talent.name)}">`
              : `<span class="ph"><svg class="ic" style="width:22px;height:22px"><use href="#i-image"/></svg>9:16</span>`
          }
        </div>
        <span class="pill mint">Saved</span>
        <button type="button" class="iconbtn del-btn" aria-label="Delete ${escapeHtml(talent.name)}" title="Delete"><svg class="ic" style="width:15px;height:15px"><use href="#i-trash"/></svg></button>
        <span class="hint"><svg class="ic" style="width:14px;height:14px"><use href="#i-right"/></svg> View twin</span>
      </div>
      <div class="tmeta"><div class="tn">${escapeHtml(talent.name)}</div><div class="ts">${new Date(talent.createdAt).toLocaleDateString()}</div></div>
    `;
    card.addEventListener("click", () => goToTalent(talent.id));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") goToTalent(talent.id);
    });
    card.querySelector(".del-btn").addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!confirm(`Delete "${talent.name}" from your library? This can't be undone.`)) return;
      try {
        await deleteTalent(talent.id);
        showToast(`Deleted "${talent.name}".`);
        renderRoster();
      } catch (error) {
        showToast(error.message, true);
      }
    });
    gallery.appendChild(card);
  }

  const newTile = document.createElement("button");
  newTile.className = "twin";
  newTile.innerHTML = `
    <div class="newtile">
      <div class="plus"><svg class="ic" style="width:22px;height:22px"><use href="#i-plus"/></svg></div>
      <div class="nt">Generate new twin</div>
      <div class="ns">Run the pipeline</div>
    </div>
  `;
  newTile.addEventListener("click", () => openPipeline());
  gallery.appendChild(newTile);
}
