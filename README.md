# SimpleMCP

SimpleMCP is a desktop MCP inspector for connecting to, exploring, and debugging Model Context Protocol servers.

It combines a Go backend, Wails desktop shell, and a React/MUI interface. The app is designed for the repeated workflow of selecting a server configuration, connecting, inspecting capabilities, invoking operations, and reviewing activity.

[中文文档](README-zh.md)

## What It Does

- Connects to MCP servers over **STDIO**, **SSE**, and **Streamable HTTP**.
- Stores reusable server configurations as named presets.
- Shows server identity, protocol version, instructions, and negotiated capabilities after connection.
- Lists and invokes **Tools** with schema-driven argument forms.
- Lists and reads **Resources** and **Resource Templates**.
- Lists and renders **Prompts** with argument inputs.
- Keeps request history and receives live server notifications.
- Supports light/dark themes and Chinese/English UI.

## Interface

The application is organized into two working areas:

- **Connection workspace** — transport fields, connection actions, current draft state, and the complete preset list. Presets can be loaded, connected, edited, renamed, deleted, or saved as new configurations.
- **Workspace / Activity** — the Workspace contains Tools, Resources, and Prompts. Activity contains request History and live Notifications.

Tools, Resources, and Prompts are hidden only when their list request clearly reports that the method is unsupported, such as HTTP 404 or JSON-RPC `-32601`. A successful empty list keeps the corresponding page visible.

![SimpleMCP interface](https://gh-assets.cdn.1994.link/SimpleMCP/SimpleMCP-1.png)

## Presets

Presets are persisted by the Go configuration store and are separate from the editable connection draft.

- A draft can be connected without being saved.
- When a draft differs from its active preset, the UI marks it as modified.
- You can update the active preset, discard changes, or save the draft as a new preset.
- Presets are sanitized when saved: STDIO entries keep command fields, while HTTP entries keep URL and headers.
- Switching, editing, or deleting presets requires a disconnected session.

## Configuration

The default configuration file is:

```text
~/.config/simplemcp/config.json
```

It stores theme, locale, and presets. The file is the source of truth and is written with restrictive permissions (`0600`). Browser `localStorage` is used only as a preview fallback when the Wails backend is unavailable.

## Requirements

For development, install:

- Go (version declared by `go.mod`)
- Node.js and npm
- Wails CLI v2

## Development

Install frontend dependencies and start the Wails development app:

```bash
npm --prefix frontend install
wails dev
```

Run the focused verification commands from the repository root:

```bash
go test ./...
npm --prefix frontend run build
```

The frontend build performs TypeScript checking and a Vite production build.

## Production Build

```bash
wails build
```

The generated application is written under `build/bin/` according to the active Wails target.

## Project Layout

```text
.
├── app.go                 # Wails bindings and application lifecycle
├── config/                # persisted settings and preset storage
├── mcp/                   # MCP transports, operations, and history
├── frontend/src/          # React application and MUI components
├── frontend/src/api/      # typed frontend wrapper around Wails bindings
├── frontend/wailsjs/      # generated Wails bindings
└── build/                 # application assets and platform build files
```

## Contributing

Keep changes scoped and testable. Frontend-facing text belongs in `frontend/src/i18n.ts`; generated Wails files should not be edited by hand. Read [AGENTS.md](AGENTS.md) before changing the project. It documents architecture boundaries, verification expectations, security constraints, and the cases where the guide must be updated together with a code change.

## License

No license file is currently included in this repository. Add an explicit license before distributing the project as an open-source package.
