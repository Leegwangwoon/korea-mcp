import assert from "node:assert/strict";
import { test } from "node:test";
import { holidayOn, holidaysBetween, todayInKorea } from "../src/holidays.js";

test("Chuseok 2026 is a three-day holiday", () => {
  assert.equal(holidaysBetween("2026-09-24", "2026-09-26").length, 3);
});

test("substitute holidays are marked", () => {
  assert.equal(holidayOn("2026-08-17")[0].substitute, true);
  assert.equal(holidayOn("2026-08-15")[0].en, "Liberation Day");
});

test("Constitution Day and Labour Day are holidays from 2026", () => {
  assert.equal(holidayOn("2026-07-17").length, 1);
  assert.equal(holidayOn("2026-05-01").length, 1);
});

test("today in Korea uses UTC+9", () => {
  assert.equal(todayInKorea(new Date("2026-10-14T15:30:00Z")), "2026-10-15");
});
