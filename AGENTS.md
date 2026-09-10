# SimpleMCP Agent Guide

This file is the working agreement for AI agents and maintainers in this repository. Read it before making changes. Keep it current when the repository's architecture, commands, behavior, or UI conventions change.

## Project Shape

- `app.go`, `main.go`: Wails application lifecycle and frontend bindings.
- `mcp/`: MCP transport and client behavior. Keep protocol and connection concerns here.
- `config/`: persisted application configuration and preset storage.
- `frontend/src/`: React + MUI application UI.
- `frontend/src/components/`: feature-level UI components. Keep API calls behind `frontend/src/api/mcp.ts`.
- `frontend/wailsjs/`: generated Wails bindings. Do not hand-edit generated files.

## Development Commands

Run from the repository root unless noted:

```bash
go test ./...
npm --prefix frontend run build
wails dev
wails build
```

Use `npm --prefix frontend run build` after frontend changes. Use `go test ./...` after Go, MCP, or config changes. A change is not complete until the relevant checks pass, or the final response clearly states what could not run and why.

## Frontend Architecture

- The application has two top-level content areas: `Workspace` for Tools, Resources, and Prompts; `Activity` for History and Notifications.
- The left connection workspace owns transport configuration, current draft state, connection actions, and preset management.
- A preset is persisted configuration. The form is a draft and may be dirty relative to its active preset. Keep those states visibly distinct.
- Prefer direct, scan-friendly controls for frequent actions. Use dialogs for complete preset management, destructive confirmation, and multi-field editing.
- Use MUI components and `@mui/icons-material`; do not add custom SVG icons when an existing icon is appropriate.
- Keep UI text in `frontend/src/i18n.ts` for both Chinese and English. Do not introduce untranslated user-facing strings.
- Preserve responsive behavior: desktop uses a persistent connection workspace; narrow windows use the drawer.
- Workspace capability pages must hide only when the corresponding list request fails with an unsupported-capability signal (`404`, JSON-RPC `-32601`, method-not-found, or equivalent). A successful empty list means the capability exists and must not hide the page.
- Preset previews may use a bounded scroll region for density, but must render every persisted preset; do not silently truncate the data set with a fixed-count slice.

## Data and API Rules

- Treat Go configuration storage as the source of truth. `localStorage` is only a browser-preview cache/fallback.
- Keep transport-specific fields sanitized when persisting presets: STDIO does not persist HTTP fields, and HTTP transports do not persist STDIO fields.
- Do not change Wails binding signatures casually. If a Go binding changes, regenerate bindings with Wails and update the typed wrapper.
- Do not expose secrets in logs, notifications, screenshots, or error messages.

## Change Discipline

- Read surrounding code before editing. Preserve unrelated user changes in a dirty worktree.
- Keep changes scoped to the requested behavior; avoid drive-by refactors and dependency churn.
- Use `apply_patch` for manual edits. Do not hand-edit generated Wails output.
- Add or update focused tests when changing backend behavior, persistence, parsing, or state transitions.
- When a UI change affects navigation, presets, connection state, or localization, verify both language paths conceptually and run the frontend build.

## Keeping This Guide Current

The AI agent must proactively update this file whenever a change introduces or removes any of the following:

- a new top-level page, navigation area, component ownership boundary, or state model;
- a new backend binding, transport, persistence rule, or development/build command;
- a new required verification step, test convention, or security constraint;
- a changed interaction rule for connections, presets, responsive layout, or localization.

The update should be part of the same change, remain concise, and describe the new invariant or workflow rather than narrating an implementation detail. If no update is needed, the agent should still check this file before finishing.
