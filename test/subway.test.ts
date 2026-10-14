import assert from "node:assert/strict";
import { test } from "node:test";
import { distanceSurcharge } from "../src/subway/fare.js";
import { findStations } from "../src/subway/network.js";
import { findRoute } from "../src/subway/route.js";

test("finds stations in English, Korean, Japanese, Chinese and by landmark", () => {
  assert.equal(findStations("Myeongdong")[0].station.ko, "명동");
  assert.equal(findStations("명동역")[0].station.ko, "명동");
  assert.equal(findStations("弘大入口")[0].station.ko, "홍대입구");
  assert.equal(findStations("hongdae")[0].station.ko, "홍대입구");
  assert.equal(findStations("Incheon Airport T1")[0].station.ko, "인천공항1터미널");
  assert.equal(findStations("Seoul Station")[0].station.ko, "서울");
});

test("tolerates typos", () => {
  assert.equal(findStations("Gangnamm")[0].station.ko, "강남");
  assert.equal(findStations("Myungdong")[0].station.ko, "명동");
});

test("Myeongdong → Seongsu: Line 4 then Line 2 with one transfer", () => {
  const r = findRoute("명동", "성수")!;
  assert.deepEqual(r.legs.map((l) => l.line.id), ["4", "2"]);
  assert.ok(r.minutes >= 15 && r.minutes <= 30, `got ${r.minutes} min`);
});

test("Hongik Univ. → Gangnam stays on Line 2", () => {
  const r = findRoute("홍대입구", "강남")!;
  assert.equal(r.transfers, 0);
  assert.equal(r.legs[0].line.id, "2");
});

test("Incheon Airport → Seoul Station takes AREX all-stop in about an hour", () => {
  const r = findRoute("인천공항1터미널", "서울")!;
  assert.deepEqual(r.legs.map((l) => l.line.id), ["arex"]);
  assert.ok(r.minutes >= 50 && r.minutes <= 70, `got ${r.minutes} min`);
});

test("AREX direct train is only used when asked for", () => {
  assert.equal(findRoute("서울", "인천공항1터미널")!.legs[0].stops, 12);
  assert.equal(findRoute("서울", "인천공항1터미널", { allowAirportExpress: true })!.legs[0].stops, 1);
});

test("every station is reachable from Seoul Station", () => {
  const unreachable = ["강남", "판교", "인천", "수원", "의정부", "춘천", "운정중앙", "양촌"].filter((s) => !findRoute("서울", s));
  assert.deepEqual(unreachable, []);
});

test("distance fare: base up to 10 km, +100 per 5 km to 50 km, then per 8 km", () => {
  assert.equal(distanceSurcharge(9.9), 0);
  assert.equal(distanceSurcharge(10), 0);
  assert.equal(distanceSurcharge(10.1), 100);
  assert.equal(distanceSurcharge(15), 100);
  assert.equal(distanceSurcharge(15.1), 200);
  assert.equal(distanceSurcharge(50), 800);
  assert.equal(distanceSurcharge(58), 900);
  assert.equal(distanceSurcharge(58.1), 1000);
});
