import { renderRoster } from "./views/roster.js";
import { renderProfile } from "./views/profile.js";

function parseHash() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [route, id] = hash.split("/");
  if (route === "talent" && id) return { name: "profile", id };
  return { name: "roster" };
}

async function dispatch() {
  const route = parseHash();
  document.getElementById("view-roster").hidden = route.name !== "roster";
  document.getElementById("view-profile").hidden = route.name !== "profile";
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

export function goToRoster() {
  location.hash = "#/roster";
}

export function goToTalent(id) {
  location.hash = `#/talent/${id}`;
}
