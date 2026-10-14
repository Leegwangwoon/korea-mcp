import { distanceKm, displayName, edges, lines, stations, type Station } from "./network.js";

// OSM has the order of stops but no timetable, so ride time is estimated as a
// fixed per-stop overhead (dwell + braking) plus distance at the line's running
// speed. Calibrated against published journey times (e.g. AREX all-stop
// Incheon T1 → Seoul ≈ 59 min, Line 2 ≈ 2 min per stop); treat as estimates.
const STOP_OVERHEAD_MIN = 0.7;
const DEFAULT_SPEED_KMH = 45;
const LINE_SPEED_KMH: Record<string, number> = {
  "1": 55,
  arex: 70,
  "gtx-a": 120,
  shinbundang: 70,
  gyeongui: 55,
  gyeongchun: 60,
  suin: 50,
  seohae: 60,
  gyeonggang: 60,
};
/** Walking between platforms plus the average wait for the next train. */
const TRANSFER_MIN = 7;
/** Switching between local and express trains on the same line (often cross-platform). */
const SAME_LINE_SWITCH_MIN = 5;

const hopMinutes = (a: Station, b: Station, line: string) =>
  STOP_OVERHEAD_MIN + (distanceKm(a, b) / (LINE_SPEED_KMH[line] ?? DEFAULT_SPEED_KMH)) * 60;

/** AREX direct trains need a separate reserved ticket, so they are opt-in. */
const TICKETED_EXPRESS = new Set(["arex"]);

type Adj = Map<string, { to: string; line: string; express: boolean }[]>;
const adjacency: Adj = new Map();
for (const e of edges) {
  const list = adjacency.get(e.from) ?? [];
  list.push({ to: e.to, line: e.line, express: e.express });
  adjacency.set(e.from, list);
}

export interface Leg {
  line: { id: string; ko: string; en: string; colour: string | null };
  from: string;
  to: string;
  /** First stop after boarding — tells the rider which platform/direction to take. */
  nextStop: string;
  express: boolean;
  stops: number;
  stations: string[];
  minutes: number;
}

export interface Route {
  from: string;
  to: string;
  legs: Leg[];
  transfers: number;
  minutes: number;
  distanceKm: number;
}

export interface RouteOptions {
  /** Use express trains (Line 9, Suin–Bundang, Line 1, …). Default false: OSM express patterns are incomplete. */
  allowExpress?: boolean;
  /** Use the AREX direct train, which needs its own ticket. Default false. */
  allowAirportExpress?: boolean;
  /** Extra minutes per transfer; raise it to prefer fewer transfers. */
  transferPenalty?: number;
}

/** Fastest path between two stations by estimated time, counting transfer walks. */
export function findRoute(fromKo: string, toKo: string, opts: RouteOptions = {}): Route | null {
  const transferMin = opts.transferPenalty ?? TRANSFER_MIN;
  const allowExpress = opts.allowExpress ?? false;
  if (fromKo === toKo) return null;

  // State = (station, line we are riding). Start state has no line.
  const key = (st: string, line: string) => `${st}\u0000${line}`;
  const dist = new Map<string, number>([[key(fromKo, ""), 0]]);
  const prev = new Map<string, string>();
  const queue = new MinHeap<[number, string, string]>((a, b) => a[0] - b[0]);
  queue.push([0, fromKo, ""]);

  let goal: string | null = null;
  while (queue.size) {
    const [d, st, line] = queue.pop()!;
    const k = key(st, line);
    if (d > (dist.get(k) ?? Infinity)) continue;
    if (st === toKo) {
      goal = k;
      break;
    }
    const here = stations.get(st)!;
    for (const e of adjacency.get(st) ?? []) {
      if (e.express && !(TICKETED_EXPRESS.has(e.line) ? opts.allowAirportExpress : allowExpress)) continue;
      const there = stations.get(e.to);
      if (!there) continue;
      const ride = e.express ? `${e.line}${EXPRESS_SUFFIX}` : e.line;
      const switching = line && line !== ride;
      const penalty = !switching ? 0 : baseLine(line) === e.line ? SAME_LINE_SWITCH_MIN : transferMin;
      const cost = hopMinutes(here, there, e.line) + penalty;
      const nk = key(e.to, ride);
      if (d + cost < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, d + cost);
        prev.set(nk, k);
        queue.push([d + cost, e.to, ride]);
      }
    }
  }
  if (!goal) return null;

  const path: { st: string; line: string }[] = [];
  for (let k: string | undefined = goal; k; k = prev.get(k)) {
    const [st, line] = k.split("\u0000");
    path.unshift({ st, line });
  }

  const legs: Leg[] = [];
  const legKeys: string[] = [];
  let totalKm = 0;
  for (let i = 1; i < path.length; i++) {
    const { st, line: ride } = path[i];
    const line = baseLine(ride);
    const a = stations.get(path[i - 1].st)!;
    const b = stations.get(st)!;
    totalKm += distanceKm(a, b);
    let leg = legs.at(-1);
    if (!leg || legKeys.at(-1) !== ride) {
      leg = {
        line: lines.get(line)!,
        from: displayName(a),
        to: "",
        nextStop: displayName(b),
        express: ride !== line,
        stops: 0,
        stations: [displayName(a)],
        minutes: 0,
      };
      legs.push(leg);
      legKeys.push(ride);
    }
    leg.to = displayName(b);
    leg.stops++;
    leg.stations.push(displayName(b));
    leg.minutes += hopMinutes(a, b, line);
  }

  let minutes = legs.reduce((s, l) => s + l.minutes, 0);
  for (let i = 1; i < legs.length; i++) minutes += legs[i].line.id === legs[i - 1].line.id ? SAME_LINE_SWITCH_MIN : TRANSFER_MIN;
  for (const l of legs) l.minutes = Math.round(l.minutes);
  return {
    from: displayName(stations.get(fromKo)!),
    to: displayName(stations.get(toKo)!),
    legs,
    transfers: legs.length - 1,
    minutes: Math.round(minutes),
    distanceKm: Math.round(totalKm * 10) / 10,
  };
}

const EXPRESS_SUFFIX = "+express";
const baseLine = (ride: string) => ride.replace(EXPRESS_SUFFIX, "");

class MinHeap<T> {
  private items: T[] = [];
  constructor(private cmp: (a: T, b: T) => number) {}
  get size() {
    return this.items.length;
  }
  push(item: T) {
    const a = this.items;
    a.push(item);
    for (let i = a.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (this.cmp(a[i], a[p]) >= 0) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop(): T | undefined {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length && last !== undefined) {
      a[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.cmp(a[l], a[m]) < 0) m = l;
        if (r < a.length && this.cmp(a[r], a[m]) < 0) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}
