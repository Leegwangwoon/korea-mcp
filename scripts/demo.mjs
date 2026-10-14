// Calls the real MCP server over stdio and prints the subway_route result.
// Used to record docs/demo.gif (see scripts/demo.tape).
// Usage: node scripts/demo.mjs "<from>" "<to>"
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [from = "Myeongdong", to = "Seongsu"] = process.argv.slice(2);

const client = new Client({ name: "korea-mcp-demo", version: "0.1.0" });
await client.connect(new StdioClientTransport({ command: "node", args: ["dist/index.js"] }));
const res = await client.callTool({ name: "subway_route", arguments: { from, to } });
await client.close();

const route = JSON.parse(res.content[0].text);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rgb = (hex) => hex.match(/\w\w/g).map((h) => parseInt(h, 16)).join(";");
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const badge = (line) => `\x1b[48;2;${rgb(line.colour)}m\x1b[1;97m ${line.en} \x1b[0m`;
const short = (name) => name.replace(/ \(.*$/, "");

console.log(`\n  ${bold(route.summary)}\n`);
for (const s of route.steps) {
  await sleep(500);
  const first = s.stations[0];
  const last = s.stations[s.stations.length - 1];
  console.log(`  ${badge(s.line)}  ${short(first)} → ${short(last)}  ${dim(`${s.stops} stops · ${s.minutes} min`)}`);
  console.log(`  ${" ".repeat(s.line.en.length + 2)}  board toward ${s.stations[1]}\n`);
}
await sleep(500);
const fare = route.fare.cardKrw.toLocaleString("en-US");
console.log(`  ${bold(`₩${fare}`)} with a T-money card ${dim("·")} ${bold(`${route.estimated_minutes} min`)} ${dim("·")} ${route.transfers} transfer${route.transfers === 1 ? "" : "s"}\n`);
