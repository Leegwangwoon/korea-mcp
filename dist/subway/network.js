import { loadData } from "../data.js";
const data = loadData("subway.json");
export const DATA_SOURCE = data.source;
export const lines = new Map(data.lines.map((l) => [l.id, l]));
export const stations = new Map(data.stations.map((s) => [s.ko, s]));
export const edges = data.edges;
// Names people actually type that don't match the official romanization.
const ALIASES = {
    hongdae: "홍대입구",
    "hongik university": "홍대입구",
    "seoul station": "서울",
    "incheon airport": "인천공항1터미널",
    "incheon airport terminal 1": "인천공항1터미널",
    "incheon airport terminal 2": "인천공항2터미널",
    "incheon airport t1": "인천공항1터미널",
    "incheon airport t2": "인천공항2터미널",
    "incheon international airport": "인천공항1터미널",
    icn: "인천공항1터미널",
    "icn t1": "인천공항1터미널",
    "icn t2": "인천공항2터미널",
    "gimpo airport": "김포공항",
    gmp: "김포공항",
    itaewon: "이태원",
    dongdaemun: "동대문역사문화공원",
    ddp: "동대문역사문화공원",
    coex: "삼성",
    "lotte world": "잠실",
    "jamsil station": "잠실",
    gyeongbokgung: "경복궁",
    insadong: "안국",
    bukchon: "안국",
    "namsan tower": "명동",
    "n seoul tower": "명동",
    "gangnam station": "강남",
    "yeouido park": "여의도",
    "the hyundai seoul": "여의도",
    "seongsu-dong": "성수",
    "myeong-dong": "명동",
};
export function normalize(s) {
    return s
        .toLowerCase()
        .normalize("NFKC")
        .replace(/[‘’'`".·()（）]/g, "")
        .replace(/\b(station|stn|subway|metro)\b/g, "")
        .replace(/역$/, "")
        .replace(/[\s\-_]+/g, "");
}
const index = [];
for (const st of stations.values()) {
    for (const name of [st.ko, st.en, st.ja, st.zh]) {
        if (name)
            index.push({ key: normalize(name), station: st });
    }
}
for (const [alias, ko] of Object.entries(ALIASES)) {
    const st = stations.get(ko);
    if (st)
        index.push({ key: normalize(alias), station: st });
}
/** Find stations by Korean, English, Japanese or Chinese name, best matches first. */
export function findStations(query, limit = 5) {
    const q = normalize(query);
    if (!q)
        return [];
    const seen = new Set();
    const out = [];
    const push = (station, confidence) => {
        if (seen.has(station.ko) || out.length >= limit)
            return;
        seen.add(station.ko);
        out.push({ station, confidence });
    };
    for (const { key, station } of index)
        if (key === q)
            push(station, "exact");
    for (const { key, station } of index)
        if (key.startsWith(q))
            push(station, "partial");
    // "gangnam station exit 11" → "gangnam": accept a known name at the start of a longer query.
    for (const { key, station } of index)
        if (key.length >= 4 && q.startsWith(key))
            push(station, "partial");
    for (const { key, station } of index)
        if (q.length >= 3 && key.includes(q))
            push(station, "partial");
    if (out.length === 0) {
        const scored = index
            .filter(({ key }) => /^[a-z0-9]+$/.test(key) && q.length >= 4)
            .map(({ key, station }) => ({ station, d: editDistance(q, key) }))
            .filter(({ d }) => d <= Math.max(2, Math.floor(q.length / 4)))
            .sort((a, b) => a.d - b.d);
        for (const { station } of scored)
            push(station, "fuzzy");
    }
    return out;
}
function editDistance(a, b) {
    const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let prev = dp[0];
        dp[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const tmp = dp[j];
            dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
            prev = tmp;
        }
    }
    return dp[b.length];
}
export function distanceKm(a, b) {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}
export function displayName(st) {
    return st.en ? `${st.en} (${st.ko})` : st.ko;
}
