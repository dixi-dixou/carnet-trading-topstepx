/**
 * Synchronisation du carnet entre appareils.
 *
 * Une seule sauvegarde, protégée par un code secret défini côté serveur.
 * Le chemin de stockage est dérivé du code par SHA-256 : il n'est jamais
 * transmis au navigateur et reste impossible à deviner.
 *
 * GET  → renvoie la dernière sauvegarde
 * POST → remplace la sauvegarde
 *
 * Variable d'environnement requise sur Vercel : CODE_CARNET
 */
import { put, head } from "@vercel/blob";
import { createHash, timingSafeEqual } from "node:crypto";

const empreinte = (valeur) => createHash("sha256").update(String(valeur)).digest();

/** Comparaison à temps constant : la durée de la réponse ne renseigne pas
 *  sur le nombre de caractères corrects. */
function codeValide(fourni) {
  const attendu = process.env.CODE_CARNET;
  if (!attendu || !fourni) return false;
  return timingSafeEqual(empreinte(fourni), empreinte(attendu));
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!process.env.CODE_CARNET) {
    return res.status(500).json({ erreur: "CODE_CARNET n'est pas défini sur le projet Vercel." });
  }
  if (!codeValide(req.headers["x-code-carnet"])) {
    return res.status(401).json({ erreur: "Code de synchronisation incorrect." });
  }

  const chemin = `carnet/${empreinte(process.env.CODE_CARNET).toString("hex")}.json`;

  try {
    if (req.method === "GET") {
      let infos;
      try {
        infos = await head(chemin);
      } catch {
        return res.status(200).json({ vide: true });
      }
      const reponse = await fetch(infos.downloadUrl || infos.url, { cache: "no-store" });
      if (!reponse.ok) return res.status(502).json({ erreur: "Sauvegarde illisible." });
      return res.status(200).json({
        vide: false,
        majLe: infos.uploadedAt,
        taille: infos.size,
        donnees: JSON.parse(await reponse.text()),
      });
    }

    if (req.method === "POST") {
      const corps = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
      if (corps.length > 4_000_000) {
        return res.status(413).json({ erreur: "Sauvegarde trop volumineuse." });
      }
      await put(chemin, corps, {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      return res.status(200).json({ ok: true, majLe: new Date().toISOString() });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ erreur: "Méthode non autorisée." });
  } catch (e) {
    return res.status(500).json({ erreur: e?.message || "Erreur de stockage." });
  }
}
