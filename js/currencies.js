// The currencies this friend group actually uses, each paired with a
// flag emoji for the dropdowns. Frankfurter (our free FX provider) only
// covers ECB reference currencies -- notably no VND, so it's left out
// until there's a second rate source worth the added complexity.
export const CURRENCIES = [
  { code: "SGD", flag: "🇸🇬" },
  { code: "MYR", flag: "🇲🇾" },
  { code: "IDR", flag: "🇮🇩" },
  { code: "KRW", flag: "🇰🇷" },
  { code: "JPY", flag: "🇯🇵" },
  { code: "CNY", flag: "🇨🇳" },
  { code: "AUD", flag: "🇦🇺" },
  { code: "USD", flag: "🇺🇸" },
  { code: "CAD", flag: "🇨🇦" },
];
