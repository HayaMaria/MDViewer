import { defineConfig } from "vite";

// npm run build собирает оба бандла в assets/build:
//   editor.bundle.js — редактор и превью для приложения;
//   export-charts.js — рендер графиков для экспортированного HTML (vite build --mode export)
const ENTRIES = {
  production: { entry: "src/editor.js", name: "Editor", fileName: "editor.bundle.js", emptyOutDir: true },
  export: { entry: "src/export-charts.js", name: "ExportCharts", fileName: "export-charts.js", emptyOutDir: false },
};

export default defineConfig(({ mode }) => {
  const { entry, name, fileName, emptyOutDir } = ENTRIES[mode];
  return {
    build: {
      outDir: "../assets/build",
      emptyOutDir,
      lib: { entry, name, formats: ["iife"], fileName: () => fileName },
    },
  };
});
