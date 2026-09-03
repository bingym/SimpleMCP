import { useEffect, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import { mcpApi, type ConnectionStatus, type Preset } from "../api/mcp";
import { useSettings } from "../settings";

export type TransportKind = "stdio" | "sse" | "streamable";

// localStorage mirror of presets for offline fallback; the source of truth is
// ~/.config/simplemcp/config.json managed by the Go backend.
const LS_KEY = "simplemcp.presets.v1";

function loadCachedPresets(): Preset[] {
  try {
    const v = JSON.parse(localStorage.getItem(LS_KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function cachePresets(p: Preset[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

interface Props {
  status: ConnectionStatus | null;
  onStatus: (s: ConnectionStatus | null) => void;
  onError: (msg: string) => void;
}

export default function ConnectionPanel({ status, onStatus, onError }: Props) {
  const { t } = useSettings();
  const [transport, setTransport] = useState<TransportKind>("stdio");
  const [command, setCommand] = useState("npx");
  const [args, setArgs] = useState("-y @modelcontextprotocol/server-everything");
  const [env, setEnv] = useState("");
  const [cwd, setCwd] = useState("");
  const [url, setUrl] = useState("http://127.0.0.1:8000/mcp");
  const [headers, setHeaders] = useState("{}");
  const [busy, setBusy] = useState(false);
  const [presets, setPresets] = useState<Preset[]>(loadCachedPresets);
  const [presetName, setPresetName] = useState("");

  const connected = !!status?.connected;

  // On startup the config file wins over the cache. If the file does not
  // exist yet, seed it from the cached presets instead.
  useEffect(() => {
    mcpApi
      .configExists()
      .then((exists) => {
        if (!exists) {
          const cached = loadCachedPresets();
          if (cached.length > 0) {
            mcpApi.savePresets(cached).catch(() => {});
          }
          return;
        }
        return mcpApi
          .getConfig()
          .then((cfg) => {
            const list = Array.isArray(cfg.presets) ? cfg.presets : [];
            setPresets(list);
            cachePresets(list);
          })
          .catch(() => {
            /* keep cache */
          });
      })
      .catch(() => {
        /* backend unavailable: keep cache */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function persistPresets(next: Preset[]) {
    setPresets(next);
    cachePresets(next);
    mcpApi.savePresets(next).catch((e: any) => {
      onError(e?.message ?? String(e));
    });
  }

  const parseList = (s: string): string[] =>
    s.split(/\s+/).map((x) => x.trim()).filter(Boolean);

  const parseEnv = (): string[] =>
    env.split("\n").map((x) => x.trim()).filter(Boolean);

  const parseHeaders = (): Record<string, string> => {
    if (!headers.trim()) return {};
    const v = JSON.parse(headers);
    if (typeof v !== "object" || v === null) throw new Error(t("conn.errHeaders"));
    return v;
  };

  async function handleConnect() {
    setBusy(true);
    try {
      let st: ConnectionStatus;
      if (transport === "stdio") {
        st = await mcpApi.connectStdio({
          command: command.trim(),
          args: parseList(args),
          env: parseEnv(),
          cwd: cwd.trim(),
        });
      } else if (transport === "sse") {
        st = await mcpApi.connectSSE({ url: url.trim(), headers: parseHeaders(), timeoutSec: 30 });
      } else {
        st = await mcpApi.connectStreamable({ url: url.trim(), headers: parseHeaders(), timeoutSec: 30 });
      }
      onStatus(st);
    } catch (e: any) {
      onError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    try {
      await mcpApi.disconnect();
      onStatus({ connected: false } as ConnectionStatus);
    } catch (e: any) {
      onError(e?.message ?? String(e));
    }
  }

  function savePreset() {
    const name = presetName.trim() || `${transport}-${new Date().toLocaleTimeString()}`;
    persistPresets([...presets.filter((x) => x.name !== name), { name, transport, command, args, env, cwd, url, headers }]);
    setPresetName("");
  }

  function deletePreset(name: string) {
    persistPresets(presets.filter((x) => x.name !== name));
  }

  function applyPreset(p: Preset) {
    if (connected) {
      onError("Please disconnect first before switching preset");
      return;
    }
    if (p.transport === "stdio" || p.transport === "sse" || p.transport === "streamable") {
      setTransport(p.transport);
    }
    setCommand(p.command);
    setArgs(p.args);
    setEnv(p.env);
    setCwd(p.cwd);
    setUrl(p.url);
    setHeaders(p.headers);
  }

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 800, fontSize: 12 }}>{t("conn.title")}</Typography>
        <Chip
          size="small"
          color={connected ? "success" : "default"}
          label={connected ? t("conn.connected", { t: status?.transport ?? "" }) : t("conn.disconnected")}
          sx={{ height: 20, fontSize: 10, fontWeight: 700 }}
        />
      </Stack>

      {connected && status?.server && (
        <Alert severity="success" sx={{ fontSize: 11, py: 0.5, borderRadius: 1.5 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11 }}>{status.server.name} v{status.server.version}</Typography>
          <Typography variant="caption" sx={{ display: "block", fontSize: 10, color: "text.secondary" }}>
            protocol: {status.server.protocolVersion}
          </Typography>
          {status.server.instructions && <Typography variant="caption" sx={{ fontSize: 10 }}>{status.server.instructions.slice(0, 160)}</Typography>}
        </Alert>
      )}

      <FormControl fullWidth size="small">
        <InputLabel sx={{ fontSize: 12 }}>{t("conn.transport")}</InputLabel>
        <Select
          value={transport}
          label={t("conn.transport")}
          disabled={connected}
          onChange={(e) => setTransport(e.target.value as TransportKind)}
          sx={{ fontSize: 12, height: 36 }}
        >
          <MenuItem value="stdio" sx={{ fontSize: 12 }}>{t("conn.transport.stdio")}</MenuItem>
          <MenuItem value="sse" sx={{ fontSize: 12 }}>{t("conn.transport.sse")}</MenuItem>
          <MenuItem value="streamable" sx={{ fontSize: 12 }}>{t("conn.transport.streamable")}</MenuItem>
        </Select>
      </FormControl>

      {transport === "stdio" ? (
        <Stack spacing={1.25}>
          <TextField label={t("conn.command")} value={command} disabled={connected} onChange={(e) => setCommand(e.target.value)} placeholder="npx / uvx / python / node ..." size="small" />
          <TextField label={t("conn.args")} value={args} disabled={connected} onChange={(e) => setArgs(e.target.value)} multiline minRows={2} size="small" InputProps={{ sx: { fontSize: 12, fontFamily: "monospace" } }} />
          <Accordion variant="outlined" sx={{ borderRadius: 1.5, "&:before": { display: "none" }, bgcolor: "action.hover" }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />} sx={{ minHeight: 32, "& .MuiAccordionSummary-content": { my: 0.5 } }}>
              <Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11 }}>Advanced · Env & Cwd</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 1.25, pt: 0, display: "flex", flexDirection: "column", gap: 1.25, bgcolor: "background.paper", borderRadius: 1.5 }}>
              <TextField label={t("conn.env")} value={env} disabled={connected} onChange={(e) => setEnv(e.target.value)} multiline minRows={2} placeholder={"API_KEY=xxx"} size="small" />
              <TextField label={t("conn.cwd")} value={cwd} disabled={connected} onChange={(e) => setCwd(e.target.value)} placeholder="/path/to/server" size="small" />
            </AccordionDetails>
          </Accordion>
        </Stack>
      ) : (
        <Stack spacing={1.25}>
          <TextField label={t("conn.url")} value={url} disabled={connected} onChange={(e) => setUrl(e.target.value)} placeholder="http://127.0.0.1:8000/mcp" size="small" />
          <Accordion variant="outlined" sx={{ borderRadius: 1.5, "&:before": { display: "none" }, bgcolor: "action.hover" }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />} sx={{ minHeight: 32, "& .MuiAccordionSummary-content": { my: 0.5 } }}>
              <Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11 }}>Headers · JSON</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 1.25, pt: 0, bgcolor: "background.paper", borderRadius: 1.5 }}>
              <TextField label={t("conn.headers")} value={headers} disabled={connected} onChange={(e) => setHeaders(e.target.value)} multiline minRows={3} size="small" InputProps={{ sx: { fontFamily: "monospace", fontSize: 11 } }} />
            </AccordionDetails>
          </Accordion>
        </Stack>
      )}

      <Stack direction="row" spacing={1} sx={{ pt: 0.5 }}>
        {!connected ? (
          <Button variant="contained" startIcon={<PlayArrowIcon fontSize="small" />} onClick={handleConnect} disabled={busy} fullWidth sx={{ textTransform: "none", fontWeight: 700, height: 34, borderRadius: 1.5 }}>
            {busy ? t("conn.connecting") : t("conn.connect")}
          </Button>
        ) : (
          <Button variant="outlined" color="warning" startIcon={<StopIcon fontSize="small" />} onClick={handleDisconnect} fullWidth sx={{ textTransform: "none", fontWeight: 700, height: 34, borderRadius: 1.5 }}>
            {t("conn.disconnect")}
          </Button>
        )}
      </Stack>

      <Divider sx={{ my: 0.5 }} />
      <Accordion variant="outlined" defaultExpanded={false} sx={{ borderRadius: 1.5, "&:before": { display: "none" } }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />} sx={{ minHeight: 32 }}>
          <Typography variant="caption" sx={{ fontWeight: 800, fontSize: 11 }}>{t("conn.presets")} · {presets.length}</Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 1.25, pt: 0, display: "flex", flexDirection: "column", gap: 1 }}>
          <Stack direction="row" spacing={1}>
            <TextField label={t("conn.presetName")} value={presetName} onChange={(e) => setPresetName(e.target.value)} size="small" sx={{ flex: 1 }} />
            <Button variant="outlined" onClick={savePreset} size="small" sx={{ height: 32, textTransform: "none" }}>{t("conn.save")}</Button>
          </Stack>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
            {presets.map((p) => (
              <Tooltip key={p.name} title={connected ? "Disconnect first to switch preset" : "Click to load preset (manual connect required)"}>
                <Chip
                  size="small"
                  label={`${p.name} · ${p.transport}`}
                  onClick={() => applyPreset(p)}
                  onDelete={connected ? undefined : () => deletePreset(p.name)}
                  disabled={connected}
                  sx={{ fontSize: 11, height: 24, opacity: connected ? 0.6 : 1 }}
                />
              </Tooltip>
            ))}
            {presets.length === 0 && <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>{t("conn.noPresets")}</Typography>}
          </Box>
          {connected && presets.length > 0 && (
            <Typography variant="caption" color="warning.main" sx={{ fontSize: 10 }}>
              Presets are disabled while connected. Disconnect to switch.
            </Typography>
          )}
        </AccordionDetails>
      </Accordion>
    </Stack>
  );
}
