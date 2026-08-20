import { getAdminUsers } from "../api.js";
import { escapeHtml } from "../util.js";
import { goToRoster } from "../router.js";

let bound = false;

function bindOnce() {
  if (bound) return;
  bound = true;
  const view = document.getElementById("view-admin");
  document.getElementById("adminBack").addEventListener("click", goToRoster);
  view.querySelector('[data-nav="roster"]').addEventListener("click", goToRoster);
}

export async function renderAdmin() {
  bindOnce();
  const body = document.getElementById("adminTableBody");
  body.innerHTML = `<tr><td colspan="5">Loading...</td></tr>`;

  let users = [];
  try {
    users = await getAdminUsers();
  } catch (error) {
    body.innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  if (!users.length) {
    body.innerHTML = `<tr><td colspan="5">No accounts yet.</td></tr>`;
    return;
  }

  body.innerHTML = users.map((user) => `
    <tr>
      <td>${escapeHtml(user.email)}</td>
      <td>${user.role === "admin" ? `<span class="pill iris">Admin</span>` : `<span class="pill gray">Client</span>`}</td>
      <td>${user.hasApiKey ? `<span class="pill mint">${escapeHtml(user.maskedApiKey)}</span>` : `<span class="pill amber">Not set</span>`}</td>
      <td>${user.talentCount}</td>
      <td class="mono muted">${new Date(user.createdAt).toLocaleDateString()}</td>
    </tr>
  `).join("");
}
