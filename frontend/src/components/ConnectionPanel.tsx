import { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
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
import RefreshIcon from "@mui/icons-material/Refresh";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloseIcon from "@mui/icons-material/Close";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AddIcon from "@mui/icons-material/Add";
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

function sanitizePreset(p: Preset): Preset {
  if (p.transport === "stdio") {
    return { ...p, url: "", headers: "{}" };
  }
  // sse / streamable – http transports don't need stdio fields
  return { ...p, command: "", args: "", env: "", cwd: "" };
}

function presetSummary(p: Preset): string {
  if (p.transport === "stdio") return `${p.command ?? ""} ${p.args ?? ""}`.trim().slice(0, 60) || "stdio";
  return (p.url ?? "").slice(0, 60);
}

// Compare connection fields only (name is identity, not content).
function sameConfig(a: Preset, b: Preset): boolean {
  const sa = sanitizePreset(a);
  const sb = sanitizePreset(b);
  return (
    sa.transport === sb.transport &&
    sa.command === sb.command &&
    sa.args === sb.args &&
    sa.env === sb.env &&
    sa.cwd === sb.cwd &&
    sa.url === sb.url &&
    sa.headers === sb.headers
  );
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
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  // Draft + ActivePreset: which saved preset the current form is based on.
  const [activeName, setActiveName] = useState<string | null>(null);
  // Preset management modal: list view + edit view (edits require disconnect).
  const [manageOpen, setManageOpen] = useState(false);
  const [manageView, setManageView] = useState<"list" | "edit">("list");
  const [editOrigName, setEditOrigName] = useState("");
  const [eName, setEName] = useState("");
  const [eTransport, setETransport] = useState<TransportKind>("stdio");
  const [eCommand, setECommand] = useState("");
  const [eArgs, setEArgs] = useState("");
  const [eEnv, setEEnv] = useState("");
  const [eCwd, setECwd] = useState("");
  const [eUrl, setEUrl] = useState("");
  const [eHeaders, setEHeaders] = useState("{}");

  const connected = !!status?.connected;

  const draft: Preset = useMemo(
    () =>
      ({
        name: activeName ?? "",
        transport,
        command,
        args,
        env,
        cwd,
        url,
        headers,
      }) as Preset,
    [activeName, transport, command, args, env, cwd, url, headers],
  );

  const active = useMemo(() => presets.find((p) => p.name === activeName) ?? null, [presets, activeName]);
  const isDirty = useMemo(() => {
    if (!active) return false;
    return !sameConfig(draft, active);
  }, [draft, active]);

  const editHeadersError = useMemo(() => {
    if (eTransport === "stdio") return "";
    if (!eHeaders.trim()) return "";
    try {
      const v = JSON.parse(eHeaders);
      if (typeof v !== "object" || v === null || Array.isArray(v)) return t("conn.errHeaders");
      return "";
    } catch {
      return t("conn.errHeaders");
    }
  }, [eHeaders, eTransport, t]);

  const headersError = useMemo(() => {
    if (transport === "stdio") return "";
    if (!headers.trim()) return "";
    try {
      const v = JSON.parse(headers);
      if (typeof v !== "object" || v === null || Array.isArray(v)) return t("conn.errHeaders");
      return "";
    } catch {
      return t("conn.errHeaders");
    }
  }, [headers, transport, t]);

  // If the active preset was deleted externally, drop the association.
  useEffect(() => {
    if (activeName && !presets.some((p) => p.name === activeName)) {
      setActiveName(null);
    }
  }, [presets, activeName]);

  // On startup the config file wins over the cache. If the file does not
  // exist yet, seed it from the cached presets instead.
  useEffect(() => {
    mcpApi
      .configExists()
      .then((exists) => {
        if (!exists) {
          const cached = loadCachedPresets().map(sanitizePreset);
          if (cached.length > 0) {
            mcpApi.savePresets(cached).catch(() => {});
          }
          return;
        }
        return mcpApi
          .getConfig()
          .then((cfg) => {
            const list = Array.isArray(cfg.presets) ? cfg.presets : [];
            // migrate old presets that still contain redundant fields
            const cleaned = list.map(sanitizePreset);
            const needsMigrate = JSON.stringify(cleaned) !== JSON.stringify(list);
            if (needsMigrate) {
              mcpApi.savePresets(cleaned).catch(() => {});
              cachePresets(cleaned);
              setPresets(cleaned);
            } else {
              setPresets(list);
              cachePresets(list);
            }
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

  function loadIntoForm(p: Preset) {
    if (p.transport === "stdio" || p.transport === "sse" || p.transport === "streamable") {
      setTransport(p.transport);
    }
    setCommand(p.command ?? "");
    setArgs(p.args ?? "");
    setEnv(p.env ?? "");
    setCwd(p.cwd ?? "");
    setUrl(p.url ?? "");
    setHeaders(p.headers ?? "{}");
  }

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

  // Save current draft into the active preset (same name; rename via edit dialog).
  function updateActive() {
    if (!active) return;
    const cleaned = sanitizePreset({ ...(draft as Preset), name: active.name });
    persistPresets(presets.map((x) => (x.name === active.name ? cleaned : x)));
  }

  // Save current draft as a new preset (or rename-target).
  function saveAsNew() {
    const name = presetName.trim() || activeName || `${transport}-${new Date().toLocaleTimeString()}`;
    if (presets.some((x) => x.name === name) && name !== activeName) {
      onError(t("conn.nameExists", { n: name }));
      return;
    }
    const cleaned = sanitizePreset({ ...(draft as Preset), name });
    persistPresets([...presets.filter((x) => x.name !== name), cleaned]);
    setActiveName(name);
    setPresetName("");
    setSaveAsOpen(false);
  }

  function discardChanges() {
    if (active) loadIntoForm(active);
  }

  function deletePreset(name: string) {
    if (connected) {
      onError(t("conn.disconnectFirst"));
      return;
    }
    const ok = window.confirm(t("conn.confirmDelete", { n: name }));
    if (!ok) return;
    persistPresets(presets.filter((x) => x.name !== name));
    if (activeName === name) setActiveName(null);
  }

  function applyPreset(p: Preset) {
    if (p.name === activeName && !isDirty) return;
    // Dirty switch guard: confirm discard before loading another preset.
    if (active && isDirty && p.name !== activeName) {
      const ok = window.confirm(t("conn.switchDirtyConfirm", { n: active.name }));
      if (!ok) return;
    }
    loadIntoForm(p);
    setActiveName(p.name);
    setPresetName("");
    setManageOpen(false);
  }

  function openEdit(p: Preset) {
    if (connected) {
      onError(t("conn.disconnectFirst"));
      return;
    }
    setEditOrigName(p.name);
    setEName(p.name);
    setETransport((p.transport as TransportKind) || "stdio");
    setECommand(p.command ?? "");
    setEArgs(p.args ?? "");
    setEEnv(p.env ?? "");
    setECwd(p.cwd ?? "");
    setEUrl(p.url ?? "");
    setEHeaders(p.headers ?? "{}");
    setManageView("edit");
  }

  function saveEdit() {
    const orig = presets.find((x) => x.name === editOrigName);
    if (!orig) {
      setManageView("list");
      return;
    }
    const newName = eName.trim();
    if (!newName) {
      onError(t("conn.nameEmpty"));
      return;
    }
    if (newName !== editOrigName && presets.some((x) => x.name === newName)) {
      onError(t("conn.nameExists", { n: newName }));
      return;
    }
    if (eTransport !== "stdio" && editHeadersError) {
      onError(editHeadersError);
      return;
    }
    const cleaned = sanitizePreset({
      name: newName,
      transport: eTransport,
      command: eCommand,
      args: eArgs,
      env: eEnv,
      cwd: eCwd,
      url: eUrl,
      headers: eHeaders,
    } as Preset);
    persistPresets(
      newName === editOrigName
        ? presets.map((x) => (x.name === editOrigName ? cleaned : x))
        : [...presets.filter((x) => x.name !== editOrigName), cleaned],
    );
    // keep the top draft in sync when the active preset was edited/renamed
    if (activeName === editOrigName) {
      loadIntoForm(cleaned);
      setActiveName(newName);
    }
    setManageView("list");
  }

  async function connectPreset(p: Preset) {
    if (connected || busy) return;
    if (active && isDirty && p.name !== activeName) {
      const ok = window.confirm(t("conn.switchDirtyConfirm", { n: active.name }));
      if (!ok) return;
    }
    loadIntoForm(p);
    setActiveName(p.name);
    setPresetName("");
    const c = sanitizePreset(p);
    setBusy(true);
    try {
      let st: ConnectionStatus;
      if (c.transport === "stdio") {
        st = await mcpApi.connectStdio({
          command: (c.command ?? "").trim(),
          args: (c.args ?? "").split(/\s+/).map((x) => x.trim()).filter(Boolean),
          env: (c.env ?? "").split("\n").map((x) => x.trim()).filter(Boolean),
          cwd: (c.cwd ?? "").trim(),
        });
      } else {
        let h: Record<string, string> = {};
        if ((c.headers ?? "").trim()) {
          const v = JSON.parse(c.headers);
          if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error(t("conn.errHeaders"));
          h = v;
        }
        const cfg = { url: (c.url ?? "").trim(), headers: h, timeoutSec: 30 };
        st = c.transport === "sse" ? await mcpApi.connectSSE(cfg) : await mcpApi.connectStreamable(cfg);
      }
      onStatus(st);
      setManageOpen(false);
    } catch (e: any) {
      onError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  function formatHeaders() {
    try {
      const v = JSON.parse(headers.trim() || "{}");
      setHeaders(JSON.stringify(v, null, 2));
    } catch {
      onError(t("conn.errHeaders"));
    }
  }

  // Persist (if dirty) then reconnect with the current draft values.
  async function handleSaveAndReconnect() {
    if (headersError) {
      onError(headersError);
      return;
    }
    try {
      if (active && isDirty) {
        const cleaned = sanitizePreset({ ...(draft as Preset), name: active.name });
        const next = presets.map((x) => (x.name === active.name ? cleaned : x));
        setPresets(next);
        cachePresets(next);
        await mcpApi.savePresets(next);
      }
    } catch (e: any) {
      onError(e?.message ?? String(e));
      return;
    }
    setBusy(true);
    try {
      await mcpApi.disconnect().catch(() => {});
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

      <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1.5, overflow: "hidden" }}>
        <Box sx={{ px: 1.5, py: 1, display: "flex", alignItems: "center", gap: 1, bgcolor: "action.hover" }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" sx={{ display: "block", fontWeight: 800, fontSize: 11 }}>
              {t("conn.presets")} <Typography component="span" variant="caption" color="text.secondary">{presets.length}</Typography>
            </Typography>
            <Typography variant="caption" color={active ? (isDirty ? "warning.main" : "text.secondary") : "text.disabled"} sx={{ fontSize: 10 }} noWrap>
              {active ? `${isDirty ? "● " : ""}${active.name}` : t("conn.temporary")}
            </Typography>
          </Box>
          <Button size="small" variant="text" onClick={() => { setManageView("list"); setManageOpen(true); }} sx={{ minWidth: 0, px: 0.75, textTransform: "none", fontSize: 11 }}>
            {t("conn.managePresets")}
          </Button>
        </Box>
        {presets.length > 0 && (
          <List dense disablePadding sx={{ maxHeight: 148, overflow: "auto" }}>
            {presets.map((p) => {
              const selected = p.name === activeName;
              return (
                <ListItem key={p.name} disablePadding divider>
                  <ListItemButton selected={selected} onClick={() => applyPreset(p)} sx={{ py: 0.65, px: 1.5 }}>
                    <ListItemText primary={p.name} secondary={`${p.transport} · ${presetSummary(p)}`} primaryTypographyProps={{ fontSize: 11, fontWeight: selected ? 700 : 500, noWrap: true }} secondaryTypographyProps={{ fontSize: 10, noWrap: true }} sx={{ my: 0 }} />
                    <ChevronRightIcon sx={{ fontSize: 16, color: "text.disabled" }} />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        )}
      </Box>
      {connected && active && isDirty && (
        <Alert severity="warning" sx={{ fontSize: 11, py: 0.5, borderRadius: 1.5 }}>
          {t("conn.nextTimeHint")}
        </Alert>
      )}

      <FormControl fullWidth size="small">
        <InputLabel sx={{ fontSize: 12 }}>{t("conn.transport")}</InputLabel>
        <Select
          value={transport}
          label={t("conn.transport")}
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
          <TextField label={t("conn.command")} value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npx / uvx / python / node ..." size="small" />
          <TextField label={t("conn.args")} value={args} onChange={(e) => setArgs(e.target.value)} multiline minRows={2} size="small" InputProps={{ sx: { fontSize: 12, fontFamily: "monospace" } }} />
          <Accordion variant="outlined" sx={{ borderRadius: 1.5, "&:before": { display: "none" }, bgcolor: "action.hover" }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />} sx={{ minHeight: 32, "& .MuiAccordionSummary-content": { my: 0.5 } }}>
              <Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11 }}>Advanced · Env & Cwd</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 1.25, pt: 0, display: "flex", flexDirection: "column", gap: 1.25, bgcolor: "background.paper", borderRadius: 1.5 }}>
              <TextField label={t("conn.env")} value={env} onChange={(e) => setEnv(e.target.value)} multiline minRows={2} placeholder={"API_KEY=xxx"} size="small" />
              <TextField label={t("conn.cwd")} value={cwd} onChange={(e) => setCwd(e.target.value)} placeholder="/path/to/server" size="small" />
            </AccordionDetails>
          </Accordion>
        </Stack>
      ) : (
        <Stack spacing={1.25}>
          <TextField label={t("conn.url")} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://127.0.0.1:8000/mcp" size="small" />
          <Accordion variant="outlined" sx={{ borderRadius: 1.5, "&:before": { display: "none" }, bgcolor: "action.hover" }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />} sx={{ minHeight: 32, "& .MuiAccordionSummary-content": { my: 0.5 } }}>
              <Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11 }}>Headers · JSON</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 1.25, pt: 0, bgcolor: "background.paper", borderRadius: 1.5 }}>
              <TextField
                label={t("conn.headers")}
                value={headers}
                onChange={(e) => setHeaders(e.target.value)}
                multiline
                minRows={3}
                size="small"
                fullWidth
                error={!!headersError}
                helperText={headersError || ""}
                InputProps={{ sx: { fontFamily: "monospace", fontSize: 11 } }}
              />
              <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 0.5 }}>
                <Button size="small" onClick={formatHeaders} sx={{ textTransform: "none", fontSize: 11, minWidth: 0, px: 1 }}>
                  {t("conn.format")}
                </Button>
              </Box>
            </AccordionDetails>
          </Accordion>
        </Stack>
      )}

      {/* Draft differs from the linked preset: quick sync actions live with the draft. */}
      {active && isDirty && (
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography
            variant="caption"
            sx={{
              flex: 1,
              minWidth: 0,
              fontSize: 11,
              color: "warning.main",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {`● ${active.name} · ${t("conn.modified")}`}
          </Typography>
          <Button
            variant="contained"
            onClick={updateActive}
            size="small"
            sx={{ height: 28, textTransform: "none", flexShrink: 0 }}
          >
            {t("conn.updateShort")}
          </Button>
          <Button
            variant="outlined"
            onClick={discardChanges}
            size="small"
            sx={{ height: 28, textTransform: "none", flexShrink: 0 }}
          >
            {t("conn.discard")}
          </Button>
        </Stack>
      )}

      <Stack direction="row" spacing={1} sx={{ pt: 0.5 }}>
        {!connected ? (
          <Button variant="contained" startIcon={<PlayArrowIcon fontSize="small" />} onClick={handleConnect} disabled={busy || !!headersError} fullWidth sx={{ textTransform: "none", fontWeight: 700, height: 34, borderRadius: 1.5 }}>
            {busy ? t("conn.connecting") : t("conn.connect")}
          </Button>
        ) : (
          <>
            <Button
              variant="outlined"
              color="warning"
              startIcon={<StopIcon fontSize="small" />}
              onClick={handleDisconnect}
              disabled={busy}
              sx={{ flex: 1, minWidth: 0, textTransform: "none", fontWeight: 700, height: 34, borderRadius: 1.5, px: 1 }}
            >
              {t("conn.disconnect")}
            </Button>
            <Tooltip title={active && isDirty ? t("conn.saveReconnectTip") : t("conn.reconnectTip")}>
              <span style={{ flex: 1, display: "flex", minWidth: 0 }}>
                <Button
                  variant="contained"
                  startIcon={<RefreshIcon fontSize="small" />}
                  onClick={handleSaveAndReconnect}
                  disabled={busy || !!headersError}
                  sx={{ flex: 1, minWidth: 0, textTransform: "none", fontWeight: 700, height: 34, borderRadius: 1.5, px: 1 }}
                >
                  {active && isDirty ? t("conn.saveReconnect") : t("conn.reconnect")}
                </Button>
              </span>
            </Tooltip>
          </>
        )}
      </Stack>

      <Divider sx={{ my: 0.5 }} />
      {saveAsOpen ? (
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            label={t("conn.presetName")}
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveAsNew();
            }}
            size="small"
            autoFocus
            sx={{ flex: 1, minWidth: 0 }}
          />
          <Button
            variant="outlined"
            onClick={saveAsNew}
            size="small"
            sx={{ height: 40, textTransform: "none", flexShrink: 0 }}
          >
            {t("conn.saveAsNew")}
          </Button>
          <IconButton
            size="small"
            onClick={() => {
              setSaveAsOpen(false);
              setPresetName("");
            }}
            sx={{ flexShrink: 0 }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      ) : (
        <Button
          size="small"
          startIcon={<AddIcon fontSize="small" />}
          onClick={() => setSaveAsOpen(true)}
          sx={{ textTransform: "none", color: "text.secondary", alignSelf: "flex-start", minWidth: 0, px: 0.5 }}
        >
          {t("conn.saveAsPreset")}
        </Button>
      )}

      <Dialog open={manageOpen} onClose={() => setManageOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", gap: 0.5, pr: 1 }}>
          {manageView === "edit" && (
            <IconButton size="small" onClick={() => setManageView("list")} sx={{ ml: -1 }}>
              <ArrowBackIcon fontSize="small" />
            </IconButton>
          )}
          <Box sx={{ flex: 1 }}>{manageView === "edit" ? t("conn.editPreset") : t("conn.managePresets")}</Box>
          <IconButton size="small" onClick={() => setManageOpen(false)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        {manageView === "list" ? (
          <>
            <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
          {presets.length === 0 ? (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
              {t("conn.noPresets")}
            </Typography>
          ) : (
            <List dense disablePadding sx={{ border: 1, borderColor: "divider", borderRadius: 1.5, overflow: "hidden" }}>
              {presets.map((p) => {
                const isActive = p.name === activeName;
                const showDot = isActive && isDirty;
                const locked = connected || busy;
                return (
                  <ListItem
                    key={p.name}
                    disablePadding
                    divider
                    secondaryAction={
                      <Box sx={{ display: "flex", alignItems: "center", mr: 0.5 }}>
                        <Tooltip title={locked ? t("conn.disconnectFirst") : t("conn.connectPreset", { n: p.name })}>
                          <span>
                            <IconButton size="small" disabled={locked} onClick={() => connectPreset(p)} sx={{ p: 0.5 }}>
                              <PlayArrowIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title={locked ? t("conn.disconnectFirst") : t("conn.edit")}>
                          <span>
                            <IconButton size="small" disabled={locked} onClick={() => openEdit(p)} sx={{ p: 0.5 }}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title={locked ? t("conn.disconnectFirst") : t("conn.delete")}>
                          <span>
                            <IconButton size="small" disabled={locked} onClick={() => deletePreset(p.name)} sx={{ p: 0.5 }}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Box>
                    }
                  >
                    <Tooltip title={t("conn.loadTip")}>
                      <ListItemButton selected={isActive} onClick={() => applyPreset(p)} sx={{ py: 0.5, pr: 13 }}>
                        <ListItemText
                          primary={`${showDot ? "● " : ""}${p.name}`}
                          secondary={`${p.transport} · ${presetSummary(p)}`}
                          primaryTypographyProps={{
                            fontSize: 12,
                            fontWeight: isActive ? 700 : 500,
                            noWrap: true,
                            color: showDot ? "warning.main" : undefined,
                          }}
                          secondaryTypographyProps={{ fontSize: 10, noWrap: true }}
                          sx={{ my: 0 }}
                        />
                      </ListItemButton>
                    </Tooltip>
                  </ListItem>
                );
              })}
            </List>
          )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setManageOpen(false)} sx={{ textTransform: "none" }}>
                {t("conn.close")}
              </Button>
            </DialogActions>
          </>
        ) : (
          <>
            <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <TextField
            label={t("conn.presetName")}
            value={eName}
            onChange={(e) => setEName(e.target.value)}
            size="small"
            fullWidth
            sx={{ mt: 1 }}
          />
          <FormControl fullWidth size="small">
            <InputLabel sx={{ fontSize: 12 }}>{t("conn.transport")}</InputLabel>
            <Select
              value={eTransport}
              label={t("conn.transport")}
              onChange={(e) => setETransport(e.target.value as TransportKind)}
              sx={{ fontSize: 12, height: 36 }}
            >
              <MenuItem value="stdio" sx={{ fontSize: 12 }}>{t("conn.transport.stdio")}</MenuItem>
              <MenuItem value="sse" sx={{ fontSize: 12 }}>{t("conn.transport.sse")}</MenuItem>
              <MenuItem value="streamable" sx={{ fontSize: 12 }}>{t("conn.transport.streamable")}</MenuItem>
            </Select>
          </FormControl>
          {eTransport === "stdio" ? (
            <>
              <TextField label={t("conn.command")} value={eCommand} onChange={(e) => setECommand(e.target.value)} size="small" fullWidth />
              <TextField
                label={t("conn.args")}
                value={eArgs}
                onChange={(e) => setEArgs(e.target.value)}
                multiline
                minRows={2}
                size="small"
                fullWidth
                InputProps={{ sx: { fontSize: 12, fontFamily: "monospace" } }}
              />
              <TextField
                label={t("conn.env")}
                value={eEnv}
                onChange={(e) => setEEnv(e.target.value)}
                multiline
                minRows={2}
                size="small"
                fullWidth
              />
              <TextField label={t("conn.cwd")} value={eCwd} onChange={(e) => setECwd(e.target.value)} size="small" fullWidth />
            </>
          ) : (
            <>
              <TextField label={t("conn.url")} value={eUrl} onChange={(e) => setEUrl(e.target.value)} size="small" fullWidth />
              <TextField
                label={t("conn.headers")}
                value={eHeaders}
                onChange={(e) => setEHeaders(e.target.value)}
                multiline
                minRows={3}
                size="small"
                fullWidth
                error={!!editHeadersError}
                helperText={editHeadersError || ""}
                InputProps={{ sx: { fontFamily: "monospace", fontSize: 11 } }}
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setManageView("list")} sx={{ textTransform: "none" }}>
            {t("conn.back")}
          </Button>
          <Button variant="contained" onClick={saveEdit} sx={{ textTransform: "none" }}>
            {t("conn.save")}
          </Button>
        </DialogActions>
          </>
        )}
      </Dialog>
    </Stack>
  );
}
