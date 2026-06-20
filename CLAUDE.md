# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

wren is a lightweight, offline-first REST API client — a single Go binary (~9 MB) that serves a vanilla JS frontend at `http://localhost:7070`. Built as a low-memory Postman alternative.

## Commands

```bash
# Build (embeds frontend/ into the binary at compile time)
go build -o wren .

# Run
./wren
# PORT=8080 ./wren  # custom port

# Cross-compile
GOOS=darwin GOARCH=arm64 go build -o wren-darwin-arm64 .
GOOS=linux GOARCH=amd64 go build -o wren-linux-amd64 .

# Format / vet (no third-party linters)
gofmt -w .
go vet ./...
```

There are no tests.

## Architecture

**Zero dependencies** — `go.mod` contains only `module wren` and `go 1.22`. Everything uses stdlib.

### Backend (`main.go` + `internal/`)

All HTTP route handlers are inline closures inside `main()`. Go 1.22's pattern-based mux handles method+path routing (`GET /api/workspaces/{id}`).

- `internal/models/models.go` — all shared types (`Workspace`, `Request`, `Environment`, `SendResponse`, etc.). Single source of truth for the data model.
- `internal/storage/storage.go` — reads/writes JSON files under `~/.apiclient/{workspaces,environments,history}/`. One JSON file per workspace/environment, one `.log` file per day for history.
- `internal/proxy/proxy.go` — executes outbound HTTP requests. Applies `{{varName}}` substitution (via `sub()`) to URL, query params, headers, body, and auth fields before sending. Response body is capped at 10 MB. HTTP client timeout is 30 seconds.
- `internal/curl/curl.go` — curl parser (`tokenize` + `Parse`) and `Export`. The tokenizer handles single/double quotes and `\` line continuations.
- `internal/postman/postman.go` — Postman Collection v2/v2.1 importer. `PMURL` has a custom `UnmarshalJSON` to handle Postman's dual string/object URL format.
- `internal/uid/uid.go` — generates IDs as `{unix_ms_hex}-{6_random_bytes_hex}`.

History writes happen in a goroutine (`go store.AppendHistory(...)`) — fire-and-forget, errors are not surfaced to the client.

### Frontend (`frontend/`)

Vanilla JS with no framework and no build step. All state lives in a single global object `S` in `app.js`. The `api` object wraps `fetch` calls. Client-side IDs (for tabs) are generated with a local `uid()` function prefixed with `'c'`; server-persisted IDs come from the backend's `uid.New()`.

**The frontend is embedded into the binary at build time** via `//go:embed frontend` in `main.go`. Any frontend change requires a rebuild — there is no hot-reload.

## Key gotchas

- **Frontend changes need a rebuild** — editing `.html`, `.css`, or `.js` files has no effect until you run `go build` again.
- **Data directory is `~/.apiclient/`**, not `~/.wren/` — the directory name predates the project rename.
- **`writeJSON` in `main.go`** is the only JSON response helper; all handlers use it.
- **No authentication or multi-user support** — this is a single-user local tool.
- **Postman import supports v2 and v2.1 only** — v1 collections are not handled.
