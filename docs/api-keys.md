# Optional API keys

`korea-mcp` works with **no keys at all**. Keys only unlock extras, and every tool degrades gracefully: without a key, a tool tells the agent what it couldn't do and links here instead of failing.

> Status: the keyless tier is shipped. The keyed tiers below are planned. This page records the design so contributors can build against it.

## Tiers

| Tier | Keys | Adds |
|---|---|---|
| 0 (default) | none | Subway routes and fares, station lookup, holidays, guides |
| 1 | `SEOUL_OPEN_DATA_KEY`, `KAKAO_REST_API_KEY` | Real-time train arrivals, place search, walking directions |
| 2 | `ODSAY_API_KEY` | Bus plus door-to-door transit routes |

Keys are read from environment variables:

```json
{
  "mcpServers": {
    "korea": {
      "command": "npx",
      "args": ["-y", "korea-mcp"],
      "env": { "KAKAO_REST_API_KEY": "…" }
    }
  }
}
```

## Getting the keys (guides to be written and tested)

Each guide will be written from the point of view of someone **outside Korea, without a Korean phone number**, with screenshots. Each will record exactly where the signup gets stuck, if it does.

- **Seoul Open Data Plaza** (data.seoul.go.kr): real-time subway arrivals. *To verify: signup with a foreign email only.*
- **Kakao Developers** (developers.kakao.com): Local API (places, geocoding). *To verify: Kakao account creation with a non-Korean phone number.*
- **ODsay LAB** (lab.odsay.com): transit routing. *To verify: free quota, and whether the terms allow use in a redistributed open-source tool.*
