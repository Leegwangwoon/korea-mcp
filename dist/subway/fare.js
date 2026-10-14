import { loadData } from "../data.js";
const fares = loadData("fares.json");
// Straight-line hops between stations undercount track length a little.
const TRACK_FACTOR = 1.15;
export function distanceSurcharge(km) {
    const { baseDistanceKm, steps } = fares.adult;
    let extra = 0;
    let from = baseDistanceKm;
    for (const { untilKm, everyKm, add } of steps) {
        if (km <= from)
            break;
        const span = Math.min(km, untilKm ?? Infinity) - from;
        extra += Math.ceil(span / everyKm) * add;
        from = untilKm ?? Infinity;
    }
    return extra;
}
export function estimateFare(route) {
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
