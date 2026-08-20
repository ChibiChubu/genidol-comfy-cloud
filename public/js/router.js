import { renderRoster } from "./views/roster.js";
import { renderProfile } from "./views/profile.js";
import { renderAuth } from "./views/auth.js";
import { renderAccount } from "./views/account.js";
import { renderAdmin } from "./views/admin.js";
import { getCurrentUser } from "./session.js";

const VIEW_IDS = ["view-roster", "view-profile", "view-auth", "view-account", "view-admin"];

function parseHash() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [route, id] = hash.split("/");
  if (route === "talent" && id) return { name: "profile", id };
  if (route === "login") return { name: "login" };
  if (route === "account") return { name: "account" };
  if (route === "admin") return { name: "admin" };
  return { name: "roster" };
}

function showView(name) {
  for (const id of VIEW_IDS) {
    document.getElementById(id).hidden = id !== `view-${name}`;
  }
}

function updateUserMenu(user) {
  const menu = document.getElementById("userMenu");
  menu.hidden = !user;
  if (!user) return;
  document.getElementById("userMenuEmail").textContent = user.email;
  document.getElementById("userMenuAdmin").hidden = user.role !== "admin";
}

async function dispatch() {
  const route = parseHash();
  const user = getCurrentUser();
  updateUserMenu(user);

  if (!user) {
    showView("auth");
    renderAuth(() => dispatch());
    return;
  }

  if (route.name === "login") {
    location.hash = "#/roster";
    return;
  }

  if (route.name === "admin" && user.role !== "admin") {
    location.hash = "#/roster";
    return;
  }

  showView(route.name);
  window.scrollTo(0, 0);

  if (route.name === "roster") {
    await renderRoster();
  } else if (route.name === "profile") {
    await renderProfile(route.id);
  } else if (route.name === "account") {
    await renderAccount();
  } else if (route.name === "admin") {
    await renderAdmin();
  }
}

export function initRouter() {
  window.addEventListener("hashchange", dispatch);
  dispatch();
}

export function refresh() {
  dispatch();
}

export function goToRoster() {
  location.hash = "#/roster";
}

export function goToTalent(id) {
  location.hash = `#/talent/${id}`;
}
