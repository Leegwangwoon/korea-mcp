import { loadData } from "../data.js";
import type { Route } from "./route.js";

interface FareTable {
  source: string;
  checkedAt: string;
  adult: {
    card: number;
    singleJourneyTicket: number;
    baseDistanceKm: number;
    steps: { untilKm: number | null; everyKm: number; add: number }[];
  };
  lineSurcharges: Record<string, string>;
}

const fares = loadData<FareTable>("fares.json");

// Straight-line hops between stations undercount track length a little.
const TRACK_FACTOR = 1.15;

export interface FareEstimate {
  cardKrw: number;
  singleJourneyTicketKrw: number;
  estimatedTrackKm: number;
  notes: string[];
  source: string;
  checkedAt: string;
}

export function distanceSurcharge(km: number): number {
  const { baseDistanceKm, steps } = fares.adult;
  let extra = 0;
  let from = baseDistanceKm;
  for (const { untilKm, everyKm, add } of steps) {
    if (km <= from) break;
    const span = Math.min(km, untilKm ?? Infinity) - from;
    extra += Math.ceil(span / everyKm) * add;
    from = untilKm ?? Infinity;
  }
  return extra;
}

export function estimateFare(route: Route): FareEstimate {
  const km = route.distanceKm * TRACK_FACTOR;
  const extra = distanceSurcharge(km);
  const notes = [...new Set(route.legs.map((l) => fares.lineSurcharges[l.line.id]).filter(Boolean))];
  notes.push("Adult fare. Transfers between subway lines (and to buses within 30 min) are free when you tap the same card.");
  return {
    cardKrw: fares.adult.card + extra,
    singleJourneyTicketKrw: fares.adult.singleJourneyTicket + extra,
    estimatedTrackKm: Math.round(km * 10) / 10,
    notes,
    source: fares.source,
    checkedAt: fares.checkedAt,
  };
}
