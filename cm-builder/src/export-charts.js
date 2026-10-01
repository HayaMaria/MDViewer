// Точка входа для экспортированного HTML: отрисовать все графики документа
import { applyChartTheme, renderChart } from "./charts.js";

applyChartTheme(document.documentElement.getAttribute("data-theme") !== "light");

document.querySelectorAll("[data-chart-code]").forEach((el) => {
  const code = decodeURIComponent(el.getAttribute("data-chart-code") || "");
  if (code) renderChart(code, el.id);
});
