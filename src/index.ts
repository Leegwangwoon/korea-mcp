#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadGuide, GUIDE_TOPICS } from "./guides.js";
import { coveredYears, HOLIDAY_NOTE, HOLIDAY_SOURCE, holidayOn, holidaysBetween, todayInKorea } from "./holidays.js";
import { estimateFare } from "./subway/fare.js";
import { DATA_SOURCE, displayName, findStations, lines, type StationMatch } from "./subway/network.js";
import { findRoute } from "./subway/route.js";

const server = new McpServer({ name: "korea-mcp", version: "0.1.0" });

const json = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
const error = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });

function describeMatch({ station, confidence }: StationMatch) {
  return {
    name: displayName(station),
    korean: station.ko,
    english: station.en ?? null,
    japanese: station.ja ?? null,
    chinese: station.zh ?? null,
    lines: station.lines.map((id) => lines.get(id)?.en ?? id),
    location: { lat: station.lat, lon: station.lon },
    match: confidence,
  };
}

function resolveStation(query: string) {
  const matches = findStations(query, 5);
  if (matches.length === 0) return { error: `No station matches "${query}". Try the Korean name or a nearby station.` };
  if (matches[0].confidence === "exact" || matches.length === 1) return { station: matches[0].station };
  return { error: `"${query}" is ambiguous. Did you mean: ${matches.map((m) => displayName(m.station)).join(", ")}?` };
}

server.registerTool(
  "subway_route",
  {
    title: "Subway route",
    description:
      "Plan a subway/metro trip in the Seoul Metropolitan Area (Seoul, Incheon, Gyeonggi) between two stations. " +
      "Accepts station names in English, Korean, Japanese or Chinese, plus common landmarks (Hongdae, COEX, Incheon Airport). " +
      "Returns lines to take, where to transfer, which direction to board, estimated minutes and fare. Works offline, no API key.",
    inputSchema: {
      from: z.string().describe("Departure station, e.g. 'Myeongdong', '명동', 'Incheon Airport T1'"),
      to: z.string().describe("Arrival station, e.g. 'Seongsu', '성수'"),
      allow_express: z.boolean().optional().describe("Also consider express trains (Line 9, Line 1, Suin–Bundang…). Default false; express data is less complete."),
      airport_express: z.boolean().optional().describe("Allow the AREX direct train (Seoul Station ↔ Incheon Airport), which needs a separate ticket. Default false."),
      fewer_transfers: z.boolean().optional().describe("Prefer fewer transfers even if slightly slower."),
    },
  },
  async ({ from, to, allow_express, airport_express, fewer_transfers }) => {
    const a = resolveStation(from);
    if ("error" in a) return error(a.error!);
    const b = resolveStation(to);
    if ("error" in b) return error(b.error!);
    if (a.station.ko === b.station.ko) return error(`${displayName(a.station)} is both the start and the destination.`);

    const route = findRoute(a.station.ko, b.station.ko, {
      allowExpress: allow_express,
      allowAirportExpress: airport_express,
      transferPenalty: fewer_transfers ? 12 : undefined,
    });
    if (!route) return error(`No subway connection found between ${displayName(a.station)} and ${displayName(b.station)}.`);

    return json({
      summary:
        `${route.from} → ${route.to}: about ${route.minutes} min, ` +
        `${route.transfers === 0 ? "no transfers" : `${route.transfers} transfer${route.transfers > 1 ? "s" : ""}`}.`,
      steps: route.legs.map((leg, i) => ({
        step: i + 1,
        instruction:
          `${i === 0 ? "Board" : "Transfer to"} ${leg.line.en} (${leg.line.ko})${leg.express ? " EXPRESS (급행)" : ""} at ${leg.from}, ` +
          `on the platform whose next stop is ${leg.nextStop}. Ride ${leg.stops} stop${leg.stops > 1 ? "s" : ""} to ${leg.to}.`,
        line: leg.line,
        express: leg.express,
        stops: leg.stops,
        minutes: leg.minutes,
        stations: leg.stations,
      })),
      estimated_minutes: route.minutes,
      transfers: route.transfers,
      fare: estimateFare(route),
      caveats: [
        "Times are estimates from station distances plus ~7 min per transfer; trains run roughly every 3–10 min (longer late at night and on some suburban lines).",
        "Most lines stop running around midnight. First trains start around 05:30.",
      ],
      data: DATA_SOURCE,
    });
  },
);

server.registerTool(
  "subway_station",
  {
    title: "Find subway station",
    description:
      "Look up a Seoul-area subway station by name in English, Korean, Japanese or Chinese (typos tolerated). " +
      "Returns official names in each language, the lines serving it and coordinates. Use this to translate station names.",
    inputSchema: { query: z.string().describe("Station name or landmark, e.g. 'gangnam', '강남', 'Hongdae'") },
  },
  async ({ query }) => {
    const matches = findStations(query, 5);
    if (matches.length === 0) return error(`No station matches "${query}".`);
    return json({ matches: matches.map(describeMatch), data: DATA_SOURCE });
  },
);

server.registerTool(
  "korea_holidays",
  {
    title: "Korean public holidays",
    description:
      "List South Korean public holidays (including substitute holidays) in a date range, or check whether a date is a holiday. " +
      "Useful for planning: many shops, banks and offices close, and transport is crowded around Seollal and Chuseok.",
    inputSchema: {
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Start date YYYY-MM-DD. Default: today in Korea."),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("End date YYYY-MM-DD. Default: 365 days after start."),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Check a single date instead of a range."),
    },
  },
  async ({ from, to, date }) => {
    if (date) {
      const found = holidayOn(date);
      const weekday = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
      const year = Number(date.slice(0, 4));
      return json({
        date,
        weekday,
        is_public_holiday: found.length > 0,
        holidays: found,
        ...(coveredYears.includes(year) ? {} : { warning: `Holiday data covers ${coveredYears.join(", ")} only.` }),
      });
    }
    const start = from ?? todayInKorea();
    const end = to ?? new Date(Date.parse(start) + 365 * 86400_000).toISOString().slice(0, 10);
    return json({ from: start, to: end, holidays: holidaysBetween(start, end), covered_years: coveredYears, note: HOLIDAY_NOTE, source: HOLIDAY_SOURCE });
  },
);

server.registerTool(
  "korea_guide",
  {
    title: "Practical Korea guide",
    description:
      "Short, practical guides for visitors and foreign residents in Korea. " +
      `Topics: ${GUIDE_TOPICS.join(", ")}.`,
    inputSchema: { topic: z.enum(GUIDE_TOPICS as [string, ...string[]]) },
  },
  async ({ topic }) => ({ content: [{ type: "text", text: loadGuide(topic) }] }),
);

await server.connect(new StdioServerTransport());
