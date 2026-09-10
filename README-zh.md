# SimpleMCP

SimpleMCP 是一个桌面版 MCP Inspector，用于连接、探索和调试 Model Context Protocol Server。

项目使用 Go 负责后端与 MCP 通信，Wails 提供桌面容器，React + MUI 构建界面。它围绕一条高频工作流设计：选择服务配置、建立连接、检查能力、调用操作并查看活动记录。

[English documentation](README.md)

## 功能概览

- 支持 **STDIO**、**SSE**、**Streamable HTTP** 三种连接方式。
- 将常用服务配置保存为命名预设。
- 连接后显示服务端名称、版本、协议版本、说明和协商出的能力。
- 通过基于 Schema 的表单查看并调用 **Tools**。
- 查看和读取 **Resources** 与 **Resource Templates**。
- 查看并获取 **Prompts**，支持填写参数。
- 保存请求历史，实时接收服务端通知。
- 支持浅色/深色主题和中英文界面。

## 界面结构

应用分为两个工作区域：

- **连接工作区**：包含传输配置、连接操作、当前草稿状态和完整的预设列表。预设支持载入、连接、编辑、重命名、删除以及另存为新配置。
- **Workspace / Activity**：Workspace 放置 Tools、Resources、Prompts；Activity 放置请求历史和实时通知。

只有在列表请求明确返回“不支持该方法”时，Tools、Resources、Prompts 页面才会隐藏，例如 HTTP 404 或 JSON-RPC `-32601`。如果请求成功但列表为空，对应页面仍会保留。

![SimpleMCP 界面](https://gh-assets.cdn.1994.link/SimpleMCP/SimpleMCP-1.png)

## 预设管理

预设由 Go 配置存储持久化，并与可编辑的连接草稿分开管理。

- 未保存的临时草稿也可以直接连接。
- 草稿与当前预设不一致时，界面会标记为“已修改”。
- 可以更新当前预设、放弃修改，或将草稿另存为新预设。
- 保存时会按传输类型清理字段：STDIO 保留 command 相关字段，HTTP 保留 URL 和 Headers。
- 切换、编辑或删除预设前，需要先断开当前连接。

## 配置文件

默认配置文件路径：

```text
~/.config/simplemcp/config.json
```

文件保存主题、语言和预设。配置文件是唯一真实来源，并使用受限权限（`0600`）写入。Wails 后端不可用时，浏览器 `localStorage` 只作为预览环境的降级缓存。

## 开发环境

开发需要安装：

- Go（版本以 `go.mod` 为准）
- Node.js 和 npm
- Wails CLI v2

## 开发

安装前端依赖并启动 Wails 开发应用：

```bash
npm --prefix frontend install
wails dev
```

在仓库根目录执行验证：

```bash
go test ./...
npm --prefix frontend run build
```

前端构建会同时执行 TypeScript 类型检查和 Vite 生产构建。

## 生产构建

```bash
wails build
```

生成的应用会根据当前 Wails 目标写入 `build/bin/`。

## 项目结构

```text
.
├── app.go                 # Wails 绑定和应用生命周期
├── config/                # 设置与预设持久化
├── mcp/                   # MCP 传输、操作和历史记录
├── frontend/src/          # React 应用和 MUI 组件
├── frontend/src/api/      # Wails API 的类型安全前端封装
├── frontend/wailsjs/      # Wails 自动生成的绑定
└── build/                 # 应用资源和平台构建文件
```

## 贡献

请保持改动范围清晰并可验证。面向用户的文案统一放在 `frontend/src/i18n.ts`；不要手动编辑 Wails 自动生成的文件。修改项目之前请先阅读 [AGENTS.md](AGENTS.md)，其中记录了架构边界、验证要求、安全约束，以及哪些代码变化必须同步更新项目指南。

## 许可证

当前仓库尚未包含许可证文件。如果要以开源项目形式发布，请先补充明确的开源许可证。
