# SimpleMCP

基于 **Go + Wails v2 + React 19 + MUI 7** 的轻量桌面版 MCP Inspector。

通过 STDIO、SSE 或 Streamable HTTP 连接任意 MCP Server，以类 Postman 的三栏布局调试工具、资源、提示词与通知。

## 截图

![simplemcp-1](https://gh-assets.cdn.1994.link/SimpleMCP/SimpleMCP-1.png)

## 功能

- **传输协议** — STDIO（command/args/env/cwd）、SSE、Streamable HTTP（URL + JSON Headers）。
- **连接体验** — Ping、服务端信息与能力探测、按传输类型净化的预设（连接时禁用切换）、连接后自动拉取、断开后自动清空。
- **动态标签** — 当服务端无对应能力或列表为空时，Tools/Resources/Prompts 标签自动隐藏。
- **历史与通知** — 最多 300 条请求历史与实时服务端通知推送。
- **外观** — 浅色/深色主题与中英双语持久化到 `~/.config/simplemcp/config.json`（权限 0600）。

## 配置

用户配置保存在 `~/.config/simplemcp/config.json`，以后端文件为准，`localStorage` 仅作浏览器预览降级。

## 开发

```bash
wails dev      # 热重载
go test ./...  # 后端测试
npm --prefix frontend run build  # 类型检查 + Vite 构建
```

## 构建

```bash
wails build    # -> build/bin/SimpleMCP.app（macOS）
```

---

English version: [README.md](README.md)
