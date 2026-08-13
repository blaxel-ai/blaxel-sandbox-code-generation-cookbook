import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  preview: {
    allowedHosts: [".preview.bl.run", ".beamlit.net"],
  },
});
