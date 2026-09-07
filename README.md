# SimpleMCP

Lightweight desktop MCP Inspector built with **Go + Wails v2 + React 19 + MUI 7**.

Connect to any MCP server over STDIO, SSE or Streamable HTTP and inspect tools, resources, prompts and notifications with a Postman-like layout.

## Screenshots

![simplemcp-1](https://gh-assets.cdn.1994.link/SimpleMCP/SimpleMCP-1.png)

## Features

- **Transports** — STDIO (command/args/env/cwd), SSE and Streamable HTTP (URL + JSON headers).
- **Connection UX** — Ping, server info with capabilities, presets per transport (sanitized on save, disabled while connected), auto-fetch on connect and auto-clear on disconnect.
- **Dynamic tabs** — Tools/Resources/Prompts tabs hide automatically when the server reports no capability or returns an empty list.
- **History & Notifications** — Request history (up to 300 entries) and live server notifications.
- **Appearance** — Light/dark theme and en/zh locale persisted to `~/.config/simplemcp/config.json` (0600).

## Configuration

User settings are stored in `~/.config/simplemcp/config.json`. The file is the source of truth; `localStorage` is only a fallback for browser preview.

## Development

```bash
wails dev      # hot-reload
go test ./...  # backend tests
npm --prefix frontend run build  # type-check + vite build
```

## Build

```bash
wails build    # -> build/bin/SimpleMCP.app (macOS)
```

---

Chinese version: [README-zh.md](README-zh.md)
