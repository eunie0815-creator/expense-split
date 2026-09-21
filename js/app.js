import { initRouter } from "./router.js";
import { initThemeToggle } from "./theme-toggle.js";
import { renderHome } from "./views/home.js";
import { renderGroup } from "./views/group.js";
import { renderAddExpense, renderEditExpense } from "./views/expense.js";

initThemeToggle(document.getElementById("theme-toggle-btn"));

initRouter(
  [
    { path: "/", view: renderHome },
    { path: "/g/:id", view: renderGroup },
    { path: "/g/:id/add", view: renderAddExpense },
    { path: "/g/:id/edit/:expenseId", view: renderEditExpense },
  ],
  document.getElementById("app")
);
