import { login, signup } from "../api.js";
import { escapeHtml } from "../util.js";
import { setCurrentUser } from "../session.js";

let mode = "login";

export function renderAuth(onSuccess) {
  const sub = document.getElementById("authSub");
  const submitBtn = document.getElementById("authSubmit");
  const switchWrap = document.getElementById("authSwitchWrap");
  const errorHost = document.getElementById("authError");
  const form = document.getElementById("authForm");
  const emailInput = document.getElementById("authEmail");
  const passwordInput = document.getElementById("authPassword");

  function applyMode() {
    sub.textContent = mode === "login" ? "Sign in" : "Create an account";
    submitBtn.textContent = mode === "login" ? "Log in" : "Sign up";
    passwordInput.autocomplete = mode === "login" ? "current-password" : "new-password";
    switchWrap.innerHTML = mode === "login"
      ? `Don't have an account? <a id="authSwitch">Sign up</a>`
      : `Already have an account? <a id="authSwitch">Log in</a>`;
    document.getElementById("authSwitch").addEventListener("click", () => {
      mode = mode === "login" ? "signup" : "login";
      errorHost.innerHTML = "";
      applyMode();
    });
  }

  applyMode();

  form.onsubmit = async (event) => {
    event.preventDefault();
    errorHost.innerHTML = "";
    submitBtn.disabled = true;
    try {
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      const user = mode === "login" ? await login(email, password) : await signup(email, password);
      setCurrentUser(user);
      form.reset();
      onSuccess(user);
    } catch (error) {
      errorHost.innerHTML = `<div class="errbox">${escapeHtml(error.message)}</div>`;
    } finally {
      submitBtn.disabled = false;
    }
  };
}
