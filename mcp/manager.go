package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/mark3labs/mcp-go/client"
	"github.com/mark3labs/mcp-go/client/transport"
	"github.com/mark3labs/mcp-go/mcp"
)

// Transport types supported by the inspector.
const (
	TransportStdio      = "stdio"
	TransportSSE        = "sse"
	TransportStreamable = "streamable"
)

// StdioConfig describes how to spawn a local MCP server.
type StdioConfig struct {
	Command string   `json:"command"`
	Args    []string `json:"args"`
	Env     []string `json:"env"`
	Cwd     string   `json:"cwd"`
}

// HTTPConfig describes how to reach a remote MCP server.
type HTTPConfig struct {
	URL        string            `json:"url"`
	Headers    map[string]string `json:"headers"`
	TimeoutSec int               `json:"timeoutSec"`
}

// ServerCapabilities exposes which MCP features the server supports.
type ServerCapabilities struct {
	Tools     bool `json:"tools"`
	Resources bool `json:"resources"`
	Prompts   bool `json:"prompts"`
	Logging   bool `json:"logging"`
}

// ServerInfo is a JSON-friendly summary of the initialize result.
type ServerInfo struct {
	Name            string              `json:"name"`
	Version         string              `json:"version"`
	ProtocolVersion string              `json:"protocolVersion"`
	Instructions    string              `json:"instructions,omitempty"`
	Capabilities    *ServerCapabilities `json:"capabilities,omitempty"`
}

// ConnectionStatus is returned to the frontend.
type ConnectionStatus struct {
	Connected bool       `json:"connected"`
	Transport string     `json:"transport,omitempty"`
	Server    *ServerInfo `json:"server,omitempty"`
	URL       string     `json:"url,omitempty"`
	Command   string     `json:"command,omitempty"`
}

// HistoryEntry records one JSON-RPC round trip for the inspector log.
type HistoryEntry struct {
	ID         string `json:"id"`
	Time       string `json:"time"`
	Method     string `json:"method"`
	Request    any    `json:"request,omitempty"`
	Response   any    `json:"response,omitempty"`
	Error      string `json:"error,omitempty"`
	DurationMs int64  `json:"durationMs"`
}

// OnEvent is used to push async server notifications to the UI layer
// (Wails runtime events). Nil means no push.
type OnEvent func(name string, payload any)

// Manager owns a single live MCP client connection.
type Manager struct {
	mu        sync.Mutex
	client    *client.Client
	cancel    context.CancelFunc
	transport string
	url       string
	command   string
	server    *ServerInfo
	history   []HistoryEntry
	onEvent   OnEvent
}

func NewManager() *Manager {
	return &Manager{history: make([]HistoryEntry, 0, 128)}
}

func (m *Manager) SetEventHandler(fn OnEvent) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onEvent = fn
}

func (m *Manager) emit(name string, payload any) {
	m.mu.Lock()
	fn := m.onEvent
	m.mu.Unlock()
	if fn != nil {
		fn(name, payload)
	}
}

func (m *Manager) record(method string, req, resp any, rpcErr error, dur time.Duration) HistoryEntry {
	e := HistoryEntry{
		ID:         uuid.NewString()[:8],
		Time:       time.Now().Format("15:04:05.000"),
		Method:     method,
		Request:    req,
		Response:   resp,
		DurationMs: dur.Milliseconds(),
	}
	if rpcErr != nil {
		e.Error = rpcErr.Error()
	}
	m.mu.Lock()
	m.history = append(m.history, e)
	if len(m.history) > 300 {
		m.history = m.history[len(m.history)-300:]
	}
	m.mu.Unlock()
	m.emit("mcp:history", e)
	return e
}

// Status returns the current connection state.
func (m *Manager) Status() ConnectionStatus {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.client == nil {
		return ConnectionStatus{Connected: false}
	}
	return ConnectionStatus{
		Connected: true,
		Transport: m.transport,
		Server:    m.server,
		URL:       m.url,
		Command:   m.command,
	}
}

// History returns a copy of the recorded entries (oldest first).
func (m *Manager) History() []HistoryEntry {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]HistoryEntry, len(m.history))
	copy(out, m.history)
	return out
}

func (m *Manager) ClearHistory() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.history = make([]HistoryEntry, 0, 128)
}

// Disconnect closes the current connection, if any.
func (m *Manager) Disconnect() error {
	m.mu.Lock()
	c := m.client
	cancel := m.cancel
	m.client = nil
	m.cancel = nil
	m.transport = ""
	m.url = ""
	m.command = ""
	m.server = nil
	m.mu.Unlock()

	if cancel != nil {
		cancel()
	}
	if c != nil {
		return c.Close()
	}
	return nil
}

func (m *Manager) activeClient() (*client.Client, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.client == nil {
		return nil, fmt.Errorf("not connected to any MCP server")
	}
	return m.client, nil
}

func (m *Manager) timeout(base int) time.Duration {
	if base <= 0 {
		return 60 * time.Second
	}
	return time.Duration(base) * time.Second
}

func initialize(ctx context.Context, c *client.Client) (*ServerInfo, error) {
	req := mcp.InitializeRequest{}
	req.Params.ProtocolVersion = mcp.LATEST_PROTOCOL_VERSION
	req.Params.ClientInfo = mcp.Implementation{Name: "SimpleMCP Inspector", Version: "0.1.0"}
	req.Params.Capabilities = mcp.ClientCapabilities{}
	res, err := c.Initialize(ctx, req)
	if err != nil {
		return nil, err
	}
	caps := &ServerCapabilities{}
	if res.Capabilities.Tools != nil {
		caps.Tools = true
	}
	if res.Capabilities.Resources != nil {
		caps.Resources = true
	}
	if res.Capabilities.Prompts != nil {
		caps.Prompts = true
	}
	if res.Capabilities.Logging != nil {
		caps.Logging = true
	}
	info := &ServerInfo{
		Name:            res.ServerInfo.Name,
		Version:         res.ServerInfo.Version,
		ProtocolVersion: res.ProtocolVersion,
		Instructions:    res.Instructions,
		Capabilities:    caps,
	}
	return info, nil
}

func (m *Manager) attachNotificationHandler(c *client.Client) {
	c.OnNotification(func(n mcp.JSONRPCNotification) {
		m.emit("mcp:notification", toMap(n))
		m.record("notification/"+n.Method, toMap(n.Params), toMap(n), nil, 0)
	})
}

// ConnectStdio spawns a local server process and initializes it.
func (m *Manager) ConnectStdio(cfg StdioConfig) (ConnectionStatus, error) {
	if cfg.Command == "" {
		return ConnectionStatus{}, fmt.Errorf("command is required for stdio transport")
	}
	_ = m.Disconnect()

	cwd := cfg.Cwd
	var c *client.Client
	var err error
	if cwd != "" {
		c, err = client.NewStdioMCPClientWithOptions(
			cfg.Command, cfg.Env, cfg.Args,
			transport.WithCommandFunc(func(ctx context.Context, command string, env []string, args []string) (*exec.Cmd, error) {
				cmd := exec.CommandContext(ctx, command, args...)
				cmd.Env = append([]string{}, env...)
				cmd.Dir = cwd
				return cmd, nil
			}),
		)
	} else {
		c, err = client.NewStdioMCPClient(cfg.Command, cfg.Env, cfg.Args...)
	}
	if err != nil {
		return ConnectionStatus{}, err
	}

	ctx, cancel := context.WithCancel(context.Background())
	// NOTE: NewStdioMCPClient auto-starts the transport on creation,
	// so we must NOT call Start again here.
	_ = ctx
	m.attachNotificationHandler(c)

	initCtx, initCancel := context.WithTimeout(ctx, 30*time.Second)
	info, err := initialize(initCtx, c)
	initCancel()
	if err != nil {
		cancel()
		_ = c.Close()
		return ConnectionStatus{}, fmt.Errorf("initialize: %w", err)
	}

	m.mu.Lock()
	m.client = c
	m.cancel = cancel
	m.transport = TransportStdio
	m.command = cfg.Command + " " + joinArgs(cfg.Args)
	m.server = info
	m.mu.Unlock()

	st := m.Status()
	m.emit("mcp:status", toMap(st))
	return st, nil
}

// ConnectSSE connects to a remote SSE MCP server.
func (m *Manager) ConnectSSE(cfg HTTPConfig) (ConnectionStatus, error) {
	if cfg.URL == "" {
		return ConnectionStatus{}, fmt.Errorf("url is required for SSE transport")
	}
	_ = m.Disconnect()

	c, err := client.NewSSEMCPClient(cfg.URL, transport.WithHeaders(cfg.Headers))
	if err != nil {
		return ConnectionStatus{}, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	if err := c.Start(ctx); err != nil {
		cancel()
		_ = c.Close()
		return ConnectionStatus{}, fmt.Errorf("start SSE client: %w", err)
	}
	m.attachNotificationHandler(c)

	initCtx, initCancel := context.WithTimeout(ctx, m.timeout(cfg.TimeoutSec))
	info, err := initialize(initCtx, c)
	initCancel()
	if err != nil {
		cancel()
		_ = c.Close()
		return ConnectionStatus{}, fmt.Errorf("initialize: %w", err)
	}

	m.mu.Lock()
	m.client = c
	m.cancel = cancel
	m.transport = TransportSSE
	m.url = cfg.URL
	m.server = info
	m.mu.Unlock()

	st := m.Status()
	m.emit("mcp:status", toMap(st))
	return st, nil
}

// ConnectStreamable connects to a Streamable HTTP MCP server.
func (m *Manager) ConnectStreamable(cfg HTTPConfig) (ConnectionStatus, error) {
	if cfg.URL == "" {
		return ConnectionStatus{}, fmt.Errorf("url is required for streamable HTTP transport")
	}
	_ = m.Disconnect()

	c, err := client.NewStreamableHttpClient(cfg.URL, transport.WithHTTPHeaders(cfg.Headers))
	if err != nil {
		return ConnectionStatus{}, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	if err := c.Start(ctx); err != nil {
		cancel()
		_ = c.Close()
		return ConnectionStatus{}, fmt.Errorf("start streamable client: %w", err)
	}
	m.attachNotificationHandler(c)

	initCtx, initCancel := context.WithTimeout(ctx, m.timeout(cfg.TimeoutSec))
	info, err := initialize(initCtx, c)
	initCancel()
	if err != nil {
		cancel()
		_ = c.Close()
		return ConnectionStatus{}, fmt.Errorf("initialize: %w", err)
	}

	m.mu.Lock()
	m.client = c
	m.cancel = cancel
	m.transport = TransportStreamable
	m.url = cfg.URL
	m.server = info
	m.mu.Unlock()

	st := m.Status()
	m.emit("mcp:status", toMap(st))
	return st, nil
}

// ---- MCP operations, each recorded into history ----

func (m *Manager) Ping() (string, error) {
	c, err := m.activeClient()
	if err != nil {
		return "", err
	}
	start := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	rpcErr := c.Ping(ctx)
	m.record("ping", nil, map[string]any{"ok": rpcErr == nil}, rpcErr, time.Since(start))
	if rpcErr != nil {
		return "", rpcErr
	}
	return "pong", nil
}

func (m *Manager) ListTools() (any, error) {
	c, err := m.activeClient()
	if err != nil {
		return nil, err
	}
	start := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	res, rpcErr := c.ListTools(ctx, mcp.ListToolsRequest{})
	m.record("tools/list", nil, toMap(res), rpcErr, time.Since(start))
	if rpcErr != nil {
		return nil, rpcErr
	}
	return toMap(res), nil
}

// CallTool invokes a tool. argsJSON must be a JSON object string (may be empty).
func (m *Manager) CallTool(name string, argsJSON string) (any, error) {
	c, err := m.activeClient()
	if err != nil {
		return nil, err
	}
	if name == "" {
		return nil, fmt.Errorf("tool name is required")
	}
	var args map[string]any
	if argsJSON != "" {
		if uerr := json.Unmarshal([]byte(argsJSON), &args); uerr != nil {
			return nil, fmt.Errorf("invalid JSON arguments: %w", uerr)
		}
	}
	req := mcp.CallToolRequest{}
	req.Params.Name = name
	req.Params.Arguments = args

	start := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()
	res, rpcErr := c.CallTool(ctx, req)
	m.record("tools/call:"+name, map[string]any{"name": name, "arguments": args}, toMap(res), rpcErr, time.Since(start))
	if rpcErr != nil {
		return nil, rpcErr
	}
	return toMap(res), nil
}

func (m *Manager) ListResources() (any, error) {
	c, err := m.activeClient()
	if err != nil {
		return nil, err
	}
	start := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	res, rpcErr := c.ListResources(ctx, mcp.ListResourcesRequest{})
	m.record("resources/list", nil, toMap(res), rpcErr, time.Since(start))
	if rpcErr != nil {
		return nil, rpcErr
	}
	return toMap(res), nil
}

func (m *Manager) ListResourceTemplates() (any, error) {
	c, err := m.activeClient()
	if err != nil {
		return nil, err
	}
	start := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	res, rpcErr := c.ListResourceTemplates(ctx, mcp.ListResourceTemplatesRequest{})
	m.record("resources/templates/list", nil, toMap(res), rpcErr, time.Since(start))
	if rpcErr != nil {
		return nil, rpcErr
	}
	return toMap(res), nil
}

func (m *Manager) ReadResource(uri string) (any, error) {
	c, err := m.activeClient()
	if err != nil {
		return nil, err
	}
	if uri == "" {
		return nil, fmt.Errorf("resource URI is required")
	}
	req := mcp.ReadResourceRequest{}
	req.Params.URI = uri
	start := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	res, rpcErr := c.ReadResource(ctx, req)
	m.record("resources/read:"+uri, map[string]any{"uri": uri}, toMap(res), rpcErr, time.Since(start))
	if rpcErr != nil {
		return nil, rpcErr
	}
	return toMap(res), nil
}

func (m *Manager) ListPrompts() (any, error) {
	c, err := m.activeClient()
	if err != nil {
		return nil, err
	}
	start := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	res, rpcErr := c.ListPrompts(ctx, mcp.ListPromptsRequest{})
	m.record("prompts/list", nil, toMap(res), rpcErr, time.Since(start))
	if rpcErr != nil {
		return nil, rpcErr
	}
	return toMap(res), nil
}

// GetPrompt fetches a prompt. argsJSON must be a JSON object of string->any;
// values are stringified because the protocol expects map[string]string.
func (m *Manager) GetPrompt(name string, argsJSON string) (any, error) {
	c, err := m.activeClient()
	if err != nil {
		return nil, err
	}
	if name == "" {
		return nil, fmt.Errorf("prompt name is required")
	}
	var raw map[string]any
	if argsJSON != "" {
		if uerr := json.Unmarshal([]byte(argsJSON), &raw); uerr != nil {
			return nil, fmt.Errorf("invalid JSON arguments: %w", uerr)
		}
	}
	strArgs := make(map[string]string, len(raw))
	for k, v := range raw {
		switch t := v.(type) {
		case string:
			strArgs[k] = t
		default:
			b, _ := json.Marshal(v)
			strArgs[k] = string(b)
		}
	}
	req := mcp.GetPromptRequest{}
	req.Params.Name = name
	req.Params.Arguments = strArgs
	start := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	res, rpcErr := c.GetPrompt(ctx, req)
	m.record("prompts/get:"+name, map[string]any{"name": name, "arguments": strArgs}, toMap(res), rpcErr, time.Since(start))
	if rpcErr != nil {
		return nil, rpcErr
	}
	return toMap(res), nil
}

// ---- helpers ----

func toMap(v any) any {
	if v == nil {
		return nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return map[string]any{"_marshalError": err.Error()}
	}
	var out any
	if err := json.Unmarshal(b, &out); err != nil {
		return map[string]any{"_unmarshalError": err.Error()}
	}
	return out
}

func joinArgs(args []string) string {
	out := ""
	for i, a := range args {
		if i > 0 {
			out += " "
		}
		out += a
	}
	return out
}


