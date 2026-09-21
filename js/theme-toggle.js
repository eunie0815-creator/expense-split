// Same pattern as the run club site: a manual choice ("light"/"dark") is
// stored in localStorage and overrides the OS preference via the
// data-theme attribute. No stored choice means "follow the OS", which is
// also what the inline script in index.html's <head> checks before paint.

const KEY = "theme";

function isDark() {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark") return true;
  if (attr === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function initThemeToggle(buttonEl) {
  buttonEl.addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(KEY, next);
  });
}
