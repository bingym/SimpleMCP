import { useEffect, useMemo, useState } from "react";
import { Box, IconButton, Stack, Tooltip, Typography, useTheme } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CodeIcon from "@mui/icons-material/Code";
import DataObjectIcon from "@mui/icons-material/DataObject";
import { JsonView as LiteView, darkStyles, defaultStyles, allExpanded, collapseAllNested } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";
import { pretty } from "../api/mcp";

function tryParseJson(s: string): any | null {
  const t = s.trim();
  if (!t) return null;
  if (!(t.startsWith("{") || t.startsWith("["))) return null;
  try {
    const p = JSON.parse(t);
    if (p !== null && typeof p === "object") return p;
    return null;
  } catch {
    return null;
  }
}

function deepParse(value: any, seen = new WeakSet<object>(), depth = 0): any {
  if (depth > 8) return value;
  if (typeof value === "string") {
    const parsed = tryParseJson(value);
    if (parsed) return deepParse(parsed, seen, depth + 1);
    return value;
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) return value;
    seen.add(value);
    if (Array.isArray(value)) {
      return value.map((v) => deepParse(v, seen, depth + 1));
    }
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = deepParse(v, seen, depth + 1);
    }
    return out;
  }
  return value;
}

export default function JsonView({ value, maxHeight = 420, defaultExpand = false }: { value: any; maxHeight?: number; defaultExpand?: boolean }) {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";
  const [mode, setMode] = useState<"tree" | "raw">("tree");
  const [expandAll, setExpandAll] = useState(defaultExpand);

  const isEmpty = value === null || value === undefined || (typeof value === "string" && value.trim() === "");
  const stringValue = typeof value === "string" ? value : null;
  const parsedFromString = useMemo(() => {
    if (stringValue) return tryParseJson(stringValue);
    return null;
  }, [stringValue]);

  // Effective data for tree view: deep-parse nested JSON strings so inner JSON appears as tree
  const treeData = useMemo(() => {
    const base = parsedFromString ?? value;
    if (base === null || base === undefined) return base;
    if (typeof base === "object") return deepParse(base);
    return base;
  }, [value, parsedFromString]);

  const isTreeable = useMemo(() => {
    if (treeData === null || treeData === undefined) return false;
    return typeof treeData === "object";
  }, [treeData]);

  const rawText = useMemo(() => {
    if (value === null || value === undefined) return String(value);
    if (typeof value === "string") return value;
    return pretty(value);
  }, [value]);

  const shouldExpandNode = useMemo(() => (expandAll ? allExpanded : collapseAllNested), [expandAll]);

  useEffect(() => {
    if (defaultExpand) setExpandAll(true);
  }, [value, defaultExpand]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(rawText);
    } catch {
      // ignore
    }
  }

  // Plain text (non-JSON string) – show as Text block, no viewer
  if (stringValue !== null && !parsedFromString) {
    // if mode is tree but not treeable, keep Text view with toolbar for copy/raw toggle
    if (!isTreeable) {
      return (
        <Box
          sx={{
            border: 1,
            borderColor: "divider",
            borderRadius: 1.5,
            bgcolor: dark ? "#0e0e12" : "#eef0f4",
            color: dark ? "#e8e8ea" : "#1c1c22",
            overflow: "auto",
            maxHeight,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Stack
            direction="row"
            spacing={0.5}
            alignItems="center"
            sx={{
              px: 1,
              py: 0.5,
              borderBottom: 1,
              borderColor: "divider",
              bgcolor: dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
              flexShrink: 0,
            }}
          >
            <Typography variant="caption" color="text.secondary" sx={{ flex: 1, fontSize: 11 }}>
              Text • {rawText.length} chars
            </Typography>
            <Tooltip title="Copy">
              <IconButton size="small" onClick={copy} sx={{ width: 22, height: 22 }}>
                <ContentCopyIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          </Stack>
          <Box
            component="pre"
            sx={{
              m: 0,
              p: 1.5,
              fontSize: 12,
              lineHeight: 1.6,
              fontFamily: '"JetBrains Mono", monospace',
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {rawText || "(empty)"}
          </Box>
        </Box>
      );
    }
  }

  if (isEmpty) {
    return (
      <Box
        sx={{
          p: 1.5,
          borderRadius: 1.5,
          border: 1,
          borderColor: "divider",
          bgcolor: dark ? "#0e0e12" : "#eef0f4",
          color: "text.secondary",
          fontSize: 12,
          fontFamily: '"JetBrains Mono", monospace',
          maxHeight,
          overflow: "auto",
        }}
      >
        {value === null ? "null" : value === undefined ? "undefined" : "(empty)"}
      </Box>
    );
  }

  // For treeable data, show mature viewer; for non-treeable fallback handled above
  const style = dark ? darkStyles : defaultStyles;

  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1.5,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        maxHeight,
        bgcolor: dark ? "#0e0e12" : "#fff",
      }}
    >
      <Stack
        direction="row"
        spacing={0.5}
        alignItems="center"
        sx={{
          px: 0.8,
          py: 0.4,
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
          flexShrink: 0,
        }}
      >
        <DataObjectIcon sx={{ fontSize: 14, color: isTreeable ? "#7c4dff" : "text.secondary" }} />
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {isTreeable ? "JSON" : "Raw"} •{" "}
          {isTreeable && typeof treeData === "object" && treeData !== null
            ? Array.isArray(treeData)
              ? `${treeData.length} items`
              : `${Object.keys(treeData).length} keys`
            : `${rawText.length} chars`}
        </Typography>
        {isTreeable && (
          <>
            <Tooltip title={expandAll ? "Collapse all" : "Expand all"}>
              <IconButton
                size="small"
                onClick={() => setExpandAll((v) => !v)}
                sx={{
                  width: 22,
                  height: 22,
                  border: 1,
                  borderColor: "divider",
                  fontSize: 10,
                }}
              >
                <Typography variant="caption" sx={{ fontSize: 9, lineHeight: 1, fontWeight: 700 }}>
                  {expandAll ? "−" : "+"}
                </Typography>
              </IconButton>
            </Tooltip>
            <Tooltip title={mode === "tree" ? "Show raw JSON" : "Show tree"}>
              <IconButton size="small" onClick={() => setMode(mode === "tree" ? "raw" : "tree")} sx={{ width: 22, height: 22 }}>
                {mode === "tree" ? <CodeIcon sx={{ fontSize: 14 }} /> : <DataObjectIcon sx={{ fontSize: 14 }} />}
              </IconButton>
            </Tooltip>
          </>
        )}
        <Tooltip title="Copy">
          <IconButton size="small" onClick={copy} sx={{ width: 22, height: 22 }}>
            <ContentCopyIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Stack>

      <Box
        sx={{
          overflow: "auto",
          flex: 1,
          // Override viewer container backgrounds to match our theme
          "& ._2IvMF, & ._11RoI, & ._GzYRV": {
            background: `${dark ? "#0e0e12" : "#fff"} !important`,
          },
          "& ._GzYRV": {
            fontFamily: '"JetBrains Mono", monospace !important',
            fontSize: "12px !important",
            lineHeight: "1.6 !important",
            padding: "8px !important",
          },
          // Improve readability: ensure long strings wrap
          "& ._vGjyY": {
            wordBreak: "break-all",
            whiteSpace: "pre-wrap",
          },
        }}
      >
        {mode === "raw" || !isTreeable ? (
          <Box
            component="pre"
            sx={{
              m: 0,
              p: 1.2,
              fontSize: 12,
              lineHeight: 1.6,
              fontFamily: '"JetBrains Mono", monospace',
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              color: dark ? "#e8e8ea" : "#1c1c22",
            }}
          >
            {rawText}
          </Box>
        ) : (
          <LiteView data={treeData} style={style} shouldExpandNode={shouldExpandNode} clickToExpandNode={false} />
        )}
      </Box>
    </Box>
  );
}
