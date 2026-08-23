/**
 * Synchronisation du carnet entre appareils.
 *
 * Le store Blob est en accès privé : les fichiers ne sont jamais lisibles
 * par une URL publique, seule cette fonction peut les lire et les écrire.
 * L'accès est protégé par un code secret défini côté serveur, et le chemin
 * de stockage est dérivé de ce code par SHA-256.
 *
 * GET  → renvoie la dernière sauvegarde
 * POST → remplace la sauvegarde
 *
 * Variable d'environnement requise sur Vercel : CODE_CARNET
 */
import { put, get } from "@vercel/blob";
import { createHash, timingSafeEqual } from "node:crypto";

const ACCES = "private";

const empreinte = (valeur) => createHash("sha256").update(String(valeur)).digest();

/** Comparaison à temps constant : la durée de la réponse ne renseigne pas
 *  sur le nombre de caractères corrects. */
function codeValide(fourni) {
  const attendu = process.env.CODE_CARNET;
  if (!attendu || !fourni) return false;
  return timingSafeEqual(empreinte(fourni), empreinte(attendu));
}

/** Rassemble un flux de lecture en texte, quelle que soit son implémentation. */
async function lireFlux(flux) {
  if (!flux) return "";
  if (typeof flux.getReader === "function") {
    return new Response(flux).text();
  }
  const morceaux = [];
  for await (const m of flux) morceaux.push(Buffer.from(m));
  return Buffer.concat(morceaux).toString("utf8");
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
      /* useCache: false — on veut la dernière version, pas celle du CDN. */
      const resultat = await get(chemin, { access: ACCES, useCache: false });
      if (!resultat) return res.status(200).json({ vide: true });

      const texte = await lireFlux(resultat.stream);
      if (!texte) return res.status(200).json({ vide: true });

      return res.status(200).json({
        vide: false,
        majLe: resultat.blob?.uploadedAt || null,
        donnees: JSON.parse(texte),
      });
    }

    if (req.method === "POST") {
      const corps = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
      if (corps.length > 4_000_000) {
        return res.status(413).json({ erreur: "Sauvegarde trop volumineuse." });
      }
      await put(chemin, corps, {
        access: ACCES,
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
