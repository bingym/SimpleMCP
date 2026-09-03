// Package main implements a minimal MCP stdio server used by Go tests.
package main

import (
	"context"
	"fmt"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func main() {
	s := server.NewMCPServer("test-server", "0.0.1")

	echo := mcp.NewTool("echo",
		mcp.WithDescription("Echo back the input text"),
		mcp.WithString("text", mcp.Required(), mcp.Description("Text to echo")),
	)
	s.AddTool(echo, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		text := req.GetString("text", "")
		return mcp.NewToolResultText(fmt.Sprintf("echo: %s", text)), nil
	})

	s.AddResource(mcp.NewResource("test://hello", "hello",
		mcp.WithResourceDescription("A test resource"),
		mcp.WithMIMEType("text/plain"),
	), func(ctx context.Context, req mcp.ReadResourceRequest) ([]mcp.ResourceContents, error) {
		return []mcp.ResourceContents{
			mcp.TextResourceContents{URI: "test://hello", MIMEType: "text/plain", Text: "hello resource"},
		}, nil
	})

	s.AddPrompt(mcp.NewPrompt("greet",
		mcp.WithPromptDescription("Greet someone"),
		mcp.WithArgument("name", mcp.ArgumentDescription("Name to greet"), mcp.RequiredArgument()),
	), func(ctx context.Context, req mcp.GetPromptRequest) (*mcp.GetPromptResult, error) {
		name := req.Params.Arguments["name"]
		return &mcp.GetPromptResult{
			Description: "greeting",
			Messages: []mcp.PromptMessage{
				{Role: mcp.RoleUser, Content: mcp.TextContent{Type: "text", Text: "Hello, " + name + "!"}},
			},
		}, nil
	})

	if err := server.ServeStdio(s); err != nil {
		fmt.Printf("server error: %v\n", err)
	}
}
