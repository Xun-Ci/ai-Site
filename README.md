# URL-Agent Lab

**URL-Agent Protocol (UAP) v0.1 — experimental**

Live site: https://xun-ci.github.io/ai-Site/

- Home: https://xun-ci.github.io/ai-Site/
- Tool catalog: https://xun-ci.github.io/ai-Site/guide/
- Protocol: https://xun-ci.github.io/ai-Site/protocol/
- Tool endpoint: https://xun-ci.github.io/ai-Site/tools/?tool=calc&expr=2%2B3

## Tools

| Tool | Parameters | Purpose |
|---|---|---|
| echo | message | Echo text |
| calc | expr | Safe arithmetic parser |
| text | op, text, find, with | Text transformations |
| count | text | Text statistics |
| json | data, mode | Parse, format, minify, list keys |
| encode | mode, text | URL and Base64 encoding |
| random | type, min, max | UUID and random numbers |
| time | tz | Current time and timezone |
| convert | value, from, to | Length, mass and temperature |
| hash | text | SHA-256 |
| read | path | Read public repository data |
| write | token, text, from | Append a record to data.txt |

## URL-Agent Protocol

A tool is selected by the `tool` query parameter. Other query parameters are the tool input. Tool pages return a visible JSON envelope:

```json
{
  "protocol": "URL-Agent/0.1",
  "tool": "calc",
  "status": "ok",
  "input": { "expr": "2+3" },
  "output": { "value": 5 }
}
```

This is an experimental project convention, not an official MCP replacement or registered Internet standard.

GitHub Pages serves the repository root from the `main` branch.
