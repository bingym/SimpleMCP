# SimpleMCP — MCP Inspector 桌面客户端

基于 **Golang + Wails v2 + React + MUI** 的 MCP Server 调试工具，对标官方 `mcp-inspector`。

## 功能

- **三种传输协议**：STDIO（本地子进程，支持 command / args / env / cwd）、SSE、Streamable HTTP（支持自定义 headers）
- **Tools**：列表刷新、inputSchema 预览、JSON 参数编辑（按 schema 自动生成默认值）、一键调用、结果查看
- **Resources**：resources / resourceTemplates 列表、按 URI 读取
- **Prompts**：列表、参数填充、获取渲染结果
- **Ping**、连接状态展示（server 名称 / 版本 / 协议版本）
- **请求历史**：每次调用的方法、耗时、请求/响应 JSON、错误，保存在后端（上限 300 条）
- **Server 通知**：logging / progress 等通知实时推送到「通知」页
- **连接预设**：常用 server 配置存 localStorage，一键切换
- **浅色 / 深色主题**：工具栏一键切换，持久化到配置文件
- **中 / 英双语**：工具栏一键切换，持久化到配置文件（首次启动跟随浏览器语言）

## 配置文件

用户设置（主题、语言、连接预设）存放在：

```
~/.config/simplemcp/config.json   # 目录不存在会自动创建，文件权限 0600
```

说明：Wails macOS 端用自定义 `wails://` scheme 承载前端，WKWebView localStorage
跨启动不可靠，因此以后端文件为唯一真相来源；前端 localStorage 仅保留为
纯浏览器预览（`npm run dev`）时的降级缓存。

## 目录结构

```
.
├── main.go / app.go        # Wails 入口 + 前端绑定层
├── mcp/manager.go          # MCP 连接管理（基于 mark3labs/mcp-go v1.0.0）
├── mcp/manager_test.go     # 单测 + STDIO 端到端测试
├── mcp/testdata/mcpserver/ # 测试用最小 MCP server
└── frontend/src/
    ├── App.tsx             # 主布局（连接抽屉 + 页签）
    ├── api/mcp.ts          # Wails 绑定封装
    └── components/         # ConnectionPanel / ToolsTab / ResourcesTab / PromptsTab / HistoryTab / JsonView
```

## 开发

```bash
wails dev          # 热重载开发模式
go test ./...      # 后端测试（含 STDIO 真机回路）
```

## 构建

```bash
wails build        # 产物：build/bin/SimpleMCP.app（macOS）
```
