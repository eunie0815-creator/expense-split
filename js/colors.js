// The fixed palette members can pick a personal color from (see
// sql/04_member_colors.sql -- the DB enforces the same list via a CHECK
// constraint, so this array and that constraint must stay in sync).
export const MEMBER_COLORS = [
  "F6DE8D",
  "D98E8A",
  "B8A9C9",
  "5B3A55",
  "A8C3A0",
  "8FAFC4",
  "A0522D",
];

// Picks white or near-black text depending on how light the swatch is,
// so labels stay readable against both the pale colors (F6DE8D) and the
// dark ones (5B3A55, A0522D) in the same palette.
export function contrastTextColor(hex) {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#2b2320" : "#fdfaf5";
}

// The next color not already used by an existing member, so newly added
// members default to a distinct one instead of everyone landing on the
// first swatch. Cycles back once every color is taken.
export function nextAvailableColor(members) {
  const used = new Set(members.map((m) => m.color).filter(Boolean));
  const free = MEMBER_COLORS.find((c) => !used.has(c));
  return free ?? MEMBER_COLORS[members.length % MEMBER_COLORS.length];
}

// A small inline dot in a member's color, used everywhere a name appears
// as plain text (expense rows, settle-up suggestions) rather than as a
// full badge. Renders nothing if the member has no color yet (existing
// members from before this feature).
export function memberDotHtml(color) {
  if (!color) return "";
  return `<span class="member-dot" style="background:#${color};"></span>`;
}
