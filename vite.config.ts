import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      // The project root is the home directory, so Vite's dev file-watcher would
      // otherwise recurse into ~/.cache, ~/.config, ~/.local, etc. and exhaust the
      // inotify watch limit (ENOSPC). None of the app source lives in a hidden
      // directory, node_modules, or dist, so ignoring those is safe and keeps HMR.
      ignored: ["**/node_modules/**", "**/dist/**", "**/.*/**"],
    },
  },
});
