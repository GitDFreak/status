#!/usr/bin/env node
/**
 * status-days — barres de disponibilité « 1 barre = 1 jour » pour le thème Datafreak.
 *
 * Source de vérité : les incidents Upptime (issues GitHub étiquetées `status` + slug,
 * titre « … is down » ou « … has degraded performance »), ouvertes/fermées à la minute.
 * Ce sont les mêmes incidents que ceux affichés sur la page : les barres restent
 * cohérentes avec la liste d'incidents.
 *
 * Pour chaque service (history/<slug>.yml) et chacun des 365 derniers jours civils
 * (Europe/Paris) : état du jour = pire sévérité rencontrée (down > degraded > up),
 * minutes d'indisponibilité / de dégradation, `none` avant le début de la supervision
 * (`startTime`), `partial` pour le premier jour incomplet.
 *
 * Les 3 derniers jours portent aussi `hours` : une lettre par heure civile du jour (23/24/25 en DST),
 * u = opérationnel, g = dégradé, d = indisponible, n = hors supervision / futur.
 * Chaque service porte `incidents` : les incidents chevauchant la fenêtre (numéro, titre,
 * sévérité, début, fin) pour afficher le détail d'un jour sans appel API côté navigateur.
 *
 * Chaque service porte `stats` : les chiffres natifs d'Upptime (history/summary.json : disponibilité
 * et temps de réponse moyen par période) pour les afficher sur la fiche sans appel externe.
 *
 * Sortie : assets/status-days.json (servi tel quel à /status-days.json par Upptime).
 * Aucune dépendance npm (Node ≥ 20). `--test` exécute des cas synthétiques et sort.
 */
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const TZ = "Europe/Paris";
const DAYS = 365; // jours calculés (le client agrège en semaines pour 1 an / tout)
const HOURS_DAYS = 3; // `hours` seulement sur les derniers jours (vue 24 h), pour borner la taille du JSON
const OWNER = process.env.STATUS_OWNER || "GitDFreak";
const REPO = process.env.STATUS_REPO || "status";
const OUT = process.env.STATUS_OUT || join("assets", "status-days.json");

// ── Jours civils en heure de Paris ───────────────────────────────────────────
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});
/** "YYYY-MM-DD" du jour de Paris contenant l'instant t. */
export const parisDate = (t) => dayFmt.format(t);
/** Décalage (ms) entre l'heure de Paris et UTC à l'instant t. */
const parisOffsetMs = (t) => {
  const p = Object.fromEntries(partsFmt.formatToParts(t).filter((x) => x.type !== "literal").map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t.getTime() / 1000) * 1000;
};
/** Instant UTC de minuit (Paris) pour une date "YYYY-MM-DD" ; deux passes pour le DST. */
export const parisMidnight = (ymd) => {
  const [y, m, d] = ymd.split("-").map(Number);
  let guess = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  guess = new Date(guess.getTime() - parisOffsetMs(guess));
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - parisOffsetMs(guess));
};
/** Les N derniers jours civils de Paris, du plus ancien au plus récent (dernier = aujourd'hui). */
export const lastDays = (now, n = DAYS) => {
  const out = [];
  let cursor = parisMidnight(parisDate(now));
  for (let i = 0; i < n; i++) {
    const ymd = parisDate(cursor);
    out.unshift(ymd);
    cursor = new Date(parisMidnight(ymd).getTime() - 12 * 3600 * 1000); // milieu du jour précédent
    cursor = parisMidnight(parisDate(cursor));
  }
  return out;
};

// ── Incidents ────────────────────────────────────────────────────────────────
/** Sévérité d'une issue Upptime d'après son titre ; null si ce n'est pas un incident. */
export const severityOf = (issue) => {
  const labels = (issue.labels || []).map((l) => (typeof l === "string" ? l : l.name));
  if (!labels.includes("status") || labels.includes("maintenance")) return null;
  const t = issue.title || "";
  if (/\bis down\b/i.test(t)) return "down";
  if (/degraded/i.test(t)) return "degraded";
  return null;
};

/** Minutes de recouvrement entre [a1,a2) et [b1,b2). */
const overlapMin = (a1, a2, b1, b2) => Math.max(0, (Math.min(a2, b2) - Math.max(a1, b1)) / 60000);

/**
 * Calcule les jours d'un service.
 * @param {{startTime:string}} site  history/<slug>.yml
 * @param {Array} issues            issues GitHub (state=all) du slug
 * @param {Date} now
 */
/** Incidents (fenêtres) chevauchant les N derniers jours, pour le détail côté navigateur. */
export const listIncidents = (issues, now = new Date()) => {
  const first = parisMidnight(lastDays(now)[0]).getTime();
  return issues
    .map((i) => ({ sev: severityOf(i), from: new Date(i.created_at), to: i.closed_at ? new Date(i.closed_at) : null, number: i.number, title: i.title || "" }))
    .filter((w) => w.sev && !Number.isNaN(w.from.getTime()) && (w.to ? w.to.getTime() : now.getTime()) >= first)
    .sort((a, b) => b.from - a.from)
    .map((w) => ({ number: w.number, title: w.title.replace(/^[^\p{L}\p{N}]+/u, "").trim(), severity: w.sev, start: w.from.toISOString(), end: w.to ? w.to.toISOString() : null }));
};

export const computeDays = (site, issues, now = new Date()) => {
  const start = site.startTime ? new Date(site.startTime) : null;
  const windows = issues
    .map((i) => ({ sev: severityOf(i), from: new Date(i.created_at), to: i.closed_at ? new Date(i.closed_at) : now, number: i.number }))
    .filter((w) => w.sev && !Number.isNaN(w.from.getTime()));
  const all = lastDays(now);
  return all.map((ymd, idx) => {
    const withHours = idx >= all.length - HOURS_DAYS;
    const d0 = parisMidnight(ymd);
    const d1 = new Date(d0.getTime() + 36 * 3600 * 1000);
    const dayEnd = parisMidnight(parisDate(d1)); // minuit suivant (gère 23h/25h)
    const from = start && start > d0 ? start : d0;
    const to = now < dayEnd ? now : dayEnd;
    if (start && start >= dayEnd) return { date: ymd, state: "none" };
    if (to <= from) return { date: ymd, state: "none" };
    let down = 0, degraded = 0; const incidents = new Set();
    for (const w of windows) {
      const m = overlapMin(from.getTime(), to.getTime(), w.from.getTime(), w.to.getTime());
      if (m <= 0) continue;
      incidents.add(w.number);
      if (w.sev === "down") down += m; else degraded += m;
    }
    const covered = (to - from) / 60000;
    // Heures civiles du jour : bornes successives par pas d'1 h depuis minuit Paris jusqu'à minuit suivant
    let hours = "";
    for (let h0 = d0.getTime(); h0 < dayEnd.getTime(); h0 += 3600000) {
      const h1 = Math.min(h0 + 3600000, dayEnd.getTime());
      const hf = Math.max(h0, from.getTime()), ht = Math.min(h1, to.getTime());
      if (ht <= hf) { hours += "n"; continue; }
      let hd = 0, hg = 0;
      for (const w of windows) { const m = overlapMin(hf, ht, w.from.getTime(), w.to.getTime()); if (m > 0) { if (w.sev === "down") hd += m; else hg += m; } }
      hours += hd > 0 ? "d" : hg > 0 ? "g" : "u";
    }
    const day = {
      date: ymd,
      state: down > 0 ? "down" : degraded > 0 ? "degraded" : "up",
      down: Math.round(down),
      degraded: Math.round(degraded),
      uptime: Math.round(Math.max(0, 1 - down / Math.max(covered, 1)) * 10000) / 100,
    };
    if (withHours) day.hours = hours;
    if (from > d0 || to < dayEnd) day.partial = true;
    if (incidents.size) day.incidents = [...incidents];
    return day;
  });
};

// ── E/S GitHub + fichiers ────────────────────────────────────────────────────
const parseHistory = (text) =>
  Object.fromEntries(text.split("\n").map((l) => l.match(/^([a-zA-Z]+):\s*(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));

const gh = async (path) => {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "datafreak-status-days" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`GitHub ${res.status} sur ${path}`);
  return res.json();
};
const issuesFor = async (slug) => {
  const all = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await gh(`/repos/${OWNER}/${REPO}/issues?labels=${encodeURIComponent(`status,${slug}`)}&state=all&per_page=100&page=${page}`);
    all.push(...batch.filter((i) => !i.pull_request));
    if (batch.length < 100) break;
  }
  return all;
};

const main = async () => {
  const now = new Date();
  // Idempotence horaire : le Job Scaleway peut déclencher deux fois en début d'heure (cycles :00 et :05,
  // gigue de démarrage). Sans STATUS_FORCE=1 (événement d'incident, lancement manuel), on ne recalcule
  // pas si le fichier courant date de la même heure UTC.
  if (process.env.STATUS_FORCE !== "1") {
    try {
      const prev = JSON.parse(await readFile(OUT, "utf8"));
      if (prev.generatedAt && prev.generatedAt.slice(0, 13) === now.toISOString().slice(0, 13)) {
        console.log(`déjà calculé pour l'heure ${now.toISOString().slice(0, 13)}Z (${prev.generatedAt}) : rien à faire`);
        return;
      }
    } catch { /* pas de fichier : on calcule */ }
  }
  const files = (await readdir("history")).filter((f) => f.endsWith(".yml"));
  let summary = [];
  try { summary = JSON.parse(await readFile(join("history", "summary.json"), "utf8")); } catch { console.log("history/summary.json absent : pas de stats"); }
  const statKeys = ["uptime", "uptimeDay", "uptimeWeek", "uptimeMonth", "uptimeYear", "time", "timeDay", "timeWeek", "timeMonth", "timeYear"];
  const sites = {};
  for (const f of files) {
    const slug = f.replace(/\.yml$/, "");
    const site = parseHistory(await readFile(join("history", f), "utf8"));
    const issues = await issuesFor(slug);
    const st = summary.find((x) => x.slug === slug);
    const stats = st ? Object.fromEntries(statKeys.filter((k) => st[k] !== undefined).map((k) => [k, st[k]])) : undefined;
    sites[slug] = { name: st?.name, url: site.url, startTime: site.startTime, stats, days: computeDays(site, issues, now), incidents: listIncidents(issues, now) };
    console.log(`${slug}: ${issues.length} incident(s), ${sites[slug].days.filter((d) => d.state !== "none").length}/${DAYS} jour(s) couverts`);
  }
  const out = { generatedAt: now.toISOString(), timeZone: TZ, days: DAYS, sites };
  await mkdir("assets", { recursive: true });
  await writeFile(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`écrit ${OUT}`);
};

// ── Tests synthétiques (--test) ──────────────────────────────────────────────
const test = () => {
  const assert = (cond, msg) => { if (!cond) { console.error("ÉCHEC :", msg); process.exitCode = 1; } else console.log("ok  :", msg); };
  const now = new Date("2026-09-15T20:00:00Z"); // 22:00 Paris (été)
  const site = { startTime: "2026-09-10T10:30:00Z" }; // début le 10 sept. à 12:30 Paris
  const mk = (n, title, created, closed) => ({ number: n, title, labels: [{ name: "status" }, { name: "x" }], created_at: created, closed_at: closed });
  const issues = [
    mk(1, "🛑 X is down", "2026-09-12T22:30:00Z", "2026-09-13T00:30:00Z"),          // 00:30→02:30 Paris le 13 : chevauche minuit Paris (12/13)
    mk(2, "⚠️ X has degraded performance", "2026-09-14T08:00:00Z", "2026-09-14T08:30:00Z"),
    mk(3, "🛑 X is down", "2026-09-14T09:00:00Z", "2026-09-14T09:10:00Z"),           // dégradé puis down le même jour → down
    mk(4, "🛑 X is down", "2026-09-15T19:00:00Z", null),                              // toujours ouvert → jusqu'à now (60 min)
    { number: 5, title: "Maintenance", labels: [{ name: "maintenance" }], created_at: "2026-09-11T00:00:00Z", closed_at: "2026-09-11T05:00:00Z" },
  ];
  const days = computeDays(site, issues, now);
  const by = Object.fromEntries(days.map((d) => [d.date, d]));
  assert(days.length === 365 && days.at(-1).date === "2026-09-15" && days[0].date === "2025-09-16", "365 jours, dernier = aujourd'hui (Paris)");
  assert(by["2026-09-12"].hours === undefined && by["2026-09-13"].hours && by["2026-09-15"].hours, "`hours` seulement sur les 3 derniers jours");
  assert(by["2026-09-09"].state === "none" && by["2026-09-10"].state === "up" && by["2026-09-10"].partial === true, "avant le début = none ; premier jour partiel");
  assert(by["2026-09-12"].state === "down" && by["2026-09-12"].down === 0 + 0 || by["2026-09-12"].state === "up", "incident 00:30→02:30 Paris n'affecte pas le 12");
  assert(by["2026-09-13"].state === "down" && by["2026-09-13"].down === 120, "13 sept. : 120 min d'indisponibilité (chevauchement minuit géré)");
  assert(by["2026-09-14"].state === "down" && by["2026-09-14"].down === 10 && by["2026-09-14"].degraded === 30, "dégradé + down le même jour → down, minutes séparées");
  assert(by["2026-09-15"].state === "down" && by["2026-09-15"].down === 60 && by["2026-09-15"].partial === true, "incident encore ouvert compté jusqu'à maintenant ; jour en cours partiel");
  assert(by["2026-09-11"].state === "up", "issue maintenance ignorée");
  assert(by["2026-09-13"].hours.length === 24 && by["2026-09-13"].hours.startsWith("ddd") && by["2026-09-13"].hours.slice(3).replace(/u/g, "") === "", "13 sept. : incident 00:30→02:30 Paris = heures 00, 01, 02 en 'd', le reste 'u'");
  assert(by["2026-09-10"].partial === true && by["2026-09-10"].hours === undefined, "premier jour partiel (pas d'heures : hors des 3 derniers jours)");
  assert(by["2026-09-15"].hours.slice(22) === "nn" && by["2026-09-15"].hours[21] === "d", "jour en cours : heures futures 'n', 21h Paris = 'd'");
  const inc = listIncidents(issues, now);
  assert(inc.length === 4 && inc[0].number === 4 && inc[0].end === null && inc[0].title === "X is down", "liste d'incidents : 4 (maintenance exclue), tri récent d'abord, titre sans emoji, en cours = end null");
  assert(severityOf({ title: "🛑 A is down", labels: [{ name: "status" }] }) === "down" && severityOf({ title: "hello", labels: [{ name: "status" }] }) === null, "sévérité d'après le titre");
  // DST : 25 oct. 2026 (changement d'heure) doit rester un jour de 25 h sans trou
  const dst = computeDays({ startTime: "2026-10-01T00:00:00Z" }, [mk(9, "🛑 X is down", "2026-10-24T22:00:00Z", "2026-10-25T23:00:00Z")], new Date("2026-10-26T12:00:00Z"));
  const d25 = dst.find((d) => d.date === "2026-10-25");
  assert(d25 && d25.down === 1500 && d25.state === "down" && d25.hours.length === 25, "jour de 25 h (DST) : 1500 min, 25 lettres");
};

if (process.argv.includes("--test")) test();
else main().catch((e) => { console.error(e); process.exit(1); });
