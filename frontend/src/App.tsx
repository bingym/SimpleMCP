import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  AppBar,
  Box,
  Button,
  CssBaseline,
  Drawer,
  IconButton,
  Paper,
  Snackbar,
  Tab,
  Tabs,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import PingIcon from "@mui/icons-material/NetworkPing";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import TranslateIcon from "@mui/icons-material/Translate";
import BuildIcon from "@mui/icons-material/Build";
import TimelineIcon from "@mui/icons-material/Timeline";
import ConnectionPanel from "./components/ConnectionPanel";
import ToolsTab from "./components/ToolsTab";
import ResourcesTab from "./components/ResourcesTab";
import PromptsTab from "./components/PromptsTab";
import HistoryTab from "./components/HistoryTab";
import JsonView from "./components/JsonView";
import { mcpApi, type ConnectionStatus, type HistoryEntry } from "./api/mcp";
import { EventsOn } from "../wailsjs/runtime/runtime";
import { useSettings } from "./settings";
import { buildTheme } from "./theme";
import logo from "./assets/images/logo.svg";

const DRAWER_WIDTH = 336;

function Main() {
  const { mode, locale, toggleMode, toggleLocale, t } = useSettings();
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [pingResult, setPingResult] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const wide = useMediaQuery("(min-width:1100px)");

  const connected = !!status?.connected;

  const showError = useCallback((msg: string) => setError(msg), []);

  const refreshHistory = useCallback(async () => {
    try {
      setHistory(await mcpApi.history());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    mcpApi.status().then(setStatus).catch(() => {});
    refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    const offHistory = EventsOn("mcp:history", () => refreshHistory());
    const offNotif = EventsOn("mcp:notification", (n: any) =>
      setNotifications((prev) => [n, ...prev].slice(0, 50)),
    );
    const offStatus = EventsOn("mcp:status", (s: any) => setStatus(s as ConnectionStatus));
    return () => {
      offHistory();
      offNotif();
      offStatus();
    };
  }, [refreshHistory]);

  async function ping() {
    try {
      const r = await mcpApi.ping();
      setPingResult(`${r} · ${new Date().toLocaleTimeString()}`);
      refreshHistory();
    } catch (e: any) {
      showError(e?.message ?? String(e));
    }
  }

  // Availability of MCP features – null = unknown (show), false = hide, true = show
  const [toolAvail, setToolAvail] = useState<boolean | null>(null);
  const [resAvail, setResAvail] = useState<boolean | null>(null);
  const [promptAvail, setPromptAvail] = useState<boolean | null>(null);

  useEffect(() => {
    if (!connected) {
      setToolAvail(null);
      setResAvail(null);
      setPromptAvail(null);
      return;
    }
    const caps: any = (status?.server as any)?.capabilities;
    if (caps) {
      // capabilities present – use them as initial signal
      if (caps.tools === false) setToolAvail(false);
      else if (caps.tools === true) setToolAvail(true);
      if (caps.resources === false) setResAvail(false);
      else if (caps.resources === true) setResAvail(true);
      if (caps.prompts === false) setPromptAvail(false);
      else if (caps.prompts === true) setPromptAvail(true);
    }
  }, [connected, status]);

  const handleToolAvail = useCallback((available: boolean) => setToolAvail(available), []);
  const handleResAvail = useCallback((available: boolean) => setResAvail(available), []);
  const handlePromptAvail = useCallback((available: boolean) => setPromptAvail(available), []);

  const workspaceTabs = useMemo(() => {
    const tabs: { key: string; label: string; avail: boolean | null; node: React.ReactNode }[] = [
      {
        key: "tools",
        label: t("tab.tools"),
        avail: toolAvail,
        node: <ToolsTab connected={connected} onError={showError} onAvailable={handleToolAvail} />,
      },
      {
        key: "resources",
        label: t("tab.resources"),
        avail: resAvail,
        node: <ResourcesTab connected={connected} onError={showError} onAvailable={handleResAvail} />,
      },
      {
        key: "prompts",
        label: t("tab.prompts"),
        avail: promptAvail,
        node: <PromptsTab connected={connected} onError={showError} onAvailable={handlePromptAvail} />,
      },
    ];
    return tabs;
  }, [t, connected, showError, handleToolAvail, handleResAvail, handlePromptAvail]);

  const visibleWorkspaceTabs = useMemo(() => {
    // when not connected, show all (avail null treated as true)
    if (!connected) return workspaceTabs;
    return workspaceTabs.filter((x) => x.avail !== false);
  }, [workspaceTabs, connected]);

  const [section, setSection] = useState<"workspace" | "activity">("workspace");
  const [workspaceKey, setWorkspaceKey] = useState<string>("tools");
  const [activityKey, setActivityKey] = useState<"history" | "notifications">("history");

  // Keep selected tab valid when visibility changes
  useEffect(() => {
    if (!visibleWorkspaceTabs.find((x) => x.key === workspaceKey)) {
      setWorkspaceKey(visibleWorkspaceTabs[0]?.key ?? "tools");
    }
  }, [visibleWorkspaceTabs, workspaceKey]);

  const activeNode = useMemo(() => {
    if (section === "workspace") return visibleWorkspaceTabs.find((x) => x.key === workspaceKey)?.node;
    if (activityKey === "history") return <HistoryTab entries={history} onRefresh={refreshHistory} onClear={() => setHistory([])} />;
    return notifications.length === 0 ? <Alert severity="info">{t("notify.empty")}</Alert> : <JsonView value={notifications} maxHeight={640} />;
  }, [section, visibleWorkspaceTabs, workspaceKey, activityKey, history, refreshHistory, notifications, t]);

  const panel = (
    <Box sx={{ p: 2, pb: 3, display: "flex", flexDirection: "column", gap: 1.5 }}>
      <ConnectionPanel status={status} onStatus={setStatus} onError={showError} />
    </Box>
  );

  return (
    <Box sx={{ display: "flex", height: "100vh", bgcolor: "background.default" }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          zIndex: 1300,
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
          color: "text.primary",
        }}
      >
        <Toolbar variant="dense" sx={{ minHeight: 48, gap: 1 }}>
          {!wide && (
            <IconButton onClick={() => setDrawerOpen(true)} size="small" sx={{ mr: 0.5 }}>
              <MenuIcon fontSize="small" />
            </IconButton>
          )}
          <Box component="img" src={logo} alt="SimpleMCP logo" sx={{ width: 26, height: 26, borderRadius: 1.5 }} />
          <Typography variant="subtitle1" sx={{ fontWeight: 800, letterSpacing: 0, flex: 1, fontSize: 14 }}>
            SimpleMCP{" "}
            <Typography component="span" variant="caption" color="text.secondary" sx={{ fontWeight: 400, ml: 0.5 }}>
              · {t("app.subtitle")}
            </Typography>
          </Typography>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              px: 1,
              py: 0.3,
              borderRadius: 1.5,
              bgcolor: connected ? "success.main" : "action.hover",
              color: connected ? "white" : "text.secondary",
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: connected ? "white" : "text.disabled" }} />
            {connected ? "Connected" : "Disconnected"}
          </Box>
          <Button
            size="small"
            variant="outlined"
            startIcon={<PingIcon fontSize="small" />}
            onClick={ping}
            disabled={!connected}
            sx={{ ml: 1, height: 28, textTransform: "none" }}
          >
            {t("toolbar.ping")}
          </Button>
          {pingResult && (
            <Typography variant="caption" color="success.main" sx={{ ml: 0.5, display: { xs: "none", md: "block" } }}>
              {pingResult}
            </Typography>
          )}
          <Tooltip title={t("toolbar.toggleTheme")}>
            <IconButton onClick={toggleMode} size="small" sx={{ ml: 0.5, border: 1, borderColor: "divider" }}>
              {mode === "dark" ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Tooltip title={t("toolbar.toggleLang")}>
            <Button
              size="small"
              variant="text"
              startIcon={<TranslateIcon fontSize="small" />}
              onClick={toggleLocale}
              sx={{ minWidth: 0, textTransform: "none" }}
            >
              {locale === "zh" ? "EN" : "中文"}
            </Button>
          </Tooltip>
        </Toolbar>
      </AppBar>

      {wide ? (
        <Box
          sx={{
            width: DRAWER_WIDTH,
            flexShrink: 0,
            mt: "48px",
            borderRight: 1,
            borderColor: "divider",
            overflow: "auto",
            bgcolor: "background.paper",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Box sx={{ px: 2, pt: 1.5, pb: 0.5 }}>
            <Typography variant="overline" color="text.secondary" sx={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.1 }}>
              CONNECTION WORKSPACE
            </Typography>
          </Box>
          {panel}
        </Box>
      ) : (
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
          <Box sx={{ width: DRAWER_WIDTH, pt: 1 }}>{panel}</Box>
        </Drawer>
      )}

      <Box sx={{ flex: 1, mt: "48px", display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        <Paper square elevation={0} sx={{ borderBottom: 1, borderColor: "divider", bgcolor: "background.paper" }}>
          <Tabs
            value={section}
            onChange={(_, value) => {
              setSection(value);
              if (value === "activity" && activityKey === "history") refreshHistory();
            }}
            sx={{ px: 1.5, minHeight: 38, borderBottom: 1, borderColor: "divider", "& .MuiTab-root": { minHeight: 38, textTransform: "none", fontWeight: 800, fontSize: 12, px: 1.5 } }}
          >
            <Tab value="workspace" icon={<BuildIcon sx={{ fontSize: 16 }} />} iconPosition="start" label={t("nav.workspace")} />
            <Tab value="activity" icon={<TimelineIcon sx={{ fontSize: 16 }} />} iconPosition="start" label={t("nav.activity")} />
          </Tabs>
          <Tabs
            value={section === "workspace" ? workspaceKey : activityKey}
            onChange={(_, value) => {
              if (section === "workspace") setWorkspaceKey(value);
              else {
                setActivityKey(value);
                if (value === "history") refreshHistory();
              }
            }}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              px: 1.5,
              minHeight: 46,
              "& .MuiTab-root": { minHeight: 46, textTransform: "none", fontWeight: 700, fontSize: 12, px: 1.5 },
            }}
          >
            {section === "workspace" ? visibleWorkspaceTabs.map((x) => <Tab key={x.key} value={x.key} label={x.label} />) : (
              <>
                <Tab value="history" label={t("tab.history", { n: history.length })} />
                <Tab value="notifications" label={t("tab.notifications", { n: notifications.length })} />
              </>
            )}
          </Tabs>
        </Paper>
        <Box sx={{ p: 0, overflow: "hidden", flex: 1, display: "flex", flexDirection: "column", bgcolor: "background.default" }}>
          <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>{activeNode}</Box>
        </Box>
      </Box>

      <Snackbar open={!!error} autoHideDuration={6000} onClose={() => setError("")} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity="error" onClose={() => setError("")}>
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default function App() {
  const { mode } = useSettings();
  const theme = useMemo(() => buildTheme(mode), [mode]);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Main />
    </ThemeProvider>
  );
}
