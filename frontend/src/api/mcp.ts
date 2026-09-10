// Typed wrapper around the Wails-generated bindings.
// Importing from wailsjs keeps full type safety; run `wails generate module`
// (or `wails dev`/`wails build`) after changing the Go API.
import {
  CallTool,
  ClearHistory,
  ConfigExists,
  ConnectSSE,
  ConnectStdio,
  ConnectStreamable,
  Disconnect,
  GetConfig,
  GetHistory,
  GetPrompt,
  GetStatus,
  ListPrompts,
  ListResourceTemplates,
  ListResources,
  ListTools,
  Ping,
  ReadResource,
  SavePresets,
  SetLocale,
  SetTheme,
} from "../../wailsjs/go/main/App";
import type { config, mcp } from "../../wailsjs/go/models";

export type ConnectionStatus = mcp.ConnectionStatus;
export type HistoryEntry = mcp.HistoryEntry;
export type StdioConfig = mcp.StdioConfig;
export type HTTPConfig = mcp.HTTPConfig;
export type AppConfig = config.AppConfig;
export type Preset = config.Preset;

/** Returns true only for errors that mean the MCP capability is unavailable. */
export function isCapabilityUnavailableError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String((error as any)?.message ?? error ?? "");
  return /\b404\b|method\s+not\s+found|unknown\s+method|method\s+not\s+supported|not\s+supported|-32601/i.test(msg);
}

export interface Tool {
  name: string;
  description?: string;
  inputSchema?: any;
  [k: string]: any;
}

export interface Resource {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
  [k: string]: any;
}

export interface Prompt {
  name: string;
  description?: string;
  arguments?: { name: string; description?: string; required?: boolean }[];
  [k: string]: any;
}

function listOf<T>(res: any, key: string): T[] {
  if (!res) return [];
  const v = res[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

export const mcpApi = {
  connectStdio: (cfg: StdioConfig) => ConnectStdio(cfg),
  connectSSE: (cfg: HTTPConfig) => ConnectSSE(cfg),
  connectStreamable: (cfg: HTTPConfig) => ConnectStreamable(cfg),
  disconnect: () => Disconnect(),
  status: () => GetStatus(),
  ping: () => Ping(),

  listTools: async (): Promise<Tool[]> => listOf<Tool>(await ListTools(), "tools"),
  callTool: (name: string, argsJSON: string) => CallTool(name, argsJSON),

  listResources: async (): Promise<Resource[]> =>
    listOf<Resource>(await ListResources(), "resources"),
  listResourceTemplates: async (): Promise<any[]> =>
    listOf<any>(await ListResourceTemplates(), "resourceTemplates"),
  readResource: (uri: string) => ReadResource(uri),

  listPrompts: async (): Promise<Prompt[]> =>
    listOf<Prompt>(await ListPrompts(), "prompts"),
  getPrompt: (name: string, argsJSON: string) => GetPrompt(name, argsJSON),

  history: () => GetHistory(),
  clearHistory: () => ClearHistory(),

  getConfig: () => GetConfig(),
  configExists: () => ConfigExists(),
  setTheme: (theme: string) => SetTheme(theme),
  setLocale: (locale: string) => SetLocale(locale),
  savePresets: (presets: Preset[]) => SavePresets(presets),
};

export function pretty(v: any): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

/** Build a default `{}` / filled argument object from a JSON-Schema inputSchema. */
export function defaultArgsFromSchema(schema: any): string {
  try {
    if (!schema || typeof schema !== "object") return "{}";
    const props = schema.properties ?? {};
    const out: Record<string, any> = {};
    for (const [k, prop] of Object.entries<any>(props)) {
      if (prop?.default !== undefined) out[k] = prop.default;
      else if (prop?.type === "string") out[k] = "";
      else if (prop?.type === "number" || prop?.type === "integer") out[k] = 0;
      else if (prop?.type === "boolean") out[k] = false;
      else if (prop?.type === "array") out[k] = [];
      else if (prop?.type === "object") out[k] = {};
      else out[k] = "";
    }
    return JSON.stringify(out, null, 2);
  } catch {
    return "{}";
  }
}
