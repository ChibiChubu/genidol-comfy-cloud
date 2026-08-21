import { renderRoster } from "./views/roster.js";
import { renderProfile } from "./views/profile.js";
import { renderAuth } from "./views/auth.js";
import { getCurrentUser } from "./session.js";

const VIEW_IDS = ["view-roster", "view-profile", "view-auth"];

function parseHash() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [route, id] = hash.split("/");
  if (route === "talent" && id) return { name: "profile", id };
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

  showView(route.name);
  window.scrollTo(0, 0);

  if (route.name === "roster") {
    await renderRoster();
  } else {
    await renderProfile(route.id);
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
