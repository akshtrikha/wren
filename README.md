# wren

A lightweight, offline-first REST API client that runs in your browser — served from a single ~9 MB Go binary with zero runtime dependencies.

Built as a fast alternative to Postman for low-memory machines (M1 MacBook, old laptops, etc.).

![wren screenshot](https://raw.githubusercontent.com/akshtrikha/wren/main/screenshot.png)

---

## Features

- **Import cURL** — paste any `curl` command and it's parsed into a full request
- **Export cURL** — copy the current request as a `curl` command with one click
- **Import Postman collections** — drag in a Postman Collection v2 / v2.1 JSON file
- **Workspaces** — organise saved requests into named workspaces with folders
- **Environments** — define `{{baseUrl}}`, `{{token}}` style variables, switch between environments per request
- **Auth** — Bearer token, Basic Auth, custom header
- **Body types** — JSON (with Format button), form-urlencoded, multipart, raw
- **Multiple tabs** — open several requests side-by-side, each with its own response
- **Response viewer** — Pretty (syntax-highlighted JSON), Raw, Headers tabs with status / time / size
- **Session history** — every request + response is logged to `~/.apiclient/history/YYYY-MM-DD.log`
- **Resizable panels** — drag the divider between the request and response panels
- **Keyboard shortcuts** — `Cmd+Enter` (macOS) / `Ctrl+Enter` (Linux/Windows) to send, `Esc` to close modals

---

## Quick start

### Option A — download the binary (macOS arm64)

Download the latest `wren` binary from [Releases](https://github.com/akshtrikha/wren/releases), then:

```bash
chmod +x wren
./wren
# open http://localhost:7070
```

### Option B — build from source

**Requirements:** Go 1.22+

```bash
git clone https://github.com/akshtrikha/wren.git
cd wren
go build -o wren .
./wren
```

Open **http://localhost:7070** in any browser.

---

## Building

```bash
# standard build (current platform)
go build -o wren .

# cross-compile for macOS Apple Silicon
GOOS=darwin GOARCH=arm64 go build -o wren-darwin-arm64 .

# cross-compile for macOS Intel
GOOS=darwin GOARCH=amd64 go build -o wren-darwin-amd64 .

# cross-compile for Linux (amd64)
GOOS=linux GOARCH=amd64 go build -o wren-linux-amd64 .
```

The build embeds the entire frontend (`frontend/`) into the binary at compile time — no separate assets needed at runtime.

---

## Configuration

| Environment variable | Default | Description |
|---|---|---|
| `PORT` | `7070` | Port the server listens on |

```bash
PORT=8080 ./wren
```

---

## Data storage

All data is stored locally in `~/.apiclient/`:

```
~/.apiclient/
  workspaces/       # one JSON file per workspace (requests, folders)
  environments/     # one JSON file per environment (key-value variables)
  history/          # YYYY-MM-DD.log — newline-delimited JSON (req + response per line)
```

The history log is plain newline-delimited JSON — you can `grep`, `jq`, or tail it directly:

```bash
tail -f ~/.apiclient/history/$(date +%Y-%m-%d).log | jq .request.url
```

---

## API

wren runs a local HTTP server. All requests go through it (avoiding browser CORS restrictions).

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/send` | Execute an HTTP request and return the response |
| `GET/POST` | `/api/workspaces` | List / create workspaces |
| `GET/PUT/DELETE` | `/api/workspaces/:id` | Read / update / delete a workspace |
| `GET/POST` | `/api/environments` | List / create environments |
| `GET/PUT/DELETE` | `/api/environments/:id` | Read / update / delete an environment |
| `POST` | `/api/import/curl` | Parse a curl string → request object |
| `POST` | `/api/export/curl` | Convert a request object → curl string |
| `POST` | `/api/import/postman` | Import a Postman collection → workspace |
| `GET` | `/api/history` | Get today's request history (`?date=YYYY-MM-DD` for other days) |

---

## Project structure

```
wren/
├── main.go                  # HTTP server, API routes
├── go.mod
├── internal/
│   ├── models/models.go     # shared data types
│   ├── uid/uid.go           # ID generation
│   ├── storage/storage.go   # read/write ~/.apiclient/
│   ├── proxy/proxy.go       # outbound HTTP executor + env var substitution
│   ├── curl/curl.go         # cURL parser + exporter
│   └── postman/postman.go   # Postman collection importer
└── frontend/
    ├── index.html
    ├── app.js               # vanilla JS, no framework
    └── style.css
```

---

## Tech

- **Backend:** Go 1.22+, stdlib only (no third-party dependencies)
- **Frontend:** Vanilla JS, no build step, no npm
- **Binary size:** ~9 MB (frontend embedded via `//go:embed`)
- **RAM at runtime:** ~15–25 MB

---

## License

MIT
