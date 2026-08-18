import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * `base` reste à "/" pour un déploiement à la racine d'un domaine
 * (Vercel, Netlify). Sur GitHub Pages, mettez plutôt "/nom-du-depot/".
 */
export default defineConfig({
  plugins: [react()],
  base: "/",
});
