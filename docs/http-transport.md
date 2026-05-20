# HTTP transport

BobMan MCP supports a Streamable HTTP transport in addition to the default stdio. Use it when you want a long-lived shared server multiple agents can connect to.

## Quick start

```bash
export BOBMAN_TOKEN=$(openssl rand -hex 32)
bobman-mcp start --http :7901
```

The server binds to `127.0.0.1:7901` by default. To accept connections from other hosts (NOT recommended without TLS) you must explicitly opt in:

```bash
BOBMAN_TOKEN=$(openssl rand -hex 32) bobman-mcp start --http :7901 --host 0.0.0.0
```

BobMan refuses to start with a non-loopback host if `BOBMAN_TOKEN` is unset.

## Authentication

Every request must include:

```
Authorization: Bearer $BOBMAN_TOKEN
```

Unauthenticated requests get `401 {"error":"unauthorized"}`.

## Endpoints

- `POST /mcp` — MCP Streamable HTTP. Same JSON-RPC payload as the stdio transport.
- `GET /health` — JSON snapshot `{ version, schema_version, sessions_total, sessions_active, started_at }`.

## Example: list tools with curl

```bash
TOKEN=$BOBMAN_TOKEN
curl -s -X POST http://127.0.0.1:7901/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

## Security notes

- BobMan does NOT terminate TLS itself. Put it behind nginx, Caddy, or a similar reverse proxy if you expose it beyond localhost.
- The token is a static shared secret; rotate it on suspected exposure.
- The `BOBMAN_TOKEN` value is never logged.
