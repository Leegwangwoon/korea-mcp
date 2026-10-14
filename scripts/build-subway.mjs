#!/usr/bin/env node
// Builds data/subway.json from OpenStreetMap (ODbL) — no API key needed.
// Usage: node scripts/build-subway.mjs [--cache dir]
//
// Pulls every subway / light-rail / commuter-rail route relation in the Seoul
// Metropolitan Area, keeps the ordered stop list of each, and merges stops that
// share a Korean name into one station (that is where transfers happen).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const cacheArg = process.argv.indexOf("--cache");
const CACHE = cacheArg > 0 ? process.argv[cacheArg + 1] : null;

const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const BBOX = "36.7,126.3,38.1,127.8"; // Seoul, Incheon, Gyeonggi
const ROUTE_FILTER = `["route"~"^(subway|light_rail|monorail|train)$"]`;

async function overpass(name, query) {
  const cached = CACHE && join(CACHE, `${name}.json`);
  if (cached && existsSync(cached)) return JSON.parse(await readFile(cached, "utf8"));
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const url of MIRRORS) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "User-Agent": "korea-mcp data build script (npm: korea-mcp)" },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(180_000),
        });
        const text = await res.text();
        const json = JSON.parse(text);
        if (cached) {
          await mkdir(CACHE, { recursive: true });
          await writeFile(cached, text);
        }
        return json;
      } catch (err) {
        console.error(`  ${name}: ${new URL(url).host} failed (${err.message.slice(0, 60)})`);
      }
    }
    await new Promise((r) => setTimeout(r, 10_000 * (attempt + 1)));
  }
  throw new Error(`Overpass query "${name}" failed on every mirror`);
}

console.error("Fetching route relations…");
const routes = await overpass("routes", `[out:json][timeout:170];rel(${BBOX})${ROUTE_FILTER};out body;`);
console.error("Fetching stop nodes…");
const nodes = await overpass("nodes", `[out:json][timeout:170];rel(${BBOX})${ROUTE_FILTER}->.r;node(r.r);out body;`);
console.error("Fetching station nodes (for English names)…");
const stationNodes = await overpass(
  "stations",
  `[out:json][timeout:170];(node(${BBOX})["railway"="station"];node(${BBOX})["public_transport"="station"];);out body;`,
);

const nodeById = new Map(nodes.elements.map((n) => [n.id, n]));

// Mirrors sometimes return a partial node set; fetch whatever is still missing by id.
const missingIds = [
  ...new Set(routes.elements.flatMap((r) => r.members.filter((m) => m.type === "node" && !nodeById.has(m.ref)).map((m) => m.ref))),
];
if (missingIds.length) {
  console.error(`Fetching ${missingIds.length} missing nodes…`);
  const extra = await overpass(`missing-${missingIds.length}`, `[out:json][timeout:170];node(id:${missingIds.join(",")});out body;`);
  for (const n of extra.elements) {
    nodeById.set(n.id, n);
    nodes.elements.push(n);
  }
}

// Some stop positions carry no name tag. Borrow the name of the nearest named
// station node (within ~400 m), which is how a human mapper would read it.
const namedStations = stationNodes.elements.filter((n) => n.tags?.name);
for (const n of nodes.elements) {
  if (n.tags?.name) continue;
  let best = null;
  let bestD = 0.004 ** 2;
  for (const s of namedStations) {
    const d = (s.lat - n.lat) ** 2 + ((s.lon - n.lon) * Math.cos((n.lat * Math.PI) / 180)) ** 2;
    if (d < bestD) [best, bestD] = [s, d];
  }
  if (best) n.tags = { ...n.tags, name: best.tags.name };
}

// Korean name → best-known translations, taken from any node with that name.
const names = new Map();
for (const n of [...stationNodes.elements, ...nodes.elements]) {
  const t = n.tags ?? {};
  const ko = cleanKo(t.name ?? t["name:ko"]);
  if (!ko) continue;
  const entry = names.get(ko) ?? {};
  for (const [lang, key] of [["en", "name:en"], ["ja", "name:ja"], ["zh", "name:zh"]]) {
    if (!entry[lang] && t[key]) entry[lang] = t[key].replace(/\s+Station(?=\s*\(|$)/i, "").trim();
  }
  names.set(ko, entry);
}

// Gaps in OSM translations, using the official romanized station names.
const NAME_OVERRIDES = {
  부천시청: { en: "Bucheon City Hall" },
};
for (const [ko, extra] of Object.entries(NAME_OVERRIDES)) names.set(ko, { ...names.get(ko), ...extra });

function cleanKo(name) {
  if (!name) return null;
  // "서울역" and "서울" are the same station on different lines; OSM also sometimes
  // appends the line ("강남 (2호선)") or the word 역.
  return name.replace(/\s*\(.*?\)\s*/g, "").replace(/역$/, "").trim() || null;
}

// Canonical lines. OSM splits each line into many relations (one per direction,
// branch and service pattern) with inconsistent names, so match on the Korean
// relation name and map to a stable id. Anything unmatched (KTX, ITX, Mugunghwa,
// North Korean lines, tourist trains) is dropped.
const LINES = [
  { id: "1", match: /^수도권 전철 1호선/, ko: "1호선", en: "Line 1" },
  { id: "2", match: /^서울 지하철 2호선/, ko: "2호선", en: "Line 2" },
  { id: "3", match: /^수도권 전철 3호선/, ko: "3호선", en: "Line 3" },
  { id: "4", match: /^수도권 전철 4호선/, ko: "4호선", en: "Line 4" },
  { id: "5", match: /^서울 지하철 5호선/, ko: "5호선", en: "Line 5" },
  { id: "6", match: /^서울 지하철 6호선/, ko: "6호선", en: "Line 6" },
  { id: "7", match: /^서울 지하철 7호선/, ko: "7호선", en: "Line 7" },
  { id: "8", match: /^서울 지하철 8호선/, ko: "8호선", en: "Line 8" },
  { id: "9", match: /^서울 지하철 9호선/, ko: "9호선", en: "Line 9" },
  { id: "arex", match: /^인천국제공항철도/, ko: "공항철도", en: "AREX (Airport Railroad)" },
  { id: "gyeongui", match: /^경의·중앙선/, ko: "경의·중앙선", en: "Gyeongui–Jungang Line" },
  { id: "gyeongchun", match: /경춘선/, ko: "경춘선", en: "Gyeongchun Line" },
  { id: "suin", match: /^수인·분당선/, ko: "수인·분당선", en: "Suin–Bundang Line" },
  { id: "shinbundang", match: /신분당선/, ko: "신분당선", en: "Shinbundang Line" },
  { id: "gyeonggang", match: /경강선/, ko: "경강선", en: "Gyeonggang Line" },
  { id: "seohae", match: /^수도권 전철 서해선/, ko: "서해선", en: "Seohae Line" },
  { id: "gtx-a", match: /광역급행철도 A/, ko: "GTX-A", en: "GTX-A" },
  { id: "incheon1", match: /^인천 도시철도 1호선/, ko: "인천 1호선", en: "Incheon Line 1" },
  { id: "incheon2", match: /^인천 도시철도 2호선/, ko: "인천 2호선", en: "Incheon Line 2" },
  { id: "ui-sinseol", match: /^우이신설선/, ko: "우이신설선", en: "Ui–Sinseol Line" },
  { id: "sillim", match: /신림선/, ko: "신림선", en: "Sillim Line" },
  { id: "gimpo", match: /김포 골드라인/, ko: "김포골드라인", en: "Gimpo Goldline" },
  { id: "yongin", match: /^용인 경전철/, ko: "용인경전철", en: "Yongin EverLine" },
  { id: "uijeongbu", match: /^의정부경전철/, ko: "의정부경전철", en: "Uijeongbu LRT" },
  { id: "maglev", match: /자기부상철도/, ko: "인천공항 자기부상철도", en: "Incheon Airport Maglev" },
];
// "서울 지하철 9호선 급행", "인천국제공항철도 직통열차" — but not "광역급행철도" (GTX).
const EXPRESS = /\s(급행|직통|특급)/;

const lines = new Map(); // id → { …LINES entry, colour, patterns }
for (const rel of routes.elements) {
  const t = rel.tags ?? {};
  const relName = t.name ?? "";
  const def = LINES.find((l) => l.match.test(relName));
  if (!def) continue;

  const stops = [];
  for (const m of rel.members) {
    if (m.type !== "node" || !m.role.startsWith("stop")) continue;
    const ko = cleanKo(nodeById.get(m.ref)?.tags?.name);
    if (ko && stops.at(-1) !== ko) stops.push(ko);
  }
  if (stops.length < 2) continue;

  const line = lines.get(def.id) ?? { id: def.id, ko: def.ko, en: def.en, colour: null, patterns: [] };
  line.colour ??= /^#[0-9A-Fa-f]{6}$/.test(t.colour ?? "") ? t.colour.toUpperCase() : null;
  line.patterns.push({ express: EXPRESS.test(relName), stops });
  lines.set(def.id, line);
}

// Build the station set and adjacency. Express patterns only add edges between
// their own stops, so they can be skipped by the router when not wanted.
const stations = new Map();
const edges = new Map(); // "a|b|line" → { from, to, line, express }
for (const line of lines.values()) {
  for (const { stops, express } of line.patterns) {
    for (let i = 0; i < stops.length; i++) {
      const ko = stops[i];
      const st = stations.get(ko) ?? { ko, ...names.get(ko), lines: [] };
      if (!st.lines.includes(line.id)) st.lines.push(line.id);
      stations.set(ko, st);
      if (i === 0) continue;
      const [a, b] = [stops[i - 1], ko];
      const k = `${a}|${b}|${line.id}`;
      const existing = edges.get(k);
      if (!existing || (existing.express && !express)) edges.set(k, { from: a, to: b, line: line.id, express });
    }
  }
}

// Some lines are only mapped in one direction. Add the missing reverse hop,
// except on the Line 6 Eungam loop, which really is one-way.
const ONE_WAY = new Set(["응암|역촌", "역촌|불광", "불광|독바위", "독바위|연신내", "연신내|구산", "구산|응암"]);
for (const e of [...edges.values()]) {
  const rev = `${e.to}|${e.from}|${e.line}`;
  if (!edges.has(rev) && !(e.line === "6" && ONE_WAY.has(`${e.from}|${e.to}`))) {
    edges.set(rev, { from: e.to, to: e.from, line: e.line, express: e.express });
  }
}

// Station coordinates: average of that station's stop nodes.
const coords = new Map();
for (const n of nodes.elements) {
  const ko = cleanKo(n.tags?.name);
  if (!ko || !stations.has(ko)) continue;
  const c = coords.get(ko) ?? { lat: 0, lon: 0, n: 0 };
  c.lat += n.lat;
  c.lon += n.lon;
  c.n++;
  coords.set(ko, c);
}
for (const [ko, c] of coords) {
  const st = stations.get(ko);
  st.lat = +(c.lat / c.n).toFixed(6);
  st.lon = +(c.lon / c.n).toFixed(6);
}

const out = {
  source: "© OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright",
  generatedAt: new Date().toISOString(),
  lines: LINES.filter((l) => lines.has(l.id)).map((l) => { const { patterns, ...rest } = lines.get(l.id); return rest; }),
  stations: [...stations.values()].sort((a, b) => a.ko.localeCompare(b.ko, "ko")),
  edges: [...edges.values()],
};

await writeFile(join(ROOT, "data/subway.json"), JSON.stringify(out));
const missingEn = out.stations.filter((s) => !s.en).map((s) => s.ko);
console.error(`Wrote ${out.lines.length} lines, ${out.stations.length} stations, ${out.edges.length} edges.`);
console.error(`${missingEn.length} stations without an English name: ${missingEn.slice(0, 30).join(", ")}${missingEn.length > 30 ? "…" : ""}`);
