import { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  FormControlLabel,
  InputLabel,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import Grid from "@mui/material/Grid";

import RefreshIcon from "@mui/icons-material/Refresh";
import SendIcon from "@mui/icons-material/Send";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import { mcpApi, type Tool } from "../api/mcp";
import { useSettings } from "../settings";
import JsonView from "./JsonView";

interface Props {
  connected: boolean;
  onError: (msg: string) => void;
  onAvailable?: (available: boolean) => void;
}

type SchemaProp = {
  type?: string;
  description?: string;
  default?: any;
  enum?: any[];
  items?: any;
  [k: string]: any;
};

function getSchemaEntries(schema: any): { key: string; prop: SchemaProp; required: boolean }[] {
  if (!schema || typeof schema !== "object") return [];
  const props: Record<string, SchemaProp> = schema.properties ?? {};
  const requiredSet = new Set<string>(Array.isArray(schema.required) ? schema.required : []);
  return Object.entries(props).map(([key, prop]) => ({
    key,
    prop: prop as SchemaProp,
    required: requiredSet.has(key),
  }));
}

function initialValueFor(prop: SchemaProp): any {
  if (prop.default !== undefined) {
    if (prop.type === "array" || prop.type === "object") {
      if (typeof prop.default === "object") return JSON.stringify(prop.default, null, 2);
      return String(prop.default);
    }
    if (prop.type === "boolean") return Boolean(prop.default);
    if (prop.type === "number" || prop.type === "integer") return String(prop.default);
    return String(prop.default);
  }
  switch (prop.type) {
    case "boolean":
      return false;
    case "number":
    case "integer":
      return "";
    case "array":
      return "[]";
    case "object":
      return "{}";
    case "string":
    default:
      if (Array.isArray(prop.enum) && prop.enum.length > 0) return String(prop.enum[0]);
      return "";
  }
}

function buildArgsJson(
  entries: { key: string; prop: SchemaProp; required: boolean }[],
  values: Record<string, any>,
): { json: string; error?: string } {
  const out: Record<string, any> = {};
  for (const { key, prop, required } of entries) {
    const raw = values[key];
    const type = prop.type;
    if (required) {
      if (type === "boolean") {
        // always
      } else if (raw === "" || raw === undefined || raw === null) {
        return { json: "", error: key };
      }
      if ((type === "array" || type === "object") && typeof raw === "string" && raw.trim() === "") {
        return { json: "", error: key };
      }
    } else {
      if (raw === "" || raw === undefined || raw === null) continue;
      if ((type === "array" || type === "object") && typeof raw === "string" && raw.trim() === "") continue;
      if (typeof raw === "string" && raw.trim() === "" && type !== "string") continue;
    }
    try {
      if (type === "boolean") out[key] = Boolean(raw);
      else if (type === "number") {
        const n = parseFloat(String(raw));
        if (isNaN(n)) return { json: "", error: key };
        out[key] = n;
      } else if (type === "integer") {
        const n = parseInt(String(raw), 10);
        if (isNaN(n)) return { json: "", error: key };
        out[key] = n;
      } else if (type === "array" || type === "object") {
        if (typeof raw === "string") {
          const trimmed = raw.trim();
          if (!trimmed) continue;
          out[key] = JSON.parse(trimmed);
        } else out[key] = raw;
      } else out[key] = String(raw);
    } catch {
      return { json: "", error: key };
    }
  }
  return { json: JSON.stringify(out) };
}

export default function ToolsTab({ connected, onError, onAvailable }: Props) {
  const { t } = useSettings();
  const [tools, setTools] = useState<Tool[]>([]);
  const [selected, setSelected] = useState<Tool | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [calling, setCalling] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [schemaOpen, setSchemaOpen] = useState(false);

  const entries = useMemo(() => getSchemaEntries(selected?.inputSchema), [selected]);

  const filteredTools = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter(
      (x) => x.name.toLowerCase().includes(q) || (x.description ?? "").toLowerCase().includes(q),
    );
  }, [tools, filter]);

  const previewJson = useMemo(() => {
    const { json, error } = buildArgsJson(entries, formValues);
    if (error) return `/* invalid: ${error} */\n${JSON.stringify(formValues, null, 2)}`;
    try {
      return JSON.stringify(JSON.parse(json), null, 2);
    } catch {
      return json || "{}";
    }
  }, [entries, formValues]);

  async function refresh() {
    setLoading(true);
    try {
      const list = await mcpApi.listTools();
      setTools(list);
      onAvailable?.(list.length > 0);
      if (list.length > 0) {
        const keep = selected ? list.find((x) => x.name === selected.name) : null;
        const next = keep ?? list[0];
        if (!keep) {
          setSelected(next);
          initForm(next.inputSchema);
          setResult(null);
        }
      } else {
        // no tools – clear selection
        setSelected(null);
        setFormValues({});
        setResult(null);
      }
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      onError(msg);
      // if method not found / not supported, hide tab
      if (/not found|unknown method|not supported/i.test(msg)) onAvailable?.(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (connected) refresh();
    else {
      setTools([]);
      setSelected(null);
      setFormValues({});
      setResult(null);
      setFieldError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  function initForm(schema: any) {
    const ents = getSchemaEntries(schema);
    const init: Record<string, any> = {};
    for (const { key, prop } of ents) init[key] = initialValueFor(prop);
    setFormValues(init);
    setFieldError(null);
  }

  function pick(tool: Tool) {
    setSelected(tool);
    initForm(tool.inputSchema);
    setResult(null);
  }

  function updateField(key: string, value: any) {
    setFormValues((prev) => ({ ...prev, [key]: value }));
    if (fieldError === key) setFieldError(null);
  }

  function clearFields() {
    const cleared: Record<string, any> = {};
    for (const { key, prop } of entries) {
      const type = prop.type;
      if (type === "boolean") cleared[key] = false;
      else if (type === "array") cleared[key] = "[]";
      else if (type === "object") cleared[key] = "{}";
      else cleared[key] = "";
    }
    setFormValues(cleared);
    setFieldError(null);
  }

  async function call() {
    if (!selected) return;
    const { json, error } = buildArgsJson(entries, formValues);
    if (error) {
      setFieldError(error);
      onError(t("tools.missingRequired") + `: ${error}`);
      return;
    }
    setCalling(true);
    try {
      const res = await mcpApi.callTool(selected.name, json || "{}");
      setResult(res);
      setFieldError(null);
    } catch (e: any) {
      onError(e?.message ?? String(e));
      setResult({ error: e?.message ?? String(e) });
    } finally {
      setCalling(false);
    }
  }

  return (
    <Box
      sx={{
        display: "flex",
        gap: 2,
        alignItems: "stretch",
        minHeight: 560,
        height: "calc(100vh - 120px)",
        flexDirection: { xs: "column", lg: "row" },
      }}
    >
      {/* Left: list */}
      <Paper
        variant="outlined"
        sx={{
          width: { xs: "100%", lg: 260 },
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRadius: 2.5,
          maxHeight: { xs: 320, lg: "100%" },
        }}
      >
        <Box sx={{ p: 1.25, borderBottom: 1, borderColor: "divider", bgcolor: "background.paper", display: "flex", flexDirection: "column", gap: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 700 }}>
              Tools · {tools.length}
            </Typography>
            <Button size="small" variant="outlined" startIcon={<RefreshIcon fontSize="small" />} onClick={refresh} disabled={!connected || loading} sx={{ height: 28, textTransform: "none" }}>
              {loading ? t("common.loading") : t("common.refresh")}
            </Button>
          </Stack>
          <TextField
            placeholder="Filter tools..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            size="small"
            InputProps={{ startAdornment: <SearchIcon sx={{ fontSize: 16, color: "text.disabled", mr: 0.5 }} /> }}
            sx={{ "& .MuiInputBase-root": { height: 32, fontSize: 12 } }}
          />
        </Box>
        {!connected && (
          <Alert severity="info" sx={{ m: 1, py: 0.5, fontSize: 12 }}>
            {t("common.connectFirst")}
          </Alert>
        )}
        <List dense sx={{ flex: 1, overflow: "auto", p: 0.5 }}>
          {filteredTools.map((tool) => (
            <ListItemButton
              key={tool.name}
              selected={selected?.name === tool.name}
              onClick={() => pick(tool)}
              sx={{
                borderRadius: 1.5,
                mb: 0.3,
                alignItems: "flex-start",
                "&.Mui-selected": { bgcolor: "primary.main", color: "white", "& .MuiListItemText-secondary": { color: "rgba(255,255,255,0.8)" } },
              }}
            >
              <ListItemText
                primaryTypographyProps={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}
                secondaryTypographyProps={{ fontSize: 11, lineHeight: 1.3 }}
                primary={tool.name}
                secondary={tool.description?.slice(0, 90)}
              />
            </ListItemButton>
          ))}
          {filteredTools.length === 0 && (
            <Box sx={{ p: 2, textAlign: "center" }}>
              <Typography variant="caption" color="text.secondary">
                {tools.length === 0 ? t("tools.refreshHint") : "No match"}
              </Typography>
            </Box>
          )}
        </List>
      </Paper>

      {/* Center: request */}
      <Paper
        variant="outlined"
        sx={{
          flex: { lg: "1 1 0" },
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRadius: 2.5,
          bgcolor: "background.paper",
        }}
      >
        {selected ? (
          <>
            <Box sx={{ p: 1.5, borderBottom: 1, borderColor: "divider", display: "flex", flexDirection: "column", gap: 0.8 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="h6" sx={{ flex: 1, fontSize: 16, fontWeight: 800, lineHeight: 1.2 }}>
                  {selected.name}
                </Typography>
                <Chip size="small" label="tool" color="primary" sx={{ height: 20, fontSize: 10, fontWeight: 700 }} />
              </Stack>
              {selected.description && (
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12, lineHeight: 1.5 }}>
                  {selected.description}
                </Typography>
              )}
            </Box>

            <Box sx={{ flex: 1, overflow: "auto", p: 1.5, display: "flex", flexDirection: "column", gap: 1.5 }}>
              <Accordion
                expanded={schemaOpen}
                onChange={(_, v) => setSchemaOpen(v)}
                variant="outlined"
                sx={{ borderRadius: 2, "&:before": { display: "none" } }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />} sx={{ minHeight: 36, "& .MuiAccordionSummary-content": { my: 0.5 } }}>
                  <Typography variant="subtitle2" sx={{ fontSize: 12, fontWeight: 700 }}>
                    {t("tools.schema")} · {entries.length} fields
                  </Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ p: 1.25, pt: 0 }}>
                  <JsonView value={selected.inputSchema ?? {}} maxHeight={220} />
                </AccordionDetails>
              </Accordion>

              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 700, fontSize: 12 }}>
                  {t("tools.args")} {entries.length > 0 && `· ${entries.length}`}
                </Typography>
                {entries.length > 0 && (
                  <Button size="small" startIcon={<ClearIcon fontSize="small" />} onClick={clearFields} sx={{ height: 26, textTransform: "none" }}>
                    {t("tools.clearArgs")}
                  </Button>
                )}
              </Box>

              {entries.length === 0 ? (
                <Alert severity="info" sx={{ py: 0.5, fontSize: 12 }}>
                  {t("tools.noArgs")}
                </Alert>
              ) : (
                <Grid container spacing={1.25}>
                  {entries.map(({ key, prop, required }) => {
                    const value = formValues[key];
                    const hasError = fieldError === key;
                    const label = `${key}${required ? " *" : ""}`;
                    const helper = prop.description ?? (prop.default !== undefined ? `default: ${JSON.stringify(prop.default)}` : undefined);
                    if (Array.isArray(prop.enum) && prop.enum.length > 0) {
                      return (
                        <Grid key={key} size={{ xs: 12, sm: 6 }}>
                          <FormControl fullWidth size="small" error={hasError}>
                            <InputLabel sx={{ fontSize: 12 }}>{label}</InputLabel>
                            <Select value={value ?? ""} label={label} onChange={(e) => updateField(key, e.target.value)} sx={{ fontSize: 12 }}>
                              {prop.enum.map((opt: any) => (
                                <MenuItem key={String(opt)} value={String(opt)} sx={{ fontSize: 12 }}>
                                  {String(opt)}
                                </MenuItem>
                              ))}
                            </Select>
                            {helper && (
                              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block", fontSize: 10 }}>
                                {helper}
                              </Typography>
                            )}
                          </FormControl>
                        </Grid>
                      );
                    }
                    if (prop.type === "boolean") {
                      return (
                        <Grid key={key} size={{ xs: 12, sm: 6 }}>
                          <Paper variant="outlined" sx={{ p: 1, display: "flex", alignItems: "center", borderRadius: 1.5, bgcolor: hasError ? "error.light" : "action.hover", borderColor: hasError ? "error.main" : "divider" }}>
                            <FormControlLabel
                              sx={{ flex: 1, m: 0 }}
                              control={<Switch checked={Boolean(value)} onChange={(e) => updateField(key, e.target.checked)} size="small" />}
                              label={
                                <Box>
                                  <Typography variant="body2" sx={{ fontSize: 12, fontWeight: 600 }}>
                                    {label}
                                  </Typography>
                                  {helper && <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>{helper}</Typography>}
                                </Box>
                              }
                            />
                          </Paper>
                        </Grid>
                      );
                    }
                    if (prop.type === "number" || prop.type === "integer") {
                      return (
                        <Grid key={key} size={{ xs: 12, sm: 6 }}>
                          <TextField
                            label={label}
                            type="number"
                            value={value ?? ""}
                            onChange={(e) => updateField(key, e.target.value)}
                            error={hasError}
                            helperText={hasError ? t("tools.missingRequired") : helper}
                            placeholder={prop.default !== undefined ? String(prop.default) : undefined}
                            size="small"
                            fullWidth
                          />
                        </Grid>
                      );
                    }
                    if (prop.type === "array" || prop.type === "object") {
                      return (
                        <Grid key={key} size={{ xs: 12 }}>
                          <TextField
                            label={label}
                            value={value ?? ""}
                            onChange={(e) => updateField(key, e.target.value)}
                            error={hasError}
                            helperText={hasError ? t("tools.missingRequired") : helper ?? (prop.type === "array" ? "JSON array, e.g. []" : "JSON object, e.g. {}")}
                            placeholder={prop.type === "array" ? "[]" : "{}"}
                            size="small"
                            fullWidth
                            multiline
                            minRows={2}
                            sx={{ "& .MuiInputBase-input": { fontFamily: "monospace", fontSize: 12 } }}
                          />
                        </Grid>
                      );
                    }
                    return (
                      <Grid key={key} size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label={label}
                          value={value ?? ""}
                          onChange={(e) => updateField(key, e.target.value)}
                          error={hasError}
                          helperText={hasError ? t("tools.missingRequired") : helper}
                          placeholder={prop.default !== undefined ? String(prop.default) : undefined}
                          size="small"
                          fullWidth
                          required={required}
                          sx={{ "& .MuiInputBase-input": { fontFamily: "monospace", fontSize: 12 } }}
                        />
                      </Grid>
                    );
                  })}
                </Grid>
              )}

              {entries.length > 0 && (
                <Accordion variant="outlined" defaultExpanded sx={{ borderRadius: 2, "&:before": { display: "none" } }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />} sx={{ minHeight: 32 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11 }}>{t("tools.previewArgs")}</Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ p: 1, pt: 0 }}>
                    <JsonView defaultExpand value={(() => { try { return JSON.parse(previewJson); } catch { return previewJson; } })()} maxHeight={140} />
                  </AccordionDetails>
                </Accordion>
              )}
            </Box>

            <Box sx={{ p: 1.25, borderTop: 1, borderColor: "divider", bgcolor: "background.paper", display: "flex", gap: 1, alignItems: "center" }}>
              <Button variant="contained" startIcon={<SendIcon fontSize="small" />} onClick={call} disabled={!connected || calling} sx={{ textTransform: "none", fontWeight: 700, px: 2.5, height: 32 }}>
                {calling ? t("tools.calling") : t("tools.call")}
              </Button>
              <Typography variant="caption" color="text.secondary" sx={{ ml: 1, fontSize: 10 }}>
                Will send as tools/call
              </Typography>
            </Box>
          </>
        ) : (
          <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", p: 3 }}>
            <Alert severity="info" sx={{ fontSize: 12 }}>{t("tools.pickHint")}</Alert>
          </Box>
        )}
      </Paper>

      {/* Right: result - Postman style */}
      <Paper
        variant="outlined"
        sx={{
          width: { xs: "100%", lg: 480 },
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRadius: 2.5,
          bgcolor: "background.paper",
          borderLeft: { lg: 1 },
          maxHeight: { xs: 480, lg: "100%" },
        }}
      >
        <Box sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: "divider", display: "flex", alignItems: "center", gap: 1, bgcolor: "action.hover" }}>
          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: result ? "success.main" : "text.disabled" }} />
          <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 800, fontSize: 12, letterSpacing: 0.3 }}>Response</Typography>
          <Chip size="small" label={result ? "200 OK" : "—"} color={result ? "success" : "default"} sx={{ height: 20, fontSize: 10, fontWeight: 700 }} />
          <Button size="small" onClick={() => setResult(null)} disabled={!result} sx={{ height: 22, minWidth: 0, px: 1, fontSize: 11, textTransform: "none" }}>
            Clear
          </Button>
        </Box>
        <Box sx={{ flex: 1, overflow: "auto", p: 1.25, bgcolor: "background.default" }}>
          {!selected ? (
            <Typography variant="caption" color="text.secondary">Select a tool to see response here</Typography>
          ) : result ? (
            <JsonView defaultExpand value={result} maxHeight={9999} />
          ) : (
            <Box sx={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, color: "text.secondary", py: 6 }}>
              <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: "action.hover", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <SendIcon sx={{ fontSize: 18, color: "text.disabled" }} />
              </Box>
              <Typography variant="caption" sx={{ fontSize: 11, textAlign: "center", maxWidth: 200 }}>
                Click “Call tool” to see the JSON response here. Supports large payloads with collapsible tree.
              </Typography>
            </Box>
          )}
        </Box>
        <Box sx={{ px: 1.25, py: 0.75, borderTop: 1, borderColor: "divider", display: "flex", gap: 1, alignItems: "center", bgcolor: "background.paper" }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, flex: 1 }}>
            {result ? `${JSON.stringify(result).length} bytes` : "No response yet"}
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}
