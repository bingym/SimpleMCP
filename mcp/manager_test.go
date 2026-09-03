package mcp

import (
	"context"
	"testing"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

// TestDisconnectedBehavior ensures methods fail cleanly without a connection.
func TestDisconnectedBehavior(t *testing.T) {
	mgr := NewManager()
	if st := mgr.Status(); st.Connected {
		t.Fatal("expected disconnected status")
	}
	if _, err := mgr.CallTool("x", "{}"); err == nil {
		t.Fatal("expected error calling tool while disconnected")
	}
	if _, err := mgr.ReadResource(""); err == nil {
		t.Fatal("expected error reading empty URI")
	}
	if _, err := mgr.GetPrompt("", "{}"); err == nil {
		t.Fatal("expected error getting empty prompt")
	}
	if _, err := mgr.Ping(); err == nil {
		t.Fatal("expected error pinging while disconnected")
	}
	if h := mgr.History(); len(h) != 0 {
		t.Fatalf("expected empty history, got %d", len(h))
	}
	mgr.ClearHistory() // must not panic
	if err := mgr.Disconnect(); err != nil {
		t.Fatalf("disconnect while idle should be nil, got %v", err)
	}
}

// TestStdioRoundTrip spins up a real MCP stdio server as a subprocess
// (via `go run`) and exercises the full inspector flow through Manager.
func TestStdioRoundTrip(t *testing.T) {
	if testing.Short() {
		t.Skip("skip subprocess round trip in short mode")
	}
	mgr := NewManager()
	st, err := mgr.ConnectStdio(StdioConfig{
		Command: "go",
		Args:    []string{"run", "./testdata/mcpserver"},
		Env:     []string{},
	})
	if err != nil {
		t.Fatalf("connect stdio: %v", err)
	}
	if !st.Connected || st.Transport != TransportStdio {
		t.Fatalf("unexpected status: %+v", st)
	}
	defer mgr.Disconnect()

	tools, err := mgr.ListTools()
	if err != nil {
		t.Fatalf("list tools: %v", err)
	}
	t.Logf("tools: %v", tools)

	res, err := mgr.CallTool("echo", `{"text":"hello"}`)
	if err != nil {
		t.Fatalf("call tool: %v", err)
	}
	t.Logf("call result: %v", res)

	if _, err := mgr.Ping(); err != nil {
		t.Fatalf("ping: %v", err)
	}
	if h := mgr.History(); len(h) < 3 {
		t.Fatalf("expected >=3 history entries, got %d", len(h))
	}
}

// The testdata server below is only used when built as a standalone binary;
// keep a compile-time reference so refactors stay in sync.
var (
	_ = mcp.NewTool
	_ = server.NewMCPServer
	_ = context.Background
	_ = time.Second
)
