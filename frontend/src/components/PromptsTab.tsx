import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import Grid from "@mui/material/Grid";
import RefreshIcon from "@mui/icons-material/Refresh";
import SendIcon from "@mui/icons-material/Send";
import SearchIcon from "@mui/icons-material/Search";
import { isCapabilityUnavailableError, mcpApi, type Prompt } from "../api/mcp";
import { useSettings } from "../settings";
import JsonView from "./JsonView";

interface Props {
  connected: boolean;
  onError: (msg: string) => void;
  onAvailable?: (available: boolean) => void;
}

export default function PromptsTab({ connected, onError, onAvailable }: Props) {
  const { t } = useSettings();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [selected, setSelected] = useState<Prompt | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [getting, setGetting] = useState(false);
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return prompts;
    return prompts.filter((p) => p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q));
  }, [prompts, filter]);

  const argsEntries = useMemo(() => selected?.arguments ?? [], [selected]);

  async function refresh() {
    setLoading(true);
    try {
      const list = await mcpApi.listPrompts();
      setPrompts(list);
      // A successful empty list still means the server supports prompts/list.
      onAvailable?.(true);
      if (list.length === 0) {
        setSelected(null);
        setFormValues({});
        setResult(null);
      } else if (!selected) pick(list[0]);
      else {
        const keep = list.find((x) => x.name === selected.name);
        if (!keep) pick(list[0]);
      }
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      if (isCapabilityUnavailableError(e)) onAvailable?.(false);
      else onError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (connected) refresh();
    else {
      setPrompts([]);
      setSelected(null);
      setFormValues({});
      setResult(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  function pick(p: Prompt) {
    setSelected(p);
    const init: Record<string, string> = {};
    for (const a of p.arguments ?? []) init[a.name] = "";
    setFormValues(init);
    setResult(null);
  }

  function buildArgsJson(): string {
    // values are coerced to strings per MCP spec
    const out: Record<string, string> = {};
    for (const k of Object.keys(formValues)) out[k] = String(formValues[k] ?? "");
    return JSON.stringify(out);
  }

  async function get() {
    if (!selected) return;
    setGetting(true);
    try {
      setResult(await mcpApi.getPrompt(selected.name, buildArgsJson()));
    } catch (e: any) {
      onError(e?.message ?? String(e));
      setResult({ error: e?.message ?? String(e) });
    } finally {
      setGetting(false);
    }
  }

  return (
    <Box sx={{ display: "flex", gap: 2, minHeight: 560, height: "calc(100vh - 120px)", flexDirection: { xs: "column", lg: "row" }, alignItems: "stretch" }}>
      <Paper variant="outlined" sx={{ width: { xs: "100%", lg: 260 }, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 2.5, maxHeight: { xs: 320, lg: "100%" } }}>
        <Box sx={{ p: 1.25, borderBottom: 1, borderColor: "divider", display: "flex", flexDirection: "column", gap: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 700, fontSize: 12 }}>Prompts · {prompts.length}</Typography>
            <Button size="small" variant="outlined" startIcon={<RefreshIcon fontSize="small" />} onClick={refresh} disabled={!connected || loading} sx={{ height: 28, textTransform: "none" }}>
              {loading ? t("common.loading") : t("common.refresh")}
            </Button>
          </Stack>
          <TextField placeholder="Filter prompts..." value={filter} onChange={(e) => setFilter(e.target.value)} size="small" InputProps={{ startAdornment: <SearchIcon sx={{ fontSize: 16, color: "text.disabled", mr: 0.5 }} /> }} sx={{ "& .MuiInputBase-root": { height: 32, fontSize: 12 } }} />
        </Box>
        {!connected && <Alert severity="info" sx={{ m: 1, py: 0.5, fontSize: 11 }}>{t("common.connectFirst")}</Alert>}
        <List dense sx={{ flex: 1, overflow: "auto", p: 0.5 }}>
          {filtered.map((p) => (
            <ListItemButton key={p.name} selected={selected?.name === p.name} onClick={() => pick(p)} sx={{ borderRadius: 1.5, mb: 0.3, "&.Mui-selected": { bgcolor: "primary.main", color: "white", "& .MuiListItemText-secondary": { color: "rgba(255,255,255,0.8)" } } }}>
              <ListItemText primaryTypographyProps={{ fontSize: 12, fontWeight: 600 }} secondaryTypographyProps={{ fontSize: 11 }} primary={p.name} secondary={p.description?.slice(0, 80)} />
            </ListItemButton>
          ))}
          {filtered.length === 0 && <Box sx={{ p: 2, textAlign: "center" }}><Typography variant="caption" color="text.secondary">{t("prompt.refreshHint")}</Typography></Box>}
        </List>
      </Paper>

      <Paper variant="outlined" sx={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 2.5, bgcolor: "background.paper" }}>
        {selected ? (
          <>
            <Box sx={{ p: 1.5, borderBottom: 1, borderColor: "divider" }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="h6" sx={{ flex: 1, fontSize: 14, fontWeight: 800 }}>{selected.name}</Typography>
                <Chip size="small" label="prompt" color="secondary" sx={{ height: 20, fontSize: 10, fontWeight: 700 }} />
              </Stack>
              {selected.description && <Typography variant="body2" color="text.secondary" sx={{ fontSize: 11, mt: 0.5 }}>{selected.description}</Typography>}
            </Box>
            <Box sx={{ flex: 1, overflow: "auto", p: 1.5, display: "flex", flexDirection: "column", gap: 1.25 }}>
              <JsonView value={selected.arguments ?? []} maxHeight={160} />
              <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: 12 }}>{t("prompt.argsHint")} {argsEntries.length > 0 && `· ${argsEntries.length}`}</Typography>
              {argsEntries.length === 0 ? <Alert severity="info" sx={{ py: 0.5, fontSize: 11 }}>No arguments</Alert> : (
                <Grid container spacing={1.25}>
                  {argsEntries.map((a) => (
                    <Grid key={a.name} size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label={`${a.name}${a.required ? " *" : ""}`}
                        value={formValues[a.name] ?? ""}
                        onChange={(e) => setFormValues((prev) => ({ ...prev, [a.name]: e.target.value }))}
                        helperText={a.description}
                        size="small"
                        fullWidth
                        required={!!a.required}
                        placeholder={a.description ?? ""}
                      />
                    </Grid>
                  ))}
                </Grid>
              )}
              <Box sx={{ pt: 1, borderTop: 1, borderColor: "divider", display: "flex", gap: 1, alignItems: "center", mt: 1 }}>
                <Button variant="contained" startIcon={<SendIcon fontSize="small" />} onClick={get} disabled={!connected || getting} sx={{ textTransform: "none", fontWeight: 700, height: 32 }}>
                  {getting ? t("prompt.getting") : t("prompt.get")}
                </Button>
                <Button size="small" onClick={() => { const cleared: Record<string, string> = {}; for (const a of argsEntries) cleared[a.name] = ""; setFormValues(cleared); }} sx={{ textTransform: "none" }}>Clear</Button>
              </Box>
            </Box>
          </>
        ) : (
          <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", p: 3 }}>
            <Alert severity="info" sx={{ fontSize: 12 }}>{t("prompt.pickHint")}</Alert>
          </Box>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ width: { xs: "100%", lg: 480 }, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 2.5, bgcolor: "background.paper", maxHeight: { xs: 480, lg: "100%" } }}>
        <Box sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: "divider", display: "flex", alignItems: "center", gap: 1, bgcolor: "action.hover" }}>
          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: result ? "success.main" : "text.disabled" }} />
          <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 800, fontSize: 12 }}>Response</Typography>
          <Chip size="small" label={result ? "200 OK" : "—"} color={result ? "success" : "default"} sx={{ height: 20, fontSize: 10, fontWeight: 700 }} />
          <Button size="small" onClick={() => setResult(null)} disabled={!result} sx={{ height: 22, fontSize: 11, textTransform: "none" }}>Clear</Button>
        </Box>
        <Box sx={{ flex: 1, overflow: "auto", p: 1.25, bgcolor: "background.default" }}>
          {result ? <JsonView value={result} maxHeight={9999} /> : (
            <Box sx={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, color: "text.secondary", py: 6 }}>
              <Typography variant="caption" sx={{ fontSize: 11, textAlign: "center", maxWidth: 220 }}>Click “Get prompt” to see response here.</Typography>
            </Box>
          )}
        </Box>
      </Paper>
    </Box>
  );
}
