// Точка входа для экспортированного HTML: отрисовать все графики документа
import { applyChartTheme, renderChart } from "./charts.js";

applyChartTheme(document.documentElement.getAttribute("data-theme") !== "light");

document.querySelectorAll("[data-chart-code]").forEach((el) => {
  const code = decodeURIComponent(el.getAttribute("data-chart-code") || "");
  if (!code) return;
  const w = parseInt(el.getAttribute("data-mdv-width"), 10) || 600;
  el.style.width = w + "px";
  el.style.height = Math.round(w * 5 / 8) + "px";
  renderChart(code, el.id);
});
