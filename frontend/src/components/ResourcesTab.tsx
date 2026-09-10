import { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import Grid from "@mui/material/Grid";

import RefreshIcon from "@mui/icons-material/Refresh";
import ArticleIcon from "@mui/icons-material/Article";
import LinkIcon from "@mui/icons-material/Link";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SearchIcon from "@mui/icons-material/Search";
import { isCapabilityUnavailableError, mcpApi, type Resource } from "../api/mcp";
import { useSettings } from "../settings";
import JsonView from "./JsonView";

interface Props {
  connected: boolean;
  onError: (msg: string) => void;
  onAvailable?: (available: boolean) => void;
}

interface ResourceTemplate {
  uriTemplate: string;
  name?: string;
  description?: string;
  mimeType?: string;
  [k: string]: any;
}

function extractVars(tpl: string): string[] {
  const re = /\{([^}]+)\}/g;
  const vars: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(tpl)) !== null) {
    const v = m[1].trim();
    if (v && !vars.includes(v)) vars.push(v);
  }
  return vars;
}

function expandUri(tpl: string, params: Record<string, string>): string {
  return tpl.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const k = key.trim();
    const val = params[k] ?? "";
    return val;
  });
}

export default function ResourcesTab({ connected, onError, onAvailable }: Props) {
  const { t } = useSettings();
  const [resources, setResources] = useState<Resource[]>([]);
  const [templates, setTemplates] = useState<ResourceTemplate[]>([]);
  const [subTab, setSubTab] = useState<0 | 1>(0);
  const [selectedRes, setSelectedRes] = useState<Resource | null>(null);
  const [selectedTpl, setSelectedTpl] = useState<ResourceTemplate | null>(null);
  const [tplParams, setTplParams] = useState<Record<string, string>>({});
  const [uri, setUri] = useState("");
  const [content, setContent] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [reading, setReading] = useState(false);
  const [filter, setFilter] = useState("");
  const [metaOpen, setMetaOpen] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const [list, tpl] = await Promise.all([
        mcpApi.listResources(),
        mcpApi.listResourceTemplates().catch(() => []),
      ]);
      setResources(list);
      setTemplates(tpl as ResourceTemplate[]);
      // A successful empty list still means the resources capability exists.
      onAvailable?.(true);
      if (list.length === 0 && tpl.length === 0) {
        setSelectedRes(null);
        setSelectedTpl(null);
        setContent(null);
        setUri("");
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
      setResources([]);
      setTemplates([]);
      setSelectedRes(null);
      setSelectedTpl(null);
      setTplParams({});
      setUri("");
      setContent(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  // Clear stale selection when lists change (avoid 404 after server switch)
  useEffect(() => {
    if (selectedRes && resources.length > 0 && !resources.find((r) => r.uri === selectedRes.uri)) {
      setSelectedRes(null);
      setContent(null);
      setUri("");
    }
  }, [resources, selectedRes]);
  useEffect(() => {
    if (selectedTpl && templates.length > 0 && !templates.find((x) => x.uriTemplate === selectedTpl.uriTemplate)) {
      setSelectedTpl(null);
      setTplParams({});
      setContent(null);
      setUri("");
    }
  }, [templates, selectedTpl]);

  async function read(target?: string) {
    const u = (target ?? uri).trim();
    if (!u) return;
    setUri(u);
    setReading(true);
    try {
      setContent(await mcpApi.readResource(u));
    } catch (e: any) {
      onError(e?.message ?? String(e));
      setContent({ error: e?.message ?? String(e) });
    } finally {
      setReading(false);
    }
  }

  function pickResource(r: Resource) {
    setSelectedRes(r);
    setUri(r.uri);
    setContent(null);
  }

  function pickTemplate(tpl: ResourceTemplate) {
    setSelectedTpl(tpl);
    const vars = extractVars(tpl.uriTemplate);
    const init: Record<string, string> = {};
    for (const v of vars) init[v] = tplParams[v] ?? "";
    const next: Record<string, string> = {};
    for (const v of vars) next[v] = init[v];
    setTplParams(next);
    setContent(null);
    setUri(expandUri(tpl.uriTemplate, next));
  }

  const tplVars = useMemo(() => {
    if (!selectedTpl) return [];
    return extractVars(selectedTpl.uriTemplate);
  }, [selectedTpl]);

  const tplPreview = useMemo(() => {
    if (!selectedTpl) return "";
    return expandUri(selectedTpl.uriTemplate, tplParams);
  }, [selectedTpl, tplParams]);

  const tplCanRead = useMemo(() => {
    if (!selectedTpl) return false;
    if (tplVars.length === 0) return true;
    return tplVars.every((v) => (tplParams[v] ?? "").trim() !== "");
  }, [selectedTpl, tplVars, tplParams]);

  function updateTplParam(key: string, val: string) {
    const next = { ...tplParams, [key]: val };
    setTplParams(next);
    if (selectedTpl) setUri(expandUri(selectedTpl.uriTemplate, next));
  }

  async function readTemplate() {
    if (!selectedTpl) return;
    if (!tplCanRead) {
      onError(t("res.missingParams"));
      return;
    }
    await read(tplPreview);
  }

  const filteredResources = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return resources;
    return resources.filter((r) => r.uri.toLowerCase().includes(q) || (r.name ?? "").toLowerCase().includes(q));
  }, [resources, filter]);

  const filteredTemplates = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((x) => x.uriTemplate.toLowerCase().includes(q) || (x.name ?? "").toLowerCase().includes(q));
  }, [templates, filter]);

  const hasSelection = subTab === 0 ? !!selectedRes : !!selectedTpl;

  return (
    <Box sx={{ display: "flex", gap: 2, minHeight: 560, height: "calc(100vh - 120px)", flexDirection: { xs: "column", lg: "row" }, alignItems: "stretch" }}>
      {/* Left list */}
      <Paper variant="outlined" sx={{ width: { xs: "100%", lg: 280 }, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 2.5, maxHeight: { xs: 360, lg: "100%" } }}>
        <Box sx={{ p: 1.25, borderBottom: 1, borderColor: "divider", display: "flex", flexDirection: "column", gap: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 700, fontSize: 12 }}>Resources</Typography>
            <Button size="small" variant="outlined" startIcon={<RefreshIcon fontSize="small" />} onClick={refresh} disabled={!connected || loading} sx={{ height: 28, textTransform: "none" }}>
              {loading ? t("common.loading") : t("common.refresh")}
            </Button>
          </Stack>
          <TextField
            placeholder="Filter..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            size="small"
            InputProps={{ startAdornment: <SearchIcon sx={{ fontSize: 16, color: "text.disabled", mr: 0.5 }} /> }}
            sx={{ "& .MuiInputBase-root": { height: 32, fontSize: 12 } }}
          />
          <Tabs
            value={subTab}
            onChange={(_, v) => setSubTab(v)}
            variant="fullWidth"
            sx={{ minHeight: 32, "& .MuiTab-root": { minHeight: 32, fontSize: 11, fontWeight: 700, textTransform: "none" } }}
          >
            <Tab icon={<LinkIcon fontSize="small" />} iconPosition="start" label={`${t("res.urls")} ${resources.length}`} />
            <Tab icon={<ArticleIcon fontSize="small" />} iconPosition="start" label={`${t("res.templates")} ${templates.length}`} />
          </Tabs>
        </Box>
        {!connected && <Alert severity="info" sx={{ m: 1, py: 0.5, fontSize: 11 }}>{t("common.connectFirst")}</Alert>}
        <Box sx={{ flex: 1, overflow: "auto", p: 0.5 }}>
          {subTab === 0 ? (
            <List dense sx={{ p: 0 }}>
              {filteredResources.map((r) => (
                <ListItemButton key={r.uri} selected={selectedRes?.uri === r.uri} onClick={() => pickResource(r)} sx={{ borderRadius: 1.5, mb: 0.3, "&.Mui-selected": { bgcolor: "primary.main", color: "white", "& .MuiListItemText-secondary": { color: "rgba(255,255,255,0.8)" } } }}>
                  <ListItemText
                    primaryTypographyProps={{ fontSize: 12, fontWeight: 600, lineHeight: 1.2, noWrap: true }}
                    secondaryTypographyProps={{ component: "div" } as any}
                    primary={r.name || r.uri}
                    secondary={
                      <Box>
                        <Typography variant="caption" sx={{ display: "block", wordBreak: "break-all", fontFamily: "monospace", fontSize: 10, color: selectedRes?.uri === r.uri ? "rgba(255,255,255,0.85)" : "text.secondary" }}>
                          {r.uri}
                        </Typography>
                        {r.mimeType && <Chip size="small" label={r.mimeType} sx={{ mt: 0.4, height: 16, fontSize: 9 }} variant="outlined" />}
                      </Box>
                    }
                  />
                </ListItemButton>
              ))}
              {filteredResources.length === 0 && (
                <Box sx={{ p: 2, textAlign: "center" }}>
                  <Typography variant="caption" color="text.secondary">{t("res.none")} — {t("res.listHint")}</Typography>
                </Box>
              )}
            </List>
          ) : (
            <List dense sx={{ p: 0 }}>
              {filteredTemplates.map((tpl) => (
                <ListItemButton key={tpl.uriTemplate} selected={selectedTpl?.uriTemplate === tpl.uriTemplate} onClick={() => pickTemplate(tpl)} sx={{ borderRadius: 1.5, mb: 0.3, "&.Mui-selected": { bgcolor: "secondary.main", color: "white" } }}>
                  <ListItemText
                    primaryTypographyProps={{ fontSize: 12, fontWeight: 600, noWrap: true }}
                    secondaryTypographyProps={{ component: "div" } as any}
                    primary={tpl.name || tpl.uriTemplate}
                    secondary={
                      <Typography variant="caption" sx={{ display: "block", wordBreak: "break-all", fontFamily: "monospace", fontSize: 10, color: selectedTpl?.uriTemplate === tpl.uriTemplate ? "rgba(255,255,255,0.85)" : "text.secondary" }}>
                        {tpl.uriTemplate}
                      </Typography>
                    }
                  />
                </ListItemButton>
              ))}
              {filteredTemplates.length === 0 && (
                <Box sx={{ p: 2, textAlign: "center" }}>
                  <Typography variant="caption" color="text.secondary">{t("res.noneTpl")} — {t("res.listHint")}</Typography>
                </Box>
              )}
            </List>
          )}
        </Box>
      </Paper>

      {/* Center request */}
      <Paper variant="outlined" sx={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 2.5, bgcolor: "background.paper" }}>
        {!hasSelection ? (
          <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", p: 3 }}>
            <Alert severity="info" sx={{ fontSize: 12 }}>{subTab === 0 ? t("res.pickResourceHint") : t("res.pickTemplateHint")}</Alert>
          </Box>
        ) : subTab === 0 && selectedRes ? (
          <>
            <Box sx={{ p: 1.5, borderBottom: 1, borderColor: "divider" }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="h6" sx={{ flex: 1, fontSize: 14, fontWeight: 800, wordBreak: "break-all" }}>{selectedRes.name || selectedRes.uri}</Typography>
                <Chip size="small" label="URL" color="primary" sx={{ height: 20, fontSize: 10, fontWeight: 700 }} />
              </Stack>
              {selectedRes.description && <Typography variant="body2" color="text.secondary" sx={{ fontSize: 11, mt: 0.5 }}>{selectedRes.description}</Typography>}
              {selectedRes.mimeType && <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>mimeType: {selectedRes.mimeType}</Typography>}
            </Box>
            <Box sx={{ flex: 1, overflow: "auto", p: 1.5, display: "flex", flexDirection: "column", gap: 1.25 }}>
              <Accordion expanded={metaOpen} onChange={(_, v) => setMetaOpen(v)} variant="outlined" sx={{ borderRadius: 2, "&:before": { display: "none" } }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />} sx={{ minHeight: 36 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11 }}>Metadata</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ p: 1, pt: 0 }}>
                  <JsonView value={selectedRes} maxHeight={160} />
                </AccordionDetails>
              </Accordion>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: 12 }}>{t("res.read")}</Typography>
              <Stack direction="row" spacing={1}>
                <TextField value={uri} disabled placeholder={t("res.uriPh")} size="small" fullWidth sx={{ "& .MuiInputBase-input": { fontFamily: "monospace", fontSize: 12 } }} />
                <Button variant="contained" onClick={() => read()} disabled={!connected || reading || !uri.trim()} sx={{ textTransform: "none", fontWeight: 700, height: 32, px: 2 }}>
                  {reading ? t("res.reading") : t("res.readBtn")}
                </Button>
              </Stack>
            </Box>
          </>
        ) : selectedTpl ? (
          <>
            <Box sx={{ p: 1.5, borderBottom: 1, borderColor: "divider" }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="h6" sx={{ flex: 1, fontSize: 14, fontWeight: 800, wordBreak: "break-all" }}>{selectedTpl.name || selectedTpl.uriTemplate}</Typography>
                <Chip size="small" label="Template" color="secondary" sx={{ height: 20, fontSize: 10, fontWeight: 700 }} />
              </Stack>
              {selectedTpl.description && <Typography variant="body2" color="text.secondary" sx={{ fontSize: 11, mt: 0.5 }}>{selectedTpl.description}</Typography>}
              <Box sx={{ mt: 1, p: 1, borderRadius: 1.5, bgcolor: "action.hover", fontFamily: "monospace", fontSize: 11, wordBreak: "break-all", border: 1, borderColor: "divider" }}>
                {selectedTpl.uriTemplate}
              </Box>
            </Box>
            <Box sx={{ flex: 1, overflow: "auto", p: 1.5, display: "flex", flexDirection: "column", gap: 1.25 }}>
              <Accordion variant="outlined" sx={{ borderRadius: 2, "&:before": { display: "none" } }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />} sx={{ minHeight: 36 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11 }}>Template metadata</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ p: 1, pt: 0 }}>
                  <JsonView value={selectedTpl} maxHeight={160} />
                </AccordionDetails>
              </Accordion>

              <Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11 }}>{t("res.preview")}</Typography>
              <Stack direction="row" spacing={1}>
                <TextField value={tplPreview} disabled placeholder={selectedTpl.uriTemplate} size="small" fullWidth sx={{ "& .MuiInputBase-input": { fontFamily: "monospace", fontSize: 12 } }} />
                <Button variant="contained" onClick={readTemplate} disabled={!connected || reading || !tplCanRead} sx={{ textTransform: "none", fontWeight: 700, height: 32 }}>
                  {reading ? t("res.reading") : t("res.readBtn")}
                </Button>
              </Stack>
              {!tplCanRead && tplVars.length > 0 && <Typography variant="caption" color="warning.main" sx={{ fontSize: 10 }}>{t("res.missingParams")}</Typography>}

              <Divider sx={{ my: 0.5 }} />
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 700, fontSize: 12 }}>{t("res.params")} {tplVars.length > 0 && `· ${tplVars.length}`}</Typography>
                {tplVars.length > 0 && (
                  <Button size="small" onClick={() => { const cleared: Record<string, string> = {}; for (const v of tplVars) cleared[v] = ""; setTplParams(cleared); setUri(expandUri(selectedTpl.uriTemplate, cleared)); }} sx={{ height: 24, fontSize: 11, textTransform: "none" }}>
                    {t("res.clearParams")}
                  </Button>
                )}
              </Stack>
              {tplVars.length === 0 ? <Alert severity="info" sx={{ py: 0.5, fontSize: 11 }}>{t("res.noParams")}</Alert> : (
                <Grid container spacing={1.25}>
                  {tplVars.map((v) => (
                    <Grid key={v} size={{ xs: 12, sm: 6 }}>
                      <TextField label={v} value={tplParams[v] ?? ""} onChange={(e) => updateTplParam(v, e.target.value)} placeholder={`{${v}}`} size="small" fullWidth required sx={{ "& .MuiInputBase-input": { fontFamily: "monospace", fontSize: 12 } }} />
                    </Grid>
                  ))}
                </Grid>
              )}
            </Box>
          </>
        ) : null}
      </Paper>

      {/* Right result - Postman style */}
      <Paper variant="outlined" sx={{ width: { xs: "100%", lg: 480 }, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 2.5, bgcolor: "background.paper", maxHeight: { xs: 480, lg: "100%" } }}>
        <Box sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: "divider", display: "flex", alignItems: "center", gap: 1, bgcolor: "action.hover" }}>
          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: content ? "success.main" : "text.disabled" }} />
          <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 800, fontSize: 12 }}>Response</Typography>
          <Chip size="small" label={content ? "200 OK" : "—"} color={content ? "success" : "default"} sx={{ height: 20, fontSize: 10, fontWeight: 700 }} />
          <Button size="small" onClick={() => setContent(null)} disabled={!content} sx={{ height: 22, minWidth: 0, px: 1, fontSize: 11, textTransform: "none" }}>Clear</Button>
        </Box>
        <Box sx={{ flex: 1, overflow: "auto", p: 1.25, bgcolor: "background.default" }}>
          {content ? (
            <JsonView defaultExpand value={content} maxHeight={9999} />
          ) : (
            <Box sx={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, color: "text.secondary", py: 6 }}>
              <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: "action.hover", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <LinkIcon sx={{ fontSize: 18, color: "text.disabled" }} />
              </Box>
              <Typography variant="caption" sx={{ fontSize: 11, textAlign: "center", maxWidth: 220 }}>
                {hasSelection ? "Click “Read” to fetch the resource. Response will appear here with collapsible JSON view." : "Select a resource or template to start."}
              </Typography>
            </Box>
          )}
        </Box>
        <Box sx={{ px: 1.25, py: 0.75, borderTop: 1, borderColor: "divider", display: "flex", gap: 1, alignItems: "center", bgcolor: "background.paper" }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, flex: 1 }}>
            {content ? `${JSON.stringify(content).length} bytes` : "No response yet"} {uri && `· ${uri.slice(0, 60)}`}
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}
