/**
 * Client de synchronisation.
 *
 * Le code secret reste dans le navigateur, hors de la sauvegarde elle-même :
 * on ne veut pas qu'il voyage dans le fichier synchronisé.
 */
const CLE_CODE = "carnet-code-sync";

export const codeSync = {
  lire: () => {
    try { return localStorage.getItem(CLE_CODE) || ""; } catch { return ""; }
  },
  ecrire: (v) => {
    try { v ? localStorage.setItem(CLE_CODE, v) : localStorage.removeItem(CLE_CODE); } catch { /* stockage indisponible */ }
  },
};

async function appel(methode, code, corps) {
  const r = await fetch("/api/carnet", {
    method: methode,
    headers: { "Content-Type": "application/json", "x-code-carnet": code },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.erreur || `Erreur ${r.status}`);
  return data;
}

export const envoyer = (code, donnees) => appel("POST", code, donnees);
export const recuperer = (code) => appel("GET", code);
