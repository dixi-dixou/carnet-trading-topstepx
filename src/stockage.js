/**
 * Couche de stockage.
 *
 * L'application fonctionne à deux endroits : dans un artefact Claude, où un
 * objet window.storage est fourni par l'hôte, et dans un navigateur classique,
 * où l'on retombe sur localStorage. La même interface asynchrone couvre les
 * deux cas, ce qui évite de toucher au composant.
 */
const hote = typeof window !== "undefined" ? window.storage : null;

export const stockage = {
  async get(cle) {
    if (hote) return hote.get(cle);
    const value = localStorage.getItem(cle);
    return value === null ? null : { key: cle, value };
  },

  async set(cle, valeur) {
    if (hote) return hote.set(cle, valeur);
    localStorage.setItem(cle, valeur);
    return { key: cle, value: valeur };
  },

  async remove(cle) {
    if (hote) return hote.delete(cle);
    localStorage.removeItem(cle);
    return { key: cle, deleted: true };
  },
};
