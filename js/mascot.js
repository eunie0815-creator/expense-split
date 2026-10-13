// A pixel-art coin mascot, drawn as a grid of SVG <rect>s rather than an
// image asset -- stays crisp at any size with no build step and no files
// to ship. One shared bitmap for every mood: at this resolution a
// redrawn face wouldn't read as a different expression anyway, so mood is
// expressed through CSS instead (animation on the whole coin, plus
// transforms/opacity on the eye, mouth and blush pixels -- see
// css/app.css's "Pixel mascot" section).

const COIN_BITMAP = [
  "....OOOO....",
  "..OCCCCCCO..",
  ".OCCCCCCCCO.",
  "OCCCCCCCCCCO",
  "OCCSCCCCCCCO",
  "OCCECCCCECCO",
  "OCCCCCCCCCCO",
  "OCCCMMMMCCCO",
  "OCCCCCCCCCCO",
  ".OCCCCCCCCO.",
  "..OCCCCCCO..",
  "....OOOO....",
];

const PIXEL_CLASS = {
  O: "mascot-outline",
  C: "mascot-coin",
  S: "mascot-shine",
  E: "mascot-eye",
  M: "mascot-mouth",
};

// Blush pixels aren't part of the bitmap above -- they're only ever shown
// for the "happy" mood (see .mascot-blush in app.css), so they're added as
// two fixed extra rects rather than a character every other mood has to
// skip over.
const BLUSH_PIXELS = [
  [1, 6],
  [10, 6],
];

function coinSvg() {
  let rects = "";
  COIN_BITMAP.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === ".") continue;
      rects += `<rect class="${PIXEL_CLASS[ch]}" x="${x}" y="${y}" width="1" height="1" />`;
    }
  });
  BLUSH_PIXELS.forEach(([x, y]) => {
    rects += `<rect class="mascot-blush" x="${x}" y="${y}" width="1" height="1" />`;
  });

  return `<svg class="mascot" viewBox="0 0 12 12" aria-hidden="true">${rects}</svg>`;
}

const SPARKLES_HTML = `
  <span class="mascot-sparkle mascot-sparkle--1">&#10022;</span>
  <span class="mascot-sparkle mascot-sparkle--2">&#10022;</span>
  <span class="mascot-sparkle mascot-sparkle--3">&#10022;</span>
`;

// moods: "idle" (gentle bob + blink), "happy" (bounce + grin + sparkles,
// for a fully-settled-up group), "sad" (droopy sway, for empty states),
// "loading" (a literal coin flip in place of a spinner).
export function mascotHtml({ mood = "idle", size = 48, className = "" } = {}) {
  return `
    <div class="mascot-wrap mascot-wrap--${mood} ${className}" style="width:${size}px;height:${size}px;">
      ${coinSvg()}
      ${mood === "happy" ? SPARKLES_HTML : ""}
    </div>
  `;
}

export function loadingHtml(label = "Loading") {
  return `
    <div class="mascot-loading">
      ${mascotHtml({ mood: "loading", size: 48 })}
      <p class="center-note" style="padding: 0;">${label}&hellip;</p>
    </div>
  `;
}
