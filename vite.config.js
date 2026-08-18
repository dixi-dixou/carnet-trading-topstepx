import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * `base` doit correspondre au nom du dépôt pour un déploiement sur GitHub
 * Pages (https://<utilisateur>.github.io/<depot>/). Laissez "/" si vous
 * déployez sur un domaine racine, Netlify ou Vercel.
 */
export default defineConfig({
  plugins: [react()],
  base: "/carnet-trading-topstepx/",
});
