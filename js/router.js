// Minimal hash router. GitHub Pages can't rewrite paths for a single-page
// app, so we use "#/g/<id>" style routes instead of real paths -- those
// always work with plain static file hosting.

export function initRouter(routes, mountEl) {
  function resolve() {
    const path = location.hash.slice(1) || "/";

    for (const route of routes) {
      const params = matchRoute(route.path, path);
      if (params) {
        mountEl.innerHTML = "";
        route.view(mountEl, params);
        return;
      }
    }

    mountEl.innerHTML = '<p class="center-note">Page not found.</p>';
  }

  window.addEventListener("hashchange", resolve);
  resolve();
}

function matchRoute(pattern, path) {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = path.split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;

  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    const part = patternParts[i];
    if (part.startsWith(":")) {
      params[part.slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (part !== pathParts[i]) {
      return null;
    }
  }
  return params;
}
