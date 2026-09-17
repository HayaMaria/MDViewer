import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    lib: {
      entry: "src/editor.js",
      name: "Editor",
      formats: ["iife"],
    },
    rollupOptions: {
      output: {
        entryFileNames: "editor.bundle.js",
      },
    },
  },
});