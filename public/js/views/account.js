import { updateApiKey } from "../api.js";
import { showToast } from "../util.js";
import { getCurrentUser, setCurrentUser } from "../session.js";
import { goToRoster } from "../router.js";

let bound = false;

function bindOnce() {
  if (bound) return;
  bound = true;
  const view = document.getElementById("view-account");
  document.getElementById("acctBack").addEventListener("click", goToRoster);
  view.querySelector('[data-nav="roster"]').addEventListener("click", goToRoster);
}

export async function renderAccount() {
  bindOnce();
  const status = document.getElementById("acctStatus");
  const input = document.getElementById("acctApiKey");
  const saveBtn = document.getElementById("acctSave");

  const user = getCurrentUser();
  input.value = "";
  applyStatus(status, user?.hasApiKey);

  saveBtn.onclick = async () => {
    saveBtn.disabled = true;
    try {
      const updated = await updateApiKey(input.value.trim());
      setCurrentUser(updated);
      applyStatus(status, updated.hasApiKey);
      input.value = "";
      showToast("API key saved.");
    } catch (error) {
      showToast(error.message, true);
    } finally {
      saveBtn.disabled = false;
    }
  };
}

function applyStatus(status, hasApiKey) {
  status.className = `pill ${hasApiKey ? "mint" : "amber"}`;
  status.textContent = hasApiKey ? "API key connected" : "No API key set yet";
}
