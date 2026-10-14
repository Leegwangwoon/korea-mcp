import { loadData } from "./data.js";
const data = loadData("holidays.json");
export const HOLIDAY_SOURCE = data.source;
export const HOLIDAY_NOTE = data.note;
export const coveredYears = [...new Set(data.holidays.map((h) => Number(h.date.slice(0, 4))))];
export function holidaysBetween(from, to) {
    return data.holidays.filter((h) => h.date >= from && h.date <= to);
}
export function holidayOn(date) {
    return data.holidays.filter((h) => h.date === date);
}
/** Today's date in Korea (UTC+9, no DST), as YYYY-MM-DD. */
export function todayInKorea(now = new Date()) {
    return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}
