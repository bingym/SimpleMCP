import { useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DeleteIcon from "@mui/icons-material/Delete";
import { mcpApi, type HistoryEntry } from "../api/mcp";
import { useSettings } from "../settings";
import JsonView from "./JsonView";

interface Props {
  entries: HistoryEntry[];
  onRefresh: () => void;
  onClear: () => void;
}

export default function HistoryTab({ entries, onRefresh, onClear }: Props) {
  const { t } = useSettings();
  const [clearing, setClearing] = useState(false);

  async function clear() {
    setClearing(true);
    try {
      await mcpApi.clearHistory();
      onClear();
    } finally {
      setClearing(false);
    }
  }

  const reversed = [...entries].reverse();

  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="subtitle2" sx={{ flex: 1 }}>{t("hist.title", { n: entries.length })}</Typography>
        <Button size="small" onClick={onRefresh}>{t("common.refresh")}</Button>
        <Button size="small" color="warning" startIcon={<DeleteIcon />} onClick={clear} disabled={clearing}>
          {t("hist.clear")}
        </Button>
      </Stack>
      {reversed.length === 0 && (
        <Typography variant="body2" color="text.secondary">{t("hist.empty")}</Typography>
      )}
      <Box sx={{ maxHeight: 620, overflow: "auto" }}>
        {reversed.map((e) => (
          <Accordion key={e.id} disableGutters>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ width: "100%", pr: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90 }}>{e.time}</Typography>
                <Typography variant="body2" sx={{ flex: 1, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {e.method}
                </Typography>
                <Chip size="small" label={`${e.durationMs}ms`} variant="outlined" />
                {e.error ? <Chip size="small" color="error" label="error" /> : <Chip size="small" color="success" label="ok" />}
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={1}>
                {e.error && <Typography variant="body2" color="error">{e.error}</Typography>}
                <Typography variant="caption" color="text.secondary">{t("common.request")}</Typography>
                <JsonView value={e.request} maxHeight={240} />
                <Typography variant="caption" color="text.secondary">{t("common.response")}</Typography>
                <JsonView value={e.response} maxHeight={320} />
              </Stack>
            </AccordionDetails>
          </Accordion>
        ))}
      </Box>
    </Stack>
  );
}
