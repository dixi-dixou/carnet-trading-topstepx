import React, { useState, useEffect, useMemo, useCallback } from "react";
import { stockage } from "./stockage";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell, ReferenceLine
} from "recharts";

/* ------------------------------------------------------------------ */
/*  Référentiel contrats à terme (CME)                                 */
/* ------------------------------------------------------------------ */
const INSTRUMENTS = {
  MNQ: { nom: "Micro Nasdaq", tick: 0.25, valeurTick: 0.5 },
  NQ:  { nom: "Nasdaq 100",   tick: 0.25, valeurTick: 5 },
  MES: { nom: "Micro S&P",    tick: 0.25, valeurTick: 1.25 },
  ES:  { nom: "S&P 500",      tick: 0.25, valeurTick: 12.5 },
  MYM: { nom: "Micro Dow",    tick: 1,    valeurTick: 0.5 },
  YM:  { nom: "Dow Jones",    tick: 1,    valeurTick: 5 },
  M2K: { nom: "Micro Russell",tick: 0.1,  valeurTick: 0.5 },
  RTY: { nom: "Russell 2000", tick: 0.1,  valeurTick: 5 },
  MCL: { nom: "Micro Pétrole",tick: 0.01, valeurTick: 1 },
  CL:  { nom: "Pétrole WTI",  tick: 0.01, valeurTick: 10 },
  MGC: { nom: "Micro Or",     tick: 0.1,  valeurTick: 1 },
  GC:  { nom: "Or",           tick: 0.1,  valeurTick: 10 },
};

/* Le « 50K » désigne le pouvoir d'achat : le solde d'un XFA part de 0 $.
   Les limites sont exprimées en micros — un mini vaut 10 micros. */
const PRESETS = {
  "50K":  { mll: 2000, dll: 1000, maxContrats: 50,  plafond: 5000 },
  "100K": { mll: 3000, dll: 2000, maxContrats: 100, plafond: 5000 },
  "150K": { mll: 4500, dll: 3000, maxContrats: 150, plafond: 5000 },
};

const SESSIONS = ["Pré-marché", "Ouverture NY", "Milieu de séance", "Clôture NY", "Asie / Londres"];
const EMOTIONS = ["Calme", "Confiant", "Impatient", "Peur", "Cupidité", "Vengeance", "Fatigue"];
const SETUPS_DEFAUT = ["Cassure", "Retour à la moyenne", "Repli sur VWAP", "Ouverture en range", "Reprise de tendance", "Faux signal"];

const CLE = "journal-topstepx-v3";

/* Checklist de validation, modifiable dans l'onglet Rituel */
const CHECKLIST_DEFAUT = [
  { id: "c1", cat: "Contexte", texte: "Agenda macro vérifié — aucune annonce dans les 15 prochaines minutes" },
  { id: "c2", cat: "Contexte", texte: "Plus haut et plus bas de la session asiatique tracés" },
  { id: "c3", cat: "Contexte", texte: "Plus haut, plus bas et clôture de la veille tracés" },
  { id: "c4", cat: "Contexte", texte: "VWAP et zone de valeur de la veille affichés" },
  { id: "c5", cat: "Contexte", texte: "ES et NQ alignés — pas de divergence entre les indices" },

  { id: "t1", cat: "Unités de temps", texte: "H4 — tendance de fond identifiée et notée" },
  { id: "t2", cat: "Unités de temps", texte: "H1 — structure alignée avec le H4, ou range assumé" },
  { id: "t3", cat: "Unités de temps", texte: "M30 — zone d'intérêt délimitée (support, résistance, déséquilibre)" },
  { id: "t4", cat: "Unités de temps", texte: "M15 — niveau d'entrée précis marqué" },
  { id: "t5", cat: "Unités de temps", texte: "M5 — signal de déclenchement confirmé (rejet, cassure retestée)" },

  { id: "e1", cat: "Le trade", texte: "Stop derrière une structure qui invalide l'idée, pas à une distance arbitraire" },
  { id: "e2", cat: "Le trade", texte: "Objectif atteignable avant le premier obstacle majeur" },
  { id: "e3", cat: "Le trade", texte: "Ratio d'au moins 1,5 pour 1" },
  { id: "e4", cat: "Le trade", texte: "Risque en dollars conforme à ma limite par trade" },
  { id: "e5", cat: "Le trade", texte: "Taille de position cohérente avec mon risque, pas avec mon envie" },
  { id: "e6", cat: "Le trade", texte: "Je peux résumer ce trade en une phrase" },

  { id: "m1", cat: "Moi", texte: "Je ne cherche pas à rattraper une perte" },
  { id: "m2", cat: "Moi", texte: "Je n'ai pas dépassé mon nombre de trades du jour" },
  { id: "m3", cat: "Moi", texte: "Capture d'écran prise avant l'entrée" },
  { id: "m4", cat: "Moi", texte: "Si je doute, je passe mon tour" },
];

const CATS = ["Contexte", "Unités de temps", "Le trade", "Moi"];

const GARDE_FOUS_DEFAUT = { maxTrades: 4, maxMicrosJour: 10, maxPertesSuite: 2, perteMaxJour: 400, objectifJour: 300 };

const comptesDefaut = () => ([
  { id: "a", nom: "Compte A", type: "Express Funded", preset: "50K",
    mll: 2000, dll: 1000, maxContrats: 50, plafond: 5000, commissionAR: 1.22,
    chemin: "Standard", seuilJour: 150, split: 90, objectifNet: 2500, couleur: "#F2A03D" },
  { id: "b", nom: "Compte B", type: "Express Funded", preset: "50K",
    mll: 2000, dll: 1000, maxContrats: 50, plafond: 5000, commissionAR: 1.22,
    chemin: "Standard", seuilJour: 150, split: 90, objectifNet: 2500, couleur: "#5AA9E6" },
]);

/* ------------------------------------------------------------------ */
/*  Utilitaires                                                        */
/* ------------------------------------------------------------------ */
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const usd = (n, d = 2) =>
  (n < 0 ? "−" : "") + "$" + Math.abs(n).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (n) => (Number.isFinite(n) ? n.toFixed(1) + " %" : "—");
const jour = (iso) => (iso || "").slice(0, 10);
const dateFr = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) + " · " +
    d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
};
const uid = () => Math.random().toString(36).slice(2, 10);

function calculPnl(t) {
  if (t.pnlManuel) return num(t.pnl);
  const ins = INSTRUMENTS[t.instrument];
  if (!ins || t.entree === "" || t.sortie === "") return 0;
  const sens = t.sens === "Achat" ? 1 : -1;
  const brut = ((num(t.sortie) - num(t.entree)) * sens / ins.tick) * ins.valeurTick * num(t.contrats);
  return brut - num(t.frais);
}
function risqueInitial(t) {
  const ins = INSTRUMENTS[t.instrument];
  if (!ins || !t.stop || t.entree === "") return 0;
  return (Math.abs(num(t.entree) - num(t.stop)) / ins.tick) * ins.valeurTick * num(t.contrats);
}
/* Montant brut à demander pour toucher un net donné */
const brutPourNet = (net, split) => (split >= 100 ? net : net / (split / 100));

/* ------------------------------------------------------------------ */
/*  Statistiques de performance                                        */
/* ------------------------------------------------------------------ */
function statistiques(trades) {
  const n = trades.length;
  if (!n) return {
    n: 0, pnl: 0, gagnants: 0, perdants: 0, tauxReussite: NaN, facteurProfit: NaN,
    gainMoyen: 0, perteMoyenne: 0, ratio: NaN, esperance: 0, meilleur: 0, pire: 0,
    ddMax: 0, serieG: 0, serieP: 0, rTotal: 0, frais: 0, respect: NaN, parJour: [], equity: [],
  };
  const tries = [...trades].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const g = tries.filter((t) => t.pnlNet > 0);
  const p = tries.filter((t) => t.pnlNet < 0);
  const brutG = g.reduce((s, t) => s + t.pnlNet, 0);
  const brutP = Math.abs(p.reduce((s, t) => s + t.pnlNet, 0));
  const pnl = tries.reduce((s, t) => s + t.pnlNet, 0);

  let cum = 0, pic = 0, ddMax = 0, sg = 0, sp = 0, maxG = 0, maxP = 0;
  const equity = tries.map((t, i) => {
    cum += t.pnlNet; pic = Math.max(pic, cum); ddMax = Math.max(ddMax, pic - cum);
    if (t.pnlNet > 0) { sg++; sp = 0; } else if (t.pnlNet < 0) { sp++; sg = 0; }
    maxG = Math.max(maxG, sg); maxP = Math.max(maxP, sp);
    return { i: i + 1, cumul: +cum.toFixed(2) };
  });

  const map = new Map();
  tries.forEach((t) => map.set(jour(t.date), (map.get(jour(t.date)) || 0) + t.pnlNet));
  const parJour = [...map.entries()].sort().map(([d, v]) => ({ date: d, pnl: +v.toFixed(2) }));
  const suivis = tries.filter((t) => t.respect === "Oui" || t.respect === "Non");

  return {
    n, pnl, gagnants: g.length, perdants: p.length,
    tauxReussite: (g.length / n) * 100,
    facteurProfit: brutP > 0 ? brutG / brutP : (brutG > 0 ? Infinity : NaN),
    gainMoyen: g.length ? brutG / g.length : 0,
    perteMoyenne: p.length ? brutP / p.length : 0,
    ratio: p.length && g.length ? (brutG / g.length) / (brutP / p.length) : NaN,
    esperance: pnl / n,
    meilleur: Math.max(...tries.map((t) => t.pnlNet)),
    pire: Math.min(...tries.map((t) => t.pnlNet)),
    ddMax, serieG: maxG, serieP: maxP,
    rTotal: tries.reduce((s, t) => s + (t.R || 0), 0),
    frais: tries.reduce((s, t) => s + num(t.frais), 0),
    respect: suivis.length ? (suivis.filter((t) => t.respect === "Oui").length / suivis.length) * 100 : NaN,
    parJour, equity,
  };
}

/* ------------------------------------------------------------------ */
/*  Mécanique Express Funded Account                                   */
/*  Solde = cumul des P&L nets − retraits. Départ à 0 $.               */
/*  MLL : −mll au départ, suit le plus haut solde de clôture,          */
/*  se verrouille à 0 $, et passe à 0 $ après le premier retrait.      */
/* ------------------------------------------------------------------ */
function situationCompte(compte, tradesCompte, retraitsCompte, aujourdhui) {
  const parJourMap = new Map();
  tradesCompte.forEach((t) => parJourMap.set(jour(t.date), (parJourMap.get(jour(t.date)) || 0) + t.pnlNet));
  const jours = [...parJourMap.entries()].sort();

  const retraits = [...retraitsCompte].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const totalRetire = retraits.reduce((s, r) => s + num(r.brut), 0);
  const totalPercu = retraits.reduce((s, r) => s + num(r.net), 0);
  const dernierRetrait = retraits.length ? retraits[retraits.length - 1].date : null;

  let cumul = 0, pic = 0;
  jours.forEach(([, v]) => { cumul += v; pic = Math.max(pic, cumul); });
  const solde = cumul - totalRetire;

  const mll = retraits.length > 0 ? 0 : Math.min(0, pic - compte.mll);
  const marge = solde - mll;

  const pnlJour = parJourMap.get(aujourdhui) || 0;
  const margeJour = pnlJour < 0 ? compte.dll + pnlJour : compte.dll;

  /* Cycle en cours : jours postérieurs au dernier retrait */
  const cycle = jours.filter(([d]) => !dernierRetrait || d > jour(dernierRetrait));
  const joursGagnants = cycle.filter(([, v]) => v >= compte.seuilJour);
  const profitCycle = cycle.reduce((s, [, v]) => s + v, 0);
  const meilleurJourCycle = cycle.length ? Math.max(...cycle.map(([, v]) => v)) : 0;
  const consistance = profitCycle > 0 ? (meilleurJourCycle / profitCycle) * 100 : NaN;

  /* Objectif de retrait */
  const brutVise = Math.min(brutPourNet(compte.objectifNet, compte.split), compte.plafond);
  const soldeRequis = brutVise * 2;
  const demandable = Math.min(solde * 0.5, compte.plafond);
  const netSiDemande = demandable * (compte.split / 100);

  const joursRequis = compte.chemin === "Standard" ? 5 : 3;
  const joursOk = joursGagnants.length >= joursRequis;
  const soldeOk = solde >= soldeRequis;
  const consistanceOk = compte.chemin === "Standard" ? true : (!Number.isFinite(consistance) || consistance <= 40);
  const eligible = joursOk && solde > 0 && consistanceOk;

  return {
    solde, pic, mll, marge, mllVerrouille: mll === 0,
    pnlJour, margeJour, totalRetire, totalPercu, dernierRetrait,
    joursTrades: jours.length, joursGagnants: joursGagnants.length, joursRequis,
    profitCycle, meilleurJourCycle, consistance,
    brutVise, soldeRequis, demandable, netSiDemande,
    joursOk, soldeOk, consistanceOk, eligible,
    progression: soldeRequis > 0 ? (solde / soldeRequis) * 100 : 0,
    listeJours: cycle,
  };
}

/* État de la séance en cours face aux garde-fous personnels */
function etatSeance(tradesDuJour, gf) {
  const tries = [...tradesDuJour].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const pnl = tries.reduce((s, t) => s + t.pnlNet, 0);
  let suite = 0;
  tries.forEach((t) => { if (t.pnlNet < 0) suite++; else if (t.pnlNet > 0) suite = 0; });

  const micros = tries.reduce((s, t) => s + num(t.contrats), 0);

  const alertes = [];
  if (micros >= gf.maxMicrosJour) alertes.push(`Budget du jour épuisé : ${micros} micros sur ${gf.maxMicrosJour}.`);
  if (tries.length >= gf.maxTrades) alertes.push(`Vous avez atteint vos ${gf.maxTrades} trades du jour.`);
  if (suite >= gf.maxPertesSuite) alertes.push(`${suite} pertes d'affilée — la règle dit : on ferme l'écran.`);
  if (pnl <= -Math.abs(gf.perteMaxJour)) alertes.push(`Perte du jour de ${usd(Math.abs(pnl), 0)}, au-delà de votre limite.`);

  const objectifAtteint = pnl >= gf.objectifJour;
  const niveau = alertes.length ? "stop"
    : (micros >= gf.maxMicrosJour * 0.7 || tries.length >= gf.maxTrades - 1 || suite >= 1) ? "prudence" : "vert";
  return { pnl, suite, nbTrades: tries.length, micros, reste: gf.maxMicrosJour - micros, alertes, objectifAtteint, niveau };
}

/* ------------------------------------------------------------------ */
/*  Import de l'export TopstepX                                        */
/*  Colonnes : Id, ContractName, EnteredAt, ExitedAt, EntryPrice,      */
/*  ExitPrice, Fees, PnL, Size, Type, TradeDay, TradeDuration,         */
/*  Commissions. Le PnL est brut : on retranche frais + commissions.   */
/* ------------------------------------------------------------------ */
function symboleVersInstrument(nom) {
  const s = (nom || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const cles = Object.keys(INSTRUMENTS).sort((a, b) => b.length - a.length);
  return cles.find((k) => s.startsWith(k)) || null;
}

function dateIso(txt) {
  if (!txt) return "";
  const m = txt.match(/(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})/);
  if (m) return `${m[3]}-${m[1]}-${m[2]}T${m[4]}:${m[5]}`;
  const d = new Date(txt);
  return isNaN(d) ? "" : d.toISOString().slice(0, 16);
}

function lireCsv(texte) {
  const lignes = texte.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lignes.length) return [];
  const sep = (lignes[0].match(/;/g) || []).length > (lignes[0].match(/,/g) || []).length ? ";" : ",";
  const decoupe = (l) => {
    const out = []; let cur = "", guillemet = false;
    for (const ch of l) {
      if (ch === '"') guillemet = !guillemet;
      else if (ch === sep && !guillemet) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur); return out.map((v) => v.trim());
  };
  const entetes = decoupe(lignes[0]);
  return lignes.slice(1).map((l) => {
    const v = decoupe(l);
    return Object.fromEntries(entetes.map((h, i) => [h, v[i] ?? ""]));
  });
}

function importerTopstep(texte, compteId, setupParDefaut) {
  const brut = lireCsv(texte);
  const trades = [];
  let ignores = 0;

  brut.forEach((r) => {
    const instrument = symboleVersInstrument(r.ContractName || r.Contract || r.Symbol);
    const date = dateIso(r.EnteredAt || r.TradeDay);
    const pnlBrut = parseFloat(r.PnL);
    if (!instrument || !date || !Number.isFinite(pnlBrut)) { ignores++; return; }

    const frais = (parseFloat(r.Fees) || 0) + (parseFloat(r.Commissions) || 0);
    trades.push({
      id: "tsx-" + (r.Id || uid()),
      compteId, date, instrument,
      sens: /short|sell|vente/i.test(r.Type || "") ? "Vente" : "Achat",
      contrats: parseInt(r.Size) || 1,
      entree: r.EntryPrice ? String(+parseFloat(r.EntryPrice).toFixed(2)) : "",
      sortie: r.ExitPrice ? String(+parseFloat(r.ExitPrice).toFixed(2)) : "",
      stop: "", objectifPrix: "",
      frais: +frais.toFixed(2),
      pnlManuel: true, pnl: +(pnlBrut - frais).toFixed(2),
      setup: setupParDefaut, session: "Ouverture NY", emotion: "Calme",
      respect: "Oui", notes: "Importé depuis TopstepX", lien: "",
      sortieLe: dateIso(r.ExitedAt), duree: r.TradeDuration || "",
    });
  });
  return { trades, ignores, lus: brut.length };
}

/* ------------------------------------------------------------------ */
/*  Éléments d'interface                                               */
/* ------------------------------------------------------------------ */
const Kpi = ({ label, valeur, sous, ton }) => (
  <div className="kpi">
    <span className="kpi-l">{label}</span>
    <span className={"kpi-v " + (ton || "")}>{valeur}</span>
    {sous && <span className="kpi-s">{sous}</span>}
  </div>
);

const Champ = ({ label, children, large }) => (
  <label className={"champ" + (large ? " champ-large" : "")}>
    <span>{label}</span>
    {children}
  </label>
);

const Jauge = ({ label, valeur, total, texte, inverse }) => {
  const r = total > 0 ? Math.max(0, Math.min(1, valeur / total)) : 0;
  const couleur = inverse
    ? (r > 0.5 ? "#3DD68C" : r > 0.25 ? "#F2A03D" : "#FF5C5C")
    : (r >= 1 ? "#3DD68C" : "#F2A03D");
  return (
    <div className="jauge">
      <div className="jauge-tete"><span>{label}</span><b style={{ color: couleur }}>{texte}</b></div>
      <div className="jauge-piste"><div className="jauge-barre" style={{ width: r * 100 + "%", background: couleur }} /></div>
    </div>
  );
};

/* Signature : la ligne de vie du compte, du plancher MLL au solde de retrait */
function LigneDeVie({ compte, s }) {
  const bas = Math.min(s.mll, 0) - compte.mll * 0.1;
  const haut = Math.max(s.soldeRequis, s.pic, s.solde) * 1.12 || 1000;
  const pos = (v) => Math.max(0, Math.min(100, ((v - bas) / (haut - bas)) * 100));
  const danger = s.marge <= compte.mll * 0.25;

  return (
    <div className="vie">
      <div className="vie-tete">
        <div>
          <span className="pastille" style={{ background: compte.couleur }} />
          <strong>{compte.nom}</strong>
          <span className="tag">{compte.type} · {compte.preset}</span>
        </div>
        <span className={"vie-solde " + (s.solde >= 0 ? "gain" : "perte")}>{usd(s.solde, 0)}</span>
      </div>

      <div className="rail">
        <div className="rail-fond" />
        <div className="rail-zone" style={{
          left: pos(s.mll) + "%", width: Math.max(0, pos(s.solde) - pos(s.mll)) + "%",
          background: `linear-gradient(90deg, ${danger ? "#FF5C5C" : "#3DD68C"}22, ${danger ? "#FF5C5C" : "#3DD68C"}66)`
        }} />
        <div className="rail-marque seuil" style={{ left: pos(s.mll) + "%" }} />
        <div className="rail-marque cible" style={{ left: pos(s.soldeRequis) + "%" }} />
        <div className="rail-marque pic" style={{ left: pos(s.pic) + "%" }} />
        <div className="rail-curseur" style={{ left: pos(s.solde) + "%", borderColor: compte.couleur }} />
      </div>

      <div className="vie-legende">
        <span><em>Plancher MLL</em>{usd(s.mll, 0)}{s.mllVerrouille && <b className="verrou"> verrouillé</b>}</span>
        <span><em>Plus haut</em>{usd(s.pic, 0)}</span>
        <span><em>Solde à atteindre</em>{usd(s.soldeRequis, 0)}</span>
      </div>

      <div className="vie-jauges">
        <Jauge label="Marge avant clôture du compte" valeur={s.marge} total={compte.mll}
          texte={usd(Math.max(0, s.marge), 0)} inverse />
        <Jauge label="Perte du jour restante" valeur={s.margeJour} total={compte.dll}
          texte={usd(Math.max(0, s.margeJour), 0)} inverse />
        <Jauge label={`Jours gagnants (≥ ${usd(compte.seuilJour, 0)})`} valeur={s.joursGagnants} total={s.joursRequis}
          texte={`${s.joursGagnants} / ${s.joursRequis}`} />
        <Jauge label="Solde vers le retrait visé" valeur={s.solde} total={s.soldeRequis}
          texte={pct(s.progression)} />
      </div>
    </div>
  );
}

function Repartition({ titre, lignes }) {
  const maxAbs = Math.max(1, ...lignes.map((l) => Math.abs(l.pnl)));
  if (!lignes.length) return null;
  return (
    <div className="carte">
      <h3>{titre}</h3>
      <table className="tbl compact">
        <thead><tr><th>Catégorie</th><th>Trades</th><th>Réussite</th><th>P&L net</th><th className="col-barre"></th></tr></thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.cle}>
              <td>{l.cle}</td>
              <td className="mono">{l.n}</td>
              <td className="mono">{pct(l.taux)}</td>
              <td className={"mono " + (l.pnl >= 0 ? "gain" : "perte")}>{usd(l.pnl)}</td>
              <td className="col-barre">
                <div className="mini"><div className="mini-b" style={{
                  width: (Math.abs(l.pnl) / maxAbs) * 100 + "%",
                  background: l.pnl >= 0 ? "#3DD68C" : "#FF5C5C",
                }} /></div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Application                                                        */
/* ------------------------------------------------------------------ */
export default function JournalTrading() {
  const [pret, setPret] = useState(false);
  const [erreur, setErreur] = useState("");
  const [comptes, setComptes] = useState(comptesDefaut);
  const [trades, setTrades] = useState([]);
  const [retraits, setRetraits] = useState([]);
  const [notes, setNotes] = useState({});
  const [setups, setSetups] = useState(SETUPS_DEFAUT);
  const [checklist, setChecklist] = useState(CHECKLIST_DEFAUT);
  const [gardeFous, setGardeFous] = useState(GARDE_FOUS_DEFAUT);
  const [coches, setCoches] = useState({});

  const [onglet, setOnglet] = useState("bord");
  const [fCompte, setFCompte] = useState("tous");
  const [fPeriode, setFPeriode] = useState("tout");
  const [fInstrument, setFInstrument] = useState("tous");
  const [fSetup, setFSetup] = useState("tous");
  const [recherche, setRecherche] = useState("");
  const [edition, setEdition] = useState(null);
  const [nouveauRetrait, setNouveauRetrait] = useState(null);
  const [importEnCours, setImportEnCours] = useState(null);
  const [rapportImport, setRapportImport] = useState("");

  const aujourdhui = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    (async () => {
      try {
        const r = await stockage.get(CLE);
        if (r && r.value) {
          const d = JSON.parse(r.value);
          if (d.comptes?.length === 2) setComptes(d.comptes);
          if (Array.isArray(d.trades)) setTrades(d.trades);
          if (Array.isArray(d.retraits)) setRetraits(d.retraits);
          if (d.notes) setNotes(d.notes);
          if (Array.isArray(d.setups) && d.setups.length) setSetups(d.setups);
          if (Array.isArray(d.checklist) && d.checklist.length) setChecklist(d.checklist);
          if (d.gardeFous) setGardeFous({ ...GARDE_FOUS_DEFAUT, ...d.gardeFous });
          if (d.coches) setCoches(d.coches);
        }
      } catch (e) { /* première utilisation */ }
      finally { setPret(true); }
    })();
  }, []);

  useEffect(() => {
    if (!pret) return;
    const t = setTimeout(async () => {
      try {
        await stockage.set(CLE, JSON.stringify({ comptes, trades, retraits, notes, setups, checklist, gardeFous, coches }));
        setErreur("");
      } catch (e) { setErreur("Enregistrement impossible. Vos dernières saisies ne sont pas sauvegardées."); }
    }, 400);
    return () => clearTimeout(t);
  }, [comptes, trades, retraits, notes, setups, checklist, gardeFous, coches, pret]);

  const enrichis = useMemo(() => trades.map((t) => {
    const pnlNet = calculPnl(t);
    const risque = risqueInitial(t);
    return { ...t, pnlNet, risque, R: risque > 0 ? pnlNet / risque : 0 };
  }), [trades]);

  const filtres = useMemo(() => {
    const limite = { "7j": 7, "30j": 30, "90j": 90 }[fPeriode];
    const borne = limite ? new Date(Date.now() - limite * 864e5).toISOString().slice(0, 10) : null;
    const q = recherche.trim().toLowerCase();
    return enrichis.filter((t) =>
      (fCompte === "tous" || t.compteId === fCompte) &&
      (fInstrument === "tous" || t.instrument === fInstrument) &&
      (fSetup === "tous" || t.setup === fSetup) &&
      (fPeriode === "jour" ? jour(t.date) === aujourdhui : (!borne || jour(t.date) >= borne)) &&
      (!q || [t.instrument, t.setup, t.notes, t.emotion, t.session].join(" ").toLowerCase().includes(q))
    ).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [enrichis, fCompte, fInstrument, fSetup, fPeriode, recherche, aujourdhui]);

  const st = useMemo(() => statistiques(filtres), [filtres]);

  const groupe = useCallback((cle) => {
    const m = new Map();
    filtres.forEach((t) => {
      const k = (typeof cle === "function" ? cle(t) : t[cle]) || "Non renseigné";
      const o = m.get(k) || { cle: k, n: 0, g: 0, pnl: 0 };
      o.n++; if (t.pnlNet > 0) o.g++; o.pnl += t.pnlNet; m.set(k, o);
    });
    return [...m.values()].map((o) => ({ ...o, taux: (o.g / o.n) * 100 })).sort((a, b) => b.pnl - a.pnl);
  }, [filtres]);

  const situ = useCallback((c) => situationCompte(
    c,
    enrichis.filter((t) => t.compteId === c.id),
    retraits.filter((r) => r.compteId === c.id),
    aujourdhui
  ), [enrichis, retraits, aujourdhui]);

  /* actions */
  const nouveauTrade = () => setEdition({
    id: null, compteId: comptes[0].id, date: new Date().toISOString().slice(0, 16),
    instrument: "MNQ", sens: "Achat", contrats: 1, entree: "", sortie: "", stop: "", objectifPrix: "",
    frais: comptes[0].commissionAR, pnlManuel: false, pnl: 0,
    setup: setups[0], session: SESSIONS[1], emotion: "Calme", respect: "Oui", notes: "", lien: "",
  });
  const enregistrerTrade = () => {
    const t = { ...edition, id: edition.id || uid() };
    setTrades((p) => edition.id ? p.map((x) => (x.id === t.id ? t : x)) : [t, ...p]);
    setEdition(null);
  };
  const majCompte = (id, patch) => setComptes((p) => p.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const appliquerPreset = (id, preset) => majCompte(id, { preset, ...PRESETS[preset] });

  const ouvrirRetrait = (c) => {
    const s = situ(c);
    const brut = +Math.max(0, s.demandable).toFixed(2);
    setNouveauRetrait({ id: null, compteId: c.id, date: aujourdhui, brut, net: +(brut * c.split / 100).toFixed(2) });
  };
  const enregistrerRetrait = () => {
    setRetraits((p) => [...p, { ...nouveauRetrait, id: uid() }]);
    setNouveauRetrait(null);
  };

  const traiterFichier = async (fichier, compteId) => {
    try {
      const texte = await fichier.text();
      const { trades: lus, ignores, lus: total } = importerTopstep(texte, compteId, setups[0]);
      const existants = new Set(trades.map((t) => t.id));
      const nouveaux = lus.filter((t) => !existants.has(t.id));
      const doublons = lus.length - nouveaux.length;
      setTrades((p) => [...nouveaux, ...p]);
      setRapportImport(
        nouveaux.length
          ? `${nouveaux.length} trade${nouveaux.length > 1 ? "s" : ""} ajouté${nouveaux.length > 1 ? "s" : ""}` +
            (doublons ? ` · ${doublons} déjà présent${doublons > 1 ? "s" : ""}` : "") +
            (ignores ? ` · ${ignores} ligne${ignores > 1 ? "s" : ""} illisible${ignores > 1 ? "s" : ""}` : "")
          : `Aucun nouveau trade — ${doublons} déjà dans le carnet.`
      );
      setImportEnCours(null);
    } catch (e) {
      setRapportImport("Fichier illisible. Vérifiez qu'il s'agit bien du CSV exporté depuis l'onglet Trades.");
    }
  };

  const exporterCsv = () => {
    const cols = ["date", "compte", "instrument", "sens", "contrats", "entree", "sortie", "stop", "frais", "pnlNet", "R", "setup", "session", "emotion", "respect", "notes"];
    const lignes = [cols.join(";")].concat(filtres.map((t) => cols.map((c) => {
      const v = c === "compte" ? (comptes.find((x) => x.id === t.compteId)?.nom || "") :
        c === "pnlNet" ? t.pnlNet.toFixed(2) : c === "R" ? t.R.toFixed(2) : t[c];
      return String(v ?? "").replace(/[;\n]/g, " ");
    }).join(";")));
    const url = URL.createObjectURL(new Blob(["\uFEFF" + lignes.join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = "journal-trading.csv"; a.click(); URL.revokeObjectURL(url);
  };

  if (!pret) return <div className="app"><style>{CSS}</style><div className="chargement">Ouverture du carnet…</div></div>;

  const compteEdite = edition ? comptes.find((c) => c.id === edition.compteId) : null;
  const apercuPnl = edition ? calculPnl(edition) : 0;
  const apercuRisque = edition ? risqueInitial(edition) : 0;
  const objectifCombine = comptes.reduce((s, c) => s + c.objectifNet, 0);

  return (
    <div className="app">
      <style>{CSS}</style>

      <header className="tete">
        <div className="titre">
          <h1>Carnet de bord</h1>
          <p>Deux Express Funded Accounts · objectif {usd(objectifCombine, 0)} net par mois</p>
        </div>
        <div className="tete-actions">
          <button className="btn primaire" onClick={nouveauTrade}>+ Saisir un trade</button>
          <button className="btn" onClick={() => { setRapportImport(""); setImportEnCours(comptes[0].id); }}>
            Importer un export TopstepX
          </button>
          <button className="btn" onClick={exporterCsv}>Exporter en CSV</button>
        </div>
      </header>

      {erreur && <div className="alerte">{erreur}</div>}

      <nav className="onglets" role="tablist">
        {[["bord", "Tableau de bord"], ["retraits", "Retraits"], ["trades", "Trades"],
          ["analyse", "Analyse"], ["journal", "Rituel"], ["comptes", "Comptes"]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={onglet === k}
            className={"onglet" + (onglet === k ? " actif" : "")} onClick={() => setOnglet(k)}>{l}</button>
        ))}
      </nav>

      {["bord", "trades", "analyse"].includes(onglet) && (
        <div className="filtres">
          <div className="segment">
            <button className={fCompte === "tous" ? "actif" : ""} onClick={() => setFCompte("tous")}>Les deux</button>
            {comptes.map((c) => (
              <button key={c.id} className={fCompte === c.id ? "actif" : ""} onClick={() => setFCompte(c.id)}>
                <span className="pastille" style={{ background: c.couleur }} />{c.nom}
              </button>
            ))}
          </div>
          <select value={fPeriode} onChange={(e) => setFPeriode(e.target.value)}>
            <option value="jour">Aujourd'hui</option>
            <option value="7j">7 derniers jours</option>
            <option value="30j">30 derniers jours</option>
            <option value="90j">90 derniers jours</option>
            <option value="tout">Tout l'historique</option>
          </select>
          <select value={fInstrument} onChange={(e) => setFInstrument(e.target.value)}>
            <option value="tous">Tous les instruments</option>
            {Object.keys(INSTRUMENTS).map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
          <select value={fSetup} onChange={(e) => setFSetup(e.target.value)}>
            <option value="tous">Toutes les stratégies</option>
            {setups.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input className="recherche" placeholder="Rechercher dans les notes…"
            value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        </div>
      )}

      {/* ---------------- TABLEAU DE BORD ---------------- */}
      {onglet === "bord" && (
        <>
          <section className="vies">
            {comptes.map((c) => <LigneDeVie key={c.id} compte={c} s={situ(c)} />)}
          </section>

          <section className="kpis">
            <Kpi label="P&L net" valeur={usd(st.pnl)} ton={st.pnl >= 0 ? "gain" : "perte"}
              sous={`${st.n} trades · ${usd(st.frais)} de frais`} />
            <Kpi label="Taux de réussite" valeur={pct(st.tauxReussite)} sous={`${st.gagnants} G / ${st.perdants} P`} />
            <Kpi label="Facteur de profit" valeur={Number.isFinite(st.facteurProfit) ? st.facteurProfit.toFixed(2) : "—"}
              ton={st.facteurProfit >= 1.5 ? "gain" : st.facteurProfit < 1 ? "perte" : ""} sous="Gains ÷ pertes" />
            <Kpi label="Espérance par trade" valeur={usd(st.esperance)} ton={st.esperance >= 0 ? "gain" : "perte"}
              sous={`Total ${st.rTotal.toFixed(2)} R`} />
            <Kpi label="Gain moyen" valeur={usd(st.gainMoyen)} ton="gain"
              sous={`Ratio ${Number.isFinite(st.ratio) ? st.ratio.toFixed(2) : "—"}`} />
            <Kpi label="Perte moyenne" valeur={usd(st.perteMoyenne)} ton="perte" sous={`Pire trade ${usd(st.pire)}`} />
            <Kpi label="Repli maximal" valeur={usd(st.ddMax)} ton="perte" sous="Sur la courbe filtrée" />
            <Kpi label="Plan respecté" valeur={pct(st.respect)} sous={`Séries : ${st.serieG} G / ${st.serieP} P`} />
          </section>

          <section className="grille2">
            <div className="carte">
              <h3>Courbe de capitaux <span className="sous">cumul net, trade après trade</span></h3>
              {st.equity.length ? (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={st.equity} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke="#1E2733" vertical={false} />
                    <XAxis dataKey="i" stroke="#5C6B7E" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#5C6B7E" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip content={<Info suffixe="Trade" />} />
                    <ReferenceLine y={0} stroke="#2C3846" />
                    <Line type="monotone" dataKey="cumul" stroke="#F2A03D" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <p className="vide">Saisissez un premier trade pour voir la courbe se dessiner.</p>}
            </div>

            <div className="carte">
              <h3>Résultat quotidien <span className="sous">la ligne ambre marque le seuil du jour gagnant</span></h3>
              {st.parJour.length ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={st.parJour} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke="#1E2733" vertical={false} />
                    <XAxis dataKey="date" stroke="#5C6B7E" fontSize={10} tickLine={false} axisLine={false}
                      tickFormatter={(d) => d.slice(5)} />
                    <YAxis stroke="#5C6B7E" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip content={<Info suffixe="Séance" />} />
                    <ReferenceLine y={0} stroke="#2C3846" />
                    <ReferenceLine y={comptes[0].seuilJour} stroke="#F2A03D" strokeDasharray="4 4" />
                    <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                      {st.parJour.map((d, i) => (
                        <Cell key={i} fill={d.pnl >= comptes[0].seuilJour ? "#3DD68C" : d.pnl >= 0 ? "#2A6B4C" : "#FF5C5C"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="vide">Aucune séance enregistrée sur cette période.</p>}
            </div>
          </section>
        </>
      )}

      {/* ---------------- RETRAITS ---------------- */}
      {onglet === "retraits" && (
        <>
          <section className="grille2">
            {comptes.map((c) => {
              const s = situ(c);
              const manque = Math.max(0, s.soldeRequis - s.solde);
              return (
                <div key={c.id} className="carte">
                  <h3><span className="pastille" style={{ background: c.couleur }} />{c.nom}
                    <span className="sous">parcours {c.chemin}</span></h3>

                  <div className="etapes">
                    <Etape ok={s.joursOk} titre={`${s.joursRequis} jours gagnants`}
                      detail={`${s.joursGagnants} sur ${s.joursRequis} · seuil ${usd(c.seuilJour, 0)} net`} />
                    <Etape ok={s.soldeOk} titre="Solde suffisant"
                      detail={s.soldeOk ? `${usd(s.solde, 0)} disponible`
                        : `${usd(manque, 0)} à gagner pour viser ${usd(c.objectifNet, 0)} net`} />
                    {c.chemin === "Consistance" && (
                      <Etape ok={s.consistanceOk} titre="Consistance sous 40 %"
                        detail={Number.isFinite(s.consistance) ? `Meilleure séance : ${pct(s.consistance)} du profit` : "Pas encore de profit sur le cycle"} />
                    )}
                  </div>

                  <div className="recap">
                    <div><em>Solde du compte</em><b>{usd(s.solde, 0)}</b></div>
                    <div><em>Demandable (50 %)</em><b>{usd(Math.max(0, s.demandable), 0)}</b></div>
                    <div><em>Net perçu ({c.split} %)</em><b className="gain">{usd(Math.max(0, s.netSiDemande), 0)}</b></div>
                    <div><em>Solde après retrait</em><b>{usd(Math.max(0, s.solde - s.demandable), 0)}</b></div>
                    <div><em>Plancher MLL</em><b>{usd(s.mll, 0)}</b></div>
                    <div><em>Déjà perçu</em><b>{usd(s.totalPercu, 0)}</b></div>
                  </div>

                  <p className="aide">
                    Après un retrait, le MLL passe à 0 $ : le solde qui reste devient votre seule marge.
                    Ici, il vous resterait {usd(Math.max(0, s.solde - s.demandable), 0)} avant la clôture du compte.
                  </p>

                  <button className="btn primaire pleine" disabled={s.demandable <= 0}
                    onClick={() => ouvrirRetrait(c)}>Enregistrer un retrait</button>
                </div>
              );
            })}
          </section>

          <section className="carte">
            <h3>Retraits enregistrés <span className="sous">
              total perçu : {usd(retraits.reduce((s, r) => s + num(r.net), 0), 0)}</span></h3>
            {retraits.length === 0 ? (
              <p className="vide">Aucun retrait pour l'instant. Ils apparaîtront ici et remettront le compteur de jours gagnants à zéro.</p>
            ) : (
              <table className="tbl">
                <thead><tr><th>Date</th><th>Compte</th><th>Demandé</th><th>Net perçu</th><th></th></tr></thead>
                <tbody>
                  {[...retraits].sort((a, b) => b.date.localeCompare(a.date)).map((r) => {
                    const c = comptes.find((x) => x.id === r.compteId);
                    return (
                      <tr key={r.id}>
                        <td className="mono">{r.date}</td>
                        <td><span className="pastille" style={{ background: c?.couleur }} />{c?.nom}</td>
                        <td className="mono">{usd(num(r.brut))}</td>
                        <td className="mono gain">{usd(num(r.net))}</td>
                        <td><button className="lien danger" onClick={() => setRetraits((p) => p.filter((x) => x.id !== r.id))}>Supprimer</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      {/* ---------------- TRADES ---------------- */}
      {onglet === "trades" && (
        <section className="carte">
          <h3>{filtres.length} trade{filtres.length > 1 ? "s" : ""} <span className="sous">P&L filtré : {usd(st.pnl)}</span></h3>
          {filtres.length === 0 ? (
            <p className="vide">Rien à afficher ici. Saisissez un trade pour commencer votre historique.</p>
          ) : (
            <div className="defile">
              <table className="tbl">
                <thead><tr>
                  <th>Date</th><th>Compte</th><th>Instrument</th><th>Sens</th><th>Ctr</th>
                  <th>Entrée</th><th>Sortie</th><th>R</th><th>P&L net</th><th>Stratégie</th><th>Plan</th><th></th>
                </tr></thead>
                <tbody>
                  {filtres.map((t) => {
                    const c = comptes.find((x) => x.id === t.compteId);
                    return (
                      <tr key={t.id}>
                        <td className="mono nowrap">{dateFr(t.date)}</td>
                        <td><span className="pastille" style={{ background: c?.couleur || "#555" }} />{c?.nom || "—"}</td>
                        <td className="mono fort">{t.instrument}</td>
                        <td><span className={"sens " + (t.sens === "Achat" ? "long" : "court")}>{t.sens}</span></td>
                        <td className="mono">{t.contrats}</td>
                        <td className="mono">{t.entree}</td>
                        <td className="mono">{t.sortie}</td>
                        <td className={"mono " + (t.R >= 0 ? "gain" : "perte")}>{t.risque ? t.R.toFixed(2) : "—"}</td>
                        <td className={"mono fort " + (t.pnlNet >= 0 ? "gain" : "perte")}>{usd(t.pnlNet)}</td>
                        <td className="petit">{t.setup}</td>
                        <td>{t.respect === "Non" ? <span className="badge rouge">Écart</span> : <span className="badge vert">OK</span>}</td>
                        <td className="nowrap">
                          <button className="lien" onClick={() => setEdition({ ...t })}>Modifier</button>
                          <button className="lien danger" onClick={() => setTrades((p) => p.filter((x) => x.id !== t.id))}>Supprimer</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ---------------- ANALYSE ---------------- */}
      {onglet === "analyse" && (
        <section className="grille2">
          <Repartition titre="Par instrument" lignes={groupe("instrument")} />
          <Repartition titre="Par stratégie" lignes={groupe("setup")} />
          <Repartition titre="Par session" lignes={groupe("session")} />
          <Repartition titre="Par état d'esprit" lignes={groupe("emotion")} />
          <Repartition titre="Par sens" lignes={groupe("sens")} />
          <Repartition titre="Par jour de la semaine" lignes={groupe((t) =>
            new Date(t.date).toLocaleDateString("fr-FR", { weekday: "long" }))} />
          <Repartition titre="Respect du plan" lignes={groupe((t) => t.respect === "Oui" ? "Plan suivi" : "Écart au plan")} />
          <Repartition titre="Par nombre de contrats" lignes={groupe((t) => t.contrats + " contrat" + (t.contrats > 1 ? "s" : ""))} />
        </section>
      )}

      {/* ---------------- JOURNAL ---------------- */}
      {onglet === "journal" && (() => {
        const note = notes[aujourdhui] || {};
        const setNote = (k, v) => setNotes({ ...notes, [aujourdhui]: { ...note, [k]: v } });
        const cochesJour = coches[aujourdhui] || {};
        const setCoche = (id, v) => setCoches({ ...coches, [aujourdhui]: { ...cochesJour, [id]: v } });
        const faits = checklist.filter((c) => cochesJour[c.id]).length;
        const complet = faits === checklist.length;
        const tradesJour = enrichis.filter((t) => jour(t.date) === aujourdhui);
        const seance = etatSeance(tradesJour, gardeFous);
        const prepFaite = !!(note.fond && note.asie);

        return (
        <>
        <section className="feu-zone">
          <div className={"feu " + seance.niveau}>
            <div className="feu-etat">
              <span className="feu-point" />
              <div>
                <b>{seance.niveau === "stop" ? "On s'arrête là"
                  : seance.niveau === "prudence" ? "Prudence" : "Feu vert"}</b>
                <span>
                  {seance.micros}/{gardeFous.maxMicrosJour} micros · {seance.nbTrades} trade{seance.nbTrades > 1 ? "s" : ""} · {usd(seance.pnl)}
                  {seance.suite > 0 && ` · ${seance.suite} perte${seance.suite > 1 ? "s" : ""} d'affilée`}
                </span>
              </div>
            </div>
            <div className="feu-check">
              <span>Préparation {prepFaite ? "faite" : "à remplir"}</span>
              <span>Checklist {faits}/{checklist.length}</span>
            </div>
          </div>
          {seance.alertes.map((a, i) => <div key={i} className="alerte">{a}</div>)}
          {seance.objectifAtteint && seance.niveau !== "stop" && (
            <div className="alerte douce">
              Objectif du jour atteint ({usd(seance.pnl, 0)}). La journée gagnante est acquise — chaque trade
              supplémentaire risque de vous la reprendre.
            </div>
          )}
        </section>

        <section className="grille2">
          <div className="carte">
            <h3>Préparation du matin
              <span className="sous">{new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</span></h3>
            <div className="formulaire">
              <Champ label="Tendance de fond (H4 / journalier)">
                <select value={note.fond || ""} onChange={(e) => setNote("fond", e.target.value)}>
                  <option value="">À définir</option>
                  <option>Haussière</option><option>Baissière</option><option>Range</option><option>Indécise — je reste à l'écart</option>
                </select>
              </Champ>
              <Champ label="Session asiatique">
                <select value={note.asie || ""} onChange={(e) => setNote("asie", e.target.value)}>
                  <option value="">À définir</option>
                  <option>Haussière</option><option>Baissière</option><option>Range étroit</option><option>Range large</option>
                </select>
              </Champ>
              <Champ label="Plus haut / plus bas asiatique">
                <input placeholder="30 210 / 30 145" value={note.bornesAsie || ""} onChange={(e) => setNote("bornesAsie", e.target.value)} />
              </Champ>
              <Champ label="Plus haut / plus bas de la veille">
                <input placeholder="30 290 / 30 090" value={note.bornesVeille || ""} onChange={(e) => setNote("bornesVeille", e.target.value)} />
              </Champ>
              <Champ label="Niveaux à surveiller" large>
                <textarea rows={2} value={note.niveaux || ""} onChange={(e) => setNote("niveaux", e.target.value)}
                  placeholder="VWAP, zone de valeur, ouverture RTH, gaps, chiffres ronds…" />
              </Champ>
              <Champ label="Agenda macro du jour" large>
                <input value={note.agenda || ""} onChange={(e) => setNote("agenda", e.target.value)}
                  placeholder="14 h 30 — CPI · 20 h — FOMC · rien avant 15 h" />
              </Champ>
              <Champ label="Scénario principal et invalidation" large>
                <textarea rows={2} value={note.plan || ""} onChange={(e) => setNote("plan", e.target.value)}
                  placeholder="Si le prix tient au-dessus de X, je cherche un repli vers Y. Idée annulée sous Z." />
              </Champ>
              <Champ label="Forme du jour" large>
                <div className="curseurs">
                  {[["sommeil", "Sommeil"], ["energie", "Énergie"], ["calme", "Calme"]].map(([k, l]) => (
                    <div key={k} className="curseur">
                      <span>{l}<b>{note[k] || 3}/5</b></span>
                      <input type="range" min="1" max="5" value={note[k] || 3}
                        onChange={(e) => setNote(k, num(e.target.value))} />
                    </div>
                  ))}
                </div>
              </Champ>
            </div>
            {(num(note.sommeil || 3) <= 2 || num(note.calme || 3) <= 2) && (
              <p className="aide" style={{ color: "#F2A03D" }}>
                Nuit courte ou tête ailleurs : c'est le profil de journée où l'on prend les trades qu'on regrette.
                Taille réduite, ou pas de trade du tout.
              </p>
            )}
          </div>

          <div className="carte">
            <h3>Avant d'entrer
              <span className="sous">{faits} / {checklist.length} validés</span></h3>
            <div className="jauge-piste" style={{ marginBottom: 16 }}>
              <div className="jauge-barre" style={{
                width: (faits / checklist.length) * 100 + "%",
                background: complet ? "#3DD68C" : "#F2A03D"
              }} />
            </div>

            {CATS.map((cat) => (
              <div key={cat} className="bloc-check">
                <h4>{cat}</h4>
                {checklist.filter((c) => c.cat === cat).map((c) => (
                  <label key={c.id} className={"ligne-check" + (cochesJour[c.id] ? " ok" : "")}>
                    <input type="checkbox" checked={!!cochesJour[c.id]} onChange={(e) => setCoche(c.id, e.target.checked)} />
                    <span>{c.texte}</span>
                    <button className="lien danger" onClick={(e) => { e.preventDefault(); setChecklist(checklist.filter((x) => x.id !== c.id)); }}>×</button>
                  </label>
                ))}
              </div>
            ))}

            <div className="modal-pied" style={{ justifyContent: "space-between" }}>
              <button className="lien" onClick={() => setCoches({ ...coches, [aujourdhui]: {} })}>Tout décocher</button>
              <span className={"badge " + (complet ? "vert" : "rouge")}>
                {complet ? "Trade validé" : "Checklist incomplète"}
              </span>
            </div>
            <AjoutCheck onAdd={(item) => setChecklist([...checklist, item])} />
          </div>

          <div className="carte">
            <h3>Mes garde-fous <span className="sous">appliqués en direct au feu ci-dessus</span></h3>
            <div className="formulaire">
              <Champ label="Micros maximum par jour">
                <input type="number" value={gardeFous.maxMicrosJour} onChange={(e) => setGardeFous({ ...gardeFous, maxMicrosJour: num(e.target.value) })} />
              </Champ>
              <Champ label="Trades maximum par jour">
                <input type="number" value={gardeFous.maxTrades} onChange={(e) => setGardeFous({ ...gardeFous, maxTrades: num(e.target.value) })} />
              </Champ>
              <Champ label="Pertes d'affilée avant arrêt">
                <input type="number" value={gardeFous.maxPertesSuite} onChange={(e) => setGardeFous({ ...gardeFous, maxPertesSuite: num(e.target.value) })} />
              </Champ>
              <Champ label="Perte maximale du jour">
                <input type="number" value={gardeFous.perteMaxJour} onChange={(e) => setGardeFous({ ...gardeFous, perteMaxJour: num(e.target.value) })} />
              </Champ>
              <Champ label="Objectif du jour">
                <input type="number" value={gardeFous.objectifJour} onChange={(e) => setGardeFous({ ...gardeFous, objectifJour: num(e.target.value) })} />
              </Champ>
            </div>
            <p className="aide">
              À 5 micros sur le MNQ, chaque point vaut 10 $ : un budget de {gardeFous.maxMicrosJour} micros
              correspond à deux positions de cette taille, pas davantage.
              Votre perte maximale du jour devrait rester bien en dessous du DLL de {usd(comptes[0].dll, 0)} :
              la limite Topstep ferme le compte, la vôtre doit vous arrêter longtemps avant.
              Et un objectif journalier au-dessus de {usd(comptes[0].seuilJour, 0)} vous garantit que la séance
              compte comme jour gagnant même si vous rendez un peu.
            </p>
          </div>

          <div className="carte">
            <h3>Bilan de fin de séance</h3>
            <div className="formulaire">
              <Champ label="Ce que le marché a fait" large>
                <textarea rows={2} value={note.marche || ""} onChange={(e) => setNote("marche", e.target.value)}
                  placeholder="Le scénario du matin s'est-il réalisé ?" />
              </Champ>
              <Champ label="Ce que j'ai bien fait" large>
                <textarea rows={2} value={note.bien || ""} onChange={(e) => setNote("bien", e.target.value)} />
              </Champ>
              <Champ label="Leçon à retenir" large>
                <textarea rows={2} value={note.lecon || ""} onChange={(e) => setNote("lecon", e.target.value)}
                  placeholder="Une seule chose à corriger demain." />
              </Champ>
              <Champ label="Qualité d'exécution" large>
                <div className="etoiles">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} className={"etoile" + ((note.humeur || 0) >= n ? " pleine" : "")}
                      onClick={() => setNote("humeur", n)} aria-label={`Noter ${n} sur 5`}>★</button>
                  ))}
                </div>
              </Champ>
            </div>
          </div>

          <div className="carte">
            <h3>Séances précédentes</h3>
            {Object.keys(notes).filter((d) => d !== aujourdhui).length === 0
              ? <p className="vide">Vos notes de séance apparaîtront ici, du plus récent au plus ancien.</p>
              : Object.keys(notes).filter((d) => d !== aujourdhui).sort().reverse().map((d) => (
                <div key={d} className="note-passee">
                  <div className="note-tete">
                    <b className="mono">{d}</b>
                    <span>{"★".repeat(notes[d].humeur || 0)}<span className="creux">{"★".repeat(5 - (notes[d].humeur || 0))}</span></span>
                  </div>
                  {notes[d].marche && <p><em>Marché —</em> {notes[d].marche}</p>}
                  {notes[d].fond && <p><em>Fond —</em> {notes[d].fond} · Asie : {notes[d].asie || "—"}</p>}
                  {notes[d].lecon && <p><em>Leçon —</em> {notes[d].lecon}</p>}
                </div>
              ))}
          </div>
        </section>
        </>
        );
      })()}

      {/* ---------------- COMPTES ---------------- */}
      {onglet === "comptes" && (
        <section className="grille2">
          {comptes.map((c) => {
            const s = situ(c);
            return (
              <div key={c.id} className="carte">
                <h3><span className="pastille" style={{ background: c.couleur }} />{c.nom}</h3>
                <div className="formulaire">
                  <Champ label="Nom du compte">
                    <input value={c.nom} onChange={(e) => majCompte(c.id, { nom: e.target.value })} />
                  </Champ>
                  <Champ label="Type de compte">
                    <select value={c.type} onChange={(e) => majCompte(c.id, { type: e.target.value })}>
                      <option>Express Funded</option><option>Live Funded</option><option>Trading Combine</option>
                    </select>
                  </Champ>
                  <Champ label="Pouvoir d'achat">
                    <select value={c.preset} onChange={(e) => appliquerPreset(c.id, e.target.value)}>
                      {Object.keys(PRESETS).map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </Champ>
                  <Champ label="Parcours de retrait">
                    <select value={c.chemin} onChange={(e) => majCompte(c.id, { chemin: e.target.value })}>
                      <option>Standard</option><option>Consistance</option>
                    </select>
                  </Champ>
                  <Champ label="Maximum Loss Limit">
                    <input type="number" value={c.mll} onChange={(e) => majCompte(c.id, { mll: num(e.target.value) })} />
                  </Champ>
                  <Champ label="Perte journalière max">
                    <input type="number" value={c.dll} onChange={(e) => majCompte(c.id, { dll: num(e.target.value) })} />
                  </Champ>
                  <Champ label="Seuil du jour gagnant">
                    <input type="number" value={c.seuilJour} onChange={(e) => majCompte(c.id, { seuilJour: num(e.target.value) })} />
                  </Champ>
                  <Champ label="Plafond par demande">
                    <input type="number" value={c.plafond} onChange={(e) => majCompte(c.id, { plafond: num(e.target.value) })} />
                  </Champ>
                  <Champ label="Part trader (%)">
                    <select value={c.split} onChange={(e) => majCompte(c.id, { split: num(e.target.value) })}>
                      <option value={90}>90 % — partage 90/10</option>
                      <option value={100}>100 % — 10 000 $ hérités</option>
                    </select>
                  </Champ>
                  <Champ label="Retrait net visé">
                    <input type="number" value={c.objectifNet} onChange={(e) => majCompte(c.id, { objectifNet: num(e.target.value) })} />
                  </Champ>
                  <Champ label="Micros max (1 mini = 10 micros)">
                    <input type="number" value={c.maxContrats} onChange={(e) => majCompte(c.id, { maxContrats: num(e.target.value) })} />
                  </Champ>
                  <Champ label="Frais aller-retour / micro">
                    <input type="number" step="0.01" value={c.commissionAR} onChange={(e) => majCompte(c.id, { commissionAR: num(e.target.value) })} />
                  </Champ>
                  <Champ label="Couleur">
                    <input type="color" value={c.couleur} onChange={(e) => majCompte(c.id, { couleur: e.target.value })} />
                  </Champ>
                </div>

                <div className="recap">
                  <div><em>Solde</em><b>{usd(s.solde, 0)}</b></div>
                  <div><em>Demande brute visée</em><b>{usd(s.brutVise, 0)}</b></div>
                  <div><em>Solde à atteindre</em><b>{usd(s.soldeRequis, 0)}</b></div>
                  <div><em>Jours tradés</em><b>{s.joursTrades}</b></div>
                </div>
                <p className="aide">
                  Pour toucher {usd(c.objectifNet, 0)} net avec un partage à {c.split} %, il faut demander {usd(s.brutVise, 0)},
                  donc disposer de {usd(s.soldeRequis, 0)} de solde — la règle des 50 %.
                </p>
              </div>
            );
          })}
          <div className="carte">
            <h3>Stratégies suivies</h3>
            <ListeSetups setups={setups} onChange={setSetups} />
            <p className="aide" style={{ marginTop: 18 }}>
              Rappel de la mécanique XFA : le solde démarre à 0 $, le « 50K » n'est que le pouvoir d'achat.
              Le MLL part à −{usd(comptes[0].mll, 0)}, suit vos plus hauts de clôture, se verrouille à 0 $,
              puis passe définitivement à 0 $ après le premier retrait. Vérifiez toujours les chiffres
              officiels dans votre tableau de bord Topstep.
            </p>
          </div>
        </section>
      )}

      {/* ---------------- SAISIE D'UN TRADE ---------------- */}
      {edition && (
        <div className="fond-modal" onClick={(e) => e.target === e.currentTarget && setEdition(null)}>
          <div className="modal" role="dialog" aria-label="Saisie d'un trade">
            <div className="modal-tete">
              <h2>{edition.id ? "Modifier le trade" : "Nouveau trade"}</h2>
              <button className="fermer" onClick={() => setEdition(null)} aria-label="Fermer">×</button>
            </div>
            <div className="formulaire">
              <Champ label="Compte">
                <select value={edition.compteId} onChange={(e) => {
                  const c = comptes.find((x) => x.id === e.target.value);
                  setEdition({ ...edition, compteId: e.target.value, frais: +(c.commissionAR * num(edition.contrats)).toFixed(2) });
                }}>
                  {comptes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </Champ>
              <Champ label="Date et heure">
                <input type="datetime-local" value={edition.date} onChange={(e) => setEdition({ ...edition, date: e.target.value })} />
              </Champ>
              <Champ label="Instrument">
                <select value={edition.instrument} onChange={(e) => setEdition({ ...edition, instrument: e.target.value })}>
                  {Object.entries(INSTRUMENTS).map(([k, v]) => <option key={k} value={k}>{k} — {v.nom}</option>)}
                </select>
              </Champ>
              <Champ label="Sens">
                <select value={edition.sens} onChange={(e) => setEdition({ ...edition, sens: e.target.value })}>
                  <option>Achat</option><option>Vente</option>
                </select>
              </Champ>
              <Champ label="Contrats">
                <input type="number" min="1" value={edition.contrats} onChange={(e) => {
                  const n = num(e.target.value);
                  setEdition({ ...edition, contrats: n, frais: +((compteEdite?.commissionAR || 0) * n).toFixed(2) });
                }} />
              </Champ>
              <Champ label="Frais (aller-retour)">
                <input type="number" step="0.01" value={edition.frais} onChange={(e) => setEdition({ ...edition, frais: num(e.target.value) })} />
              </Champ>
              <Champ label="Prix d'entrée">
                <input type="number" step="any" value={edition.entree} onChange={(e) => setEdition({ ...edition, entree: e.target.value })} />
              </Champ>
              <Champ label="Prix de sortie">
                <input type="number" step="any" value={edition.sortie} onChange={(e) => setEdition({ ...edition, sortie: e.target.value })} />
              </Champ>
              <Champ label="Stop initial">
                <input type="number" step="any" value={edition.stop} onChange={(e) => setEdition({ ...edition, stop: e.target.value })} />
              </Champ>
              <Champ label="Objectif de prix">
                <input type="number" step="any" value={edition.objectifPrix} onChange={(e) => setEdition({ ...edition, objectifPrix: e.target.value })} />
              </Champ>
              <Champ label="Stratégie">
                <select value={edition.setup} onChange={(e) => setEdition({ ...edition, setup: e.target.value })}>
                  {setups.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Champ>
              <Champ label="Session">
                <select value={edition.session} onChange={(e) => setEdition({ ...edition, session: e.target.value })}>
                  {SESSIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Champ>
              <Champ label="État d'esprit">
                <select value={edition.emotion} onChange={(e) => setEdition({ ...edition, emotion: e.target.value })}>
                  {EMOTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Champ>
              <Champ label="Plan respecté">
                <select value={edition.respect} onChange={(e) => setEdition({ ...edition, respect: e.target.value })}>
                  <option>Oui</option><option>Non</option>
                </select>
              </Champ>
              <Champ label="Lien vers la capture" large>
                <input placeholder="https://…" value={edition.lien} onChange={(e) => setEdition({ ...edition, lien: e.target.value })} />
              </Champ>
              <Champ label="Notes — contexte, exécution, ce que je referais" large>
                <textarea rows={3} value={edition.notes} onChange={(e) => setEdition({ ...edition, notes: e.target.value })} />
              </Champ>
              <label className="case">
                <input type="checkbox" checked={edition.pnlManuel} onChange={(e) => setEdition({ ...edition, pnlManuel: e.target.checked })} />
                <span>Saisir le résultat à la main (copié depuis TopstepX)</span>
              </label>
              {edition.pnlManuel && (
                <Champ label="P&L net">
                  <input type="number" step="0.01" value={edition.pnl} onChange={(e) => setEdition({ ...edition, pnl: e.target.value })} />
                </Champ>
              )}
            </div>
            <div className="apercu">
              <div><em>Résultat net</em><b className={apercuPnl >= 0 ? "gain" : "perte"}>{usd(apercuPnl)}</b></div>
              <div><em>Risque engagé</em><b>{apercuRisque ? usd(apercuRisque) : "—"}</b></div>
              <div><em>Multiple R</em><b className={apercuPnl >= 0 ? "gain" : "perte"}>{apercuRisque ? (apercuPnl / apercuRisque).toFixed(2) + " R" : "—"}</b></div>
              {(() => {
                const dejaFait = enrichis.filter((t) => jour(t.date) === jour(edition.date) && t.id !== edition.id)
                  .reduce((s, t) => s + num(t.contrats), 0);
                const apres = dejaFait + num(edition.contrats);
                return (
                  <div>
                    <em>Budget du jour</em>
                    <b className={apres > gardeFous.maxMicrosJour ? "perte" : apres === gardeFous.maxMicrosJour ? "" : "gain"}>
                      {apres} / {gardeFous.maxMicrosJour} micros
                    </b>
                  </div>
                );
              })()}
              {compteEdite && num(edition.contrats) > compteEdite.maxContrats && (
                <div className="depassement">Au-delà des {compteEdite.maxContrats} micros autorisés sur ce compte.</div>
              )}
            </div>
            <div className="modal-pied">
              <button className="btn" onClick={() => setEdition(null)}>Annuler</button>
              <button className="btn primaire" onClick={enregistrerTrade}>
                {edition.id ? "Enregistrer les modifications" : "Ajouter au carnet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- SAISIE D'UN RETRAIT ---------------- */}
      {nouveauRetrait && (() => {
        const c = comptes.find((x) => x.id === nouveauRetrait.compteId);
        const s = situ(c);
        return (
          <div className="fond-modal" onClick={(e) => e.target === e.currentTarget && setNouveauRetrait(null)}>
            <div className="modal etroit" role="dialog" aria-label="Enregistrer un retrait">
              <div className="modal-tete">
                <h2>Retrait sur {c.nom}</h2>
                <button className="fermer" onClick={() => setNouveauRetrait(null)} aria-label="Fermer">×</button>
              </div>
              <div className="formulaire">
                <Champ label="Date de la demande">
                  <input type="date" value={nouveauRetrait.date}
                    onChange={(e) => setNouveauRetrait({ ...nouveauRetrait, date: e.target.value })} />
                </Champ>
                <Champ label="Montant demandé">
                  <input type="number" step="0.01" value={nouveauRetrait.brut}
                    onChange={(e) => setNouveauRetrait({
                      ...nouveauRetrait, brut: e.target.value,
                      net: +(num(e.target.value) * c.split / 100).toFixed(2)
                    })} />
                </Champ>
                <Champ label="Net perçu">
                  <input type="number" step="0.01" value={nouveauRetrait.net}
                    onChange={(e) => setNouveauRetrait({ ...nouveauRetrait, net: e.target.value })} />
                </Champ>
              </div>
              <div className="apercu">
                <div><em>Maximum demandable</em><b>{usd(Math.max(0, s.demandable), 0)}</b></div>
                <div><em>Solde après retrait</em><b>{usd(s.solde - num(nouveauRetrait.brut), 0)}</b></div>
                <div><em>Marge restante</em><b className="perte">{usd(Math.max(0, s.solde - num(nouveauRetrait.brut)), 0)}</b></div>
              </div>
              {num(nouveauRetrait.brut) > s.demandable && (
                <p className="aide" style={{ color: "#F2A03D" }}>
                  Ce montant dépasse la limite des 50 % du solde ou le plafond par demande.
                </p>
              )}
              <div className="modal-pied">
                <button className="btn" onClick={() => setNouveauRetrait(null)}>Annuler</button>
                <button className="btn primaire" onClick={enregistrerRetrait}>Enregistrer le retrait</button>
              </div>
            </div>
          </div>
        );
      })()}

      {importEnCours && (
        <div className="fond-modal" onClick={(e) => e.target === e.currentTarget && setImportEnCours(null)}>
          <div className="modal etroit" role="dialog" aria-label="Importer un export TopstepX">
            <div className="modal-tete">
              <h2>Importer depuis TopstepX</h2>
              <button className="fermer" onClick={() => setImportEnCours(null)} aria-label="Fermer">×</button>
            </div>
            <div className="formulaire">
              <Champ label="Rattacher ces trades au compte" large>
                <select value={importEnCours} onChange={(e) => setImportEnCours(e.target.value)}>
                  {comptes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </Champ>
              <Champ label="Fichier CSV" large>
                <input type="file" accept=".csv,text/csv"
                  onChange={(e) => e.target.files?.[0] && traiterFichier(e.target.files[0], importEnCours)} />
              </Champ>
            </div>
            <p className="aide">
              Prenez le fichier issu de l'onglet Trades de TopstepX. Les identifiants de trade servent de
              garde-fou : réimporter le même fichier ne créera pas de doublon. Les commissions et frais
              d'échange sont retranchés du résultat brut, et le stop reste à compléter à la main si vous
              voulez le multiple R.
            </p>
            {rapportImport && <div className="alerte douce" style={{ marginTop: 12 }}>{rapportImport}</div>}
            <div className="modal-pied">
              <button className="btn" onClick={() => setImportEnCours(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      <footer className="pied">
        Tous les calculs reposent sur vos trades clôturés et sur les paramètres que vous avez saisis.
        Les règles Topstep évoluent : confirmez vos plafonds, votre parcours de retrait et votre partage
        de profits dans votre tableau de bord avant chaque demande.
      </footer>
    </div>
  );
}

const Etape = ({ ok, titre, detail }) => (
  <div className="etape">
    <span className={"coche " + (ok ? "ok" : "")}>{ok ? "✓" : "○"}</span>
    <div><b>{titre}</b><span>{detail}</span></div>
  </div>
);

const Info = ({ active, payload, label, suffixe }) => {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  return (
    <div className="info">
      <span>{suffixe} {label}</span>
      <b className={v >= 0 ? "gain" : "perte"}>{usd(v)}</b>
    </div>
  );
};

function AjoutCheck({ onAdd }) {
  const [texte, setTexte] = useState("");
  const [cat, setCat] = useState(CATS[0]);
  const ajouter = () => {
    if (!texte.trim()) return;
    onAdd({ id: uid(), cat, texte: texte.trim() });
    setTexte("");
  };
  return (
    <div className="ajout" style={{ marginTop: 12 }}>
      <select value={cat} onChange={(e) => setCat(e.target.value)}>
        {CATS.map((c) => <option key={c}>{c}</option>)}
      </select>
      <input value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Ajouter un point de contrôle"
        onKeyDown={(e) => e.key === "Enter" && ajouter()} />
      <button className="btn" onClick={ajouter}>Ajouter</button>
    </div>
  );
}

function ListeSetups({ setups, onChange }) {
  const [v, setV] = useState("");
  const ajouter = () => { if (v.trim()) { onChange([...setups, v.trim()]); setV(""); } };
  return (
    <>
      <div className="puces">
        {setups.map((s) => (
          <span key={s} className="puce">{s}
            <button onClick={() => onChange(setups.filter((x) => x !== s))} aria-label={`Retirer ${s}`}>×</button>
          </span>
        ))}
      </div>
      <div className="ajout">
        <input value={v} onChange={(e) => setV(e.target.value)} placeholder="Nouvelle stratégie"
          onKeyDown={(e) => e.key === "Enter" && ajouter()} />
        <button className="btn" onClick={ajouter}>Ajouter</button>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
const CSS = `

.app {
  --fond:#0A0D12; --surface:#111821; --surface2:#161F2B; --bord:#1E2733;
  --texte:#E4EAF2; --doux:#8695A8; --creux:#5C6B7E;
  --ambre:#F2A03D; --gain:#3DD68C; --perte:#FF5C5C;
  background:var(--fond); color:var(--texte); min-height:100vh; padding:22px;
  font-family:'Inter',system-ui,sans-serif; font-size:14px;
}
.app * { box-sizing:border-box; }
.app h1,.app h2,.app h3 { font-family:'Space Grotesk','Inter',sans-serif; margin:0; letter-spacing:-.02em; }
.mono,.app input,.app select,.app textarea { font-family:'IBM Plex Mono',ui-monospace,monospace; }
.gain{color:var(--gain);} .perte{color:var(--perte);} .fort{font-weight:600;}
.nowrap{white-space:nowrap;} .creux{color:var(--creux);}
.app button:focus-visible,.app input:focus-visible,.app select:focus-visible,.app textarea:focus-visible{
  outline:2px solid var(--ambre); outline-offset:2px;
}
@media (prefers-reduced-motion:reduce){ .app *{transition:none!important;} }
.chargement{color:var(--doux);padding:60px;text-align:center;font-family:'IBM Plex Mono',monospace;}

.tete{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;
  padding-bottom:16px;border-bottom:1px solid var(--bord);margin-bottom:18px;}
.tete h1{font-size:26px;font-weight:700;}
.titre p{margin:4px 0 0;color:var(--doux);font-size:13px;}
.tete-actions{display:flex;gap:8px;flex-wrap:wrap;}

.btn{background:var(--surface2);color:var(--texte);border:1px solid var(--bord);border-radius:8px;
  padding:9px 14px;font-size:13px;font-weight:500;cursor:pointer;font-family:'Inter',sans-serif;transition:.15s;}
.btn:hover{border-color:var(--creux);}
.btn.primaire{background:var(--ambre);color:#100C05;border-color:var(--ambre);font-weight:600;}
.btn.primaire:hover{filter:brightness(1.1);}
.btn:disabled{opacity:.4;cursor:not-allowed;}
.btn.pleine{width:100%;margin-top:14px;}

.alerte{background:#3A1A1A;border:1px solid #6B2B2B;color:#FFB4B4;padding:10px 14px;border-radius:8px;margin-bottom:14px;font-size:13px;}

.onglets{display:flex;gap:4px;overflow-x:auto;margin-bottom:14px;}
.onglet{background:none;border:none;border-bottom:2px solid transparent;color:var(--doux);
  padding:8px 14px;cursor:pointer;font-size:13px;font-weight:500;white-space:nowrap;font-family:'Inter',sans-serif;}
.onglet.actif{color:var(--ambre);border-bottom-color:var(--ambre);}

.filtres{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:18px;}
.segment{display:flex;background:var(--surface);border:1px solid var(--bord);border-radius:8px;padding:3px;}
.segment button{background:none;border:none;color:var(--doux);padding:6px 12px;border-radius:6px;
  cursor:pointer;font-size:12.5px;display:flex;align-items:center;gap:6px;font-family:'Inter',sans-serif;}
.segment button.actif{background:var(--surface2);color:var(--texte);}
.app select,.app input,.app textarea{background:var(--surface);border:1px solid var(--bord);color:var(--texte);
  border-radius:8px;padding:8px 10px;font-size:13px;}
.recherche{flex:1;min-width:160px;}
.pastille{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:7px;vertical-align:middle;}

.vies{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px;margin-bottom:14px;}
.vie{background:var(--surface);border:1px solid var(--bord);border-radius:12px;padding:16px 18px;}
.vie-tete{display:flex;justify-content:space-between;align-items:center;margin-bottom:22px;}
.vie-tete strong{font-family:'Space Grotesk',sans-serif;font-size:15px;}
.tag{color:var(--creux);font-size:11px;margin-left:8px;text-transform:uppercase;letter-spacing:.06em;}
.vie-solde{font-family:'IBM Plex Mono',monospace;font-size:20px;font-weight:600;}

.rail{position:relative;height:34px;margin-bottom:6px;}
.rail-fond{position:absolute;top:15px;left:0;right:0;height:3px;background:var(--surface2);border-radius:2px;}
.rail-zone{position:absolute;top:15px;height:3px;border-radius:2px;}
.rail-marque{position:absolute;top:8px;width:1px;height:17px;background:var(--creux);}
.rail-marque.seuil{background:var(--perte);height:22px;top:6px;}
.rail-marque.cible{background:var(--gain);height:22px;top:6px;}
.rail-curseur{position:absolute;top:10px;width:12px;height:12px;border-radius:50%;background:var(--fond);
  border:3px solid;transform:translateX(-6px);}
.vie-legende{display:flex;justify-content:space-between;font-family:'IBM Plex Mono',monospace;font-size:11px;
  color:var(--doux);margin-bottom:16px;gap:8px;}
.vie-legende em{display:block;color:var(--creux);font-style:normal;font-size:10px;text-transform:uppercase;
  letter-spacing:.05em;margin-bottom:2px;}
.vie-legende span:nth-child(2){text-align:center;} .vie-legende span:last-child{text-align:right;}
.verrou{color:var(--gain);font-weight:400;font-size:10px;}

.vie-jauges{display:flex;flex-direction:column;gap:10px;}
.jauge-tete{display:flex;justify-content:space-between;font-size:11.5px;color:var(--doux);margin-bottom:5px;gap:8px;}
.jauge-tete b{font-family:'IBM Plex Mono',monospace;white-space:nowrap;}
.jauge-piste{height:5px;background:var(--surface2);border-radius:3px;overflow:hidden;}
.jauge-barre{height:100%;border-radius:3px;transition:width .3s;}

.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:14px;}
.kpi{background:var(--surface);border:1px solid var(--bord);border-radius:10px;padding:13px 15px;display:flex;flex-direction:column;gap:3px;}
.kpi-l{font-size:11px;color:var(--creux);text-transform:uppercase;letter-spacing:.06em;}
.kpi-v{font-family:'IBM Plex Mono',monospace;font-size:20px;font-weight:600;}
.kpi-s{font-size:11.5px;color:var(--doux);}

.grille2{display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:14px;}
.carte{background:var(--surface);border:1px solid var(--bord);border-radius:12px;padding:16px 18px;margin-bottom:14px;}
.carte h3{font-size:14px;font-weight:500;margin-bottom:14px;}
.carte h3 .sous{color:var(--creux);font-weight:400;font-size:12px;margin-left:8px;font-family:'Inter',sans-serif;}
.vide{color:var(--creux);font-size:13px;padding:26px 0;text-align:center;}

.etapes{display:flex;flex-direction:column;gap:12px;margin-bottom:18px;}
.etape{display:flex;gap:11px;align-items:flex-start;}
.coche{width:20px;height:20px;border-radius:50%;border:1px solid var(--bord);color:var(--creux);
  display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;margin-top:1px;}
.coche.ok{background:#123326;border-color:var(--gain);color:var(--gain);}
.etape div{display:flex;flex-direction:column;gap:2px;}
.etape b{font-size:13px;font-weight:500;}
.etape span{font-size:12px;color:var(--doux);}

.defile{overflow-x:auto;}
.tbl{width:100%;border-collapse:collapse;font-size:12.5px;}
.tbl th{text-align:left;color:var(--creux);font-weight:500;font-size:10.5px;text-transform:uppercase;
  letter-spacing:.06em;padding:0 10px 8px 0;border-bottom:1px solid var(--bord);white-space:nowrap;}
.tbl td{padding:9px 10px 9px 0;border-bottom:1px solid #151D27;}
.tbl tbody tr:hover{background:#131B25;}
.petit{font-size:12px;color:var(--doux);}
.col-barre{width:90px;}
.mini{height:4px;background:var(--surface2);border-radius:2px;}
.mini-b{height:100%;border-radius:2px;}

.sens{font-size:11px;padding:2px 7px;border-radius:4px;font-weight:500;}
.sens.long{background:#123326;color:var(--gain);}
.sens.court{background:#331A1A;color:var(--perte);}
.badge{font-size:10.5px;padding:2px 7px;border-radius:4px;}
.badge.vert{background:#123326;color:var(--gain);}
.badge.rouge{background:#331A1A;color:var(--perte);}
.lien{background:none;border:none;color:var(--doux);cursor:pointer;font-size:12px;padding:2px 6px;font-family:'Inter',sans-serif;}
.lien:hover{color:var(--texte);text-decoration:underline;}
.lien.danger:hover{color:var(--perte);}

.formulaire{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;}
.champ{display:flex;flex-direction:column;gap:5px;}
.champ>span{font-size:11px;color:var(--creux);text-transform:uppercase;letter-spacing:.05em;}
.champ-large{grid-column:1/-1;}
.champ input,.champ select,.champ textarea{width:100%;}
.case{grid-column:1/-1;display:flex;align-items:center;gap:9px;font-size:12.5px;color:var(--doux);cursor:pointer;}
.case input{width:auto;}

.recap{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-top:16px;
  padding-top:14px;border-top:1px solid var(--bord);}
.recap div{display:flex;flex-direction:column;gap:3px;}
.recap em{font-style:normal;font-size:10.5px;color:var(--creux);text-transform:uppercase;letter-spacing:.05em;}
.recap b{font-family:'IBM Plex Mono',monospace;font-size:14px;}
.aide{color:var(--creux);font-size:11.5px;margin:12px 0 0;line-height:1.55;}

.note-passee{border-top:1px solid var(--bord);padding:12px 0;}
.note-passee p{margin:4px 0;font-size:12.5px;color:var(--doux);line-height:1.5;}
.note-passee em{color:var(--creux);font-style:normal;}
.note-tete{display:flex;justify-content:space-between;font-size:12px;color:var(--ambre);}
.etoiles{display:flex;gap:4px;}
.etoile{background:none;border:none;color:var(--creux);font-size:20px;cursor:pointer;padding:0;line-height:1;}
.etoile.pleine{color:var(--ambre);}

.puces{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px;}
.puce{background:var(--surface2);border:1px solid var(--bord);border-radius:20px;padding:4px 6px 4px 12px;font-size:12px;display:flex;align-items:center;gap:6px;}
.puce button{background:none;border:none;color:var(--creux);cursor:pointer;font-size:15px;line-height:1;padding:0 4px;}
.puce button:hover{color:var(--perte);}
.ajout{display:flex;gap:8px;}
.ajout input{flex:1;}

.fond-modal{position:fixed;inset:0;background:rgba(5,8,12,.82);display:flex;align-items:flex-start;
  justify-content:center;padding:24px 16px;overflow-y:auto;z-index:50;}
.modal{background:var(--surface);border:1px solid var(--bord);border-radius:14px;padding:22px;width:100%;max-width:760px;}
.modal.etroit{max-width:440px;}
.modal-tete{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;}
.modal-tete h2{font-size:17px;}
.fermer{background:none;border:none;color:var(--doux);font-size:26px;line-height:1;cursor:pointer;padding:0 4px;}
.modal-pied{display:flex;justify-content:flex-end;gap:9px;margin-top:18px;}
.apercu{display:flex;gap:22px;flex-wrap:wrap;margin-top:16px;padding:13px 15px;background:var(--surface2);border-radius:9px;}
.apercu div{display:flex;flex-direction:column;gap:3px;}
.apercu em{font-style:normal;font-size:10.5px;color:var(--creux);text-transform:uppercase;letter-spacing:.05em;}
.apercu b{font-family:'IBM Plex Mono',monospace;font-size:16px;}
.depassement{color:var(--ambre);font-size:12px;align-self:center;}

.info{background:var(--surface2);border:1px solid var(--bord);border-radius:8px;padding:8px 11px;font-size:12px;
  display:flex;flex-direction:column;gap:3px;}
.info span{color:var(--creux);font-size:11px;}
.info b{font-family:'IBM Plex Mono',monospace;font-size:14px;}

.feu-zone{margin-bottom:14px;}
.feu{background:var(--surface);border:1px solid var(--bord);border-left:3px solid var(--creux);
  border-radius:12px;padding:15px 18px;display:flex;justify-content:space-between;align-items:center;
  gap:16px;flex-wrap:wrap;margin-bottom:10px;}
.feu.vert{border-left-color:var(--gain);}
.feu.prudence{border-left-color:var(--ambre);}
.feu.stop{border-left-color:var(--perte);}
.feu-etat{display:flex;align-items:center;gap:13px;}
.feu-point{width:11px;height:11px;border-radius:50%;background:var(--creux);flex-shrink:0;}
.feu.vert .feu-point{background:var(--gain);box-shadow:0 0 12px #3DD68C66;}
.feu.prudence .feu-point{background:var(--ambre);box-shadow:0 0 12px #F2A03D66;}
.feu.stop .feu-point{background:var(--perte);box-shadow:0 0 12px #FF5C5C66;}
.feu-etat div{display:flex;flex-direction:column;gap:2px;}
.feu-etat b{font-family:'Space Grotesk',sans-serif;font-size:15px;}
.feu-etat span{font-size:12px;color:var(--doux);font-family:'IBM Plex Mono',monospace;}
.feu-check{display:flex;gap:16px;font-size:11.5px;color:var(--creux);}
.alerte.douce{background:#2E2410;border-color:#5A4718;color:#F2C98D;}

.bloc-check{margin-bottom:16px;}
.bloc-check h4{font-family:'Inter',sans-serif;font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;
  color:var(--creux);margin:0 0 8px;font-weight:600;}
.ligne-check{display:flex;align-items:flex-start;gap:10px;padding:7px 0;font-size:12.5px;
  color:var(--doux);cursor:pointer;line-height:1.45;}
.ligne-check input{width:auto;margin-top:2px;flex-shrink:0;accent-color:#3DD68C;}
.ligne-check span{flex:1;}
.ligne-check.ok span{color:var(--texte);}
.ligne-check button{opacity:0;font-size:14px;}
.ligne-check:hover button{opacity:1;}

.curseurs{display:flex;flex-direction:column;gap:9px;}
.curseur span{display:flex;justify-content:space-between;font-size:11.5px;color:var(--doux);margin-bottom:3px;}
.curseur b{font-family:'IBM Plex Mono',monospace;color:var(--ambre);}
.curseur input[type=range]{width:100%;padding:0;accent-color:#F2A03D;background:none;border:none;}

.pied{color:var(--creux);font-size:11.5px;margin-top:22px;padding-top:14px;border-top:1px solid var(--bord);line-height:1.6;}

@media (max-width:640px){
  .app{padding:14px;}
  .tete h1{font-size:21px;}
  .grille2,.vies{grid-template-columns:1fr;}
  .kpis{grid-template-columns:repeat(2,1fr);}
}
`;
