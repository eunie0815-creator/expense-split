import { initRouter } from "./router.js";
import { initThemeToggle } from "./theme-toggle.js";
import { renderHome } from "./views/home.js";
import { renderGroup } from "./views/group.js";
import { renderAddExpense, renderEditExpense } from "./views/expense.js";
import { renderAllExpenses } from "./views/all-expenses.js";
import { mascotHtml } from "./mascot.js";

initThemeToggle(document.getElementById("theme-toggle-btn"));
document.getElementById("header-mascot").innerHTML = mascotHtml({ mood: "idle", size: 26 });

initRouter(
  [
    { path: "/", view: renderHome },
    { path: "/g/:id", view: renderGroup },
    { path: "/g/:id/add", view: renderAddExpense },
    { path: "/g/:id/edit/:expenseId", view: renderEditExpense },
    { path: "/g/:id/expenses", view: renderAllExpenses },
  ],
  document.getElementById("app")
);
