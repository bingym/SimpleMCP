package main

import (
	"context"

	"simplemcp/config"
	"simplemcp/mcp"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App is the Wails binding layer. All methods are exposed to the frontend.
type App struct {
	ctx context.Context
	mgr *mcp.Manager
	cfg *config.Store
}

// NewApp creates a new App application struct
func NewApp() *App {
	store, err := config.NewStore()
	if err != nil {
		println("Warning: config store unavailable, using memory only:", err.Error())
		store = config.NewMemoryStore()
	}
	return &App{mgr: mcp.NewManager(), cfg: store}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.mgr.SetEventHandler(func(name string, payload any) {
		runtime.EventsEmit(ctx, name, payload)
	})
}

// shutdown is called when the app is closing.
func (a *App) shutdown(ctx context.Context) {
	_ = a.mgr.Disconnect()
}

// --- connection ---

func (a *App) ConnectStdio(cfg mcp.StdioConfig) (mcp.ConnectionStatus, error) {
	return a.mgr.ConnectStdio(cfg)
}

func (a *App) ConnectSSE(cfg mcp.HTTPConfig) (mcp.ConnectionStatus, error) {
	return a.mgr.ConnectSSE(cfg)
}

func (a *App) ConnectStreamable(cfg mcp.HTTPConfig) (mcp.ConnectionStatus, error) {
	return a.mgr.ConnectStreamable(cfg)
}

func (a *App) Disconnect() error {
	return a.mgr.Disconnect()
}

func (a *App) GetStatus() mcp.ConnectionStatus {
	return a.mgr.Status()
}

// --- MCP operations ---

func (a *App) Ping() (string, error) {
	return a.mgr.Ping()
}

func (a *App) ListTools() (any, error) {
	return a.mgr.ListTools()
}

func (a *App) CallTool(name string, argsJSON string) (any, error) {
	return a.mgr.CallTool(name, argsJSON)
}

func (a *App) ListResources() (any, error) {
	return a.mgr.ListResources()
}

func (a *App) ListResourceTemplates() (any, error) {
	return a.mgr.ListResourceTemplates()
}

func (a *App) ReadResource(uri string) (any, error) {
	return a.mgr.ReadResource(uri)
}

func (a *App) ListPrompts() (any, error) {
	return a.mgr.ListPrompts()
}

func (a *App) GetPrompt(name string, argsJSON string) (any, error) {
	return a.mgr.GetPrompt(name, argsJSON)
}

// --- history ---

func (a *App) GetHistory() []mcp.HistoryEntry {
	return a.mgr.History()
}

func (a *App) ClearHistory() {
	a.mgr.ClearHistory()
}

// --- user config (persisted to ~/.config/simplemcp/config.json) ---

func (a *App) GetConfig() config.AppConfig {
	return a.cfg.Get()
}

// ConfigExists reports whether the config file exists yet.
// The frontend uses it to seed the file from its localStorage cache
// on first launch after migrating to file-based config.
func (a *App) ConfigExists() bool {
	return a.cfg.Exists()
}

func (a *App) SetTheme(theme string) (config.AppConfig, error) {
	return a.cfg.SetTheme(theme)
}

func (a *App) SetLocale(locale string) (config.AppConfig, error) {
	return a.cfg.SetLocale(locale)
}

func (a *App) SavePresets(presets []config.Preset) (config.AppConfig, error) {
	return a.cfg.SetPresets(presets)
}
