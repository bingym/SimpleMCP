import { createTheme, type PaletteMode } from "@mui/material/styles";

export function buildTheme(mode: PaletteMode) {
  const dark = mode === "dark";
  return createTheme({
    palette: {
      mode,
      primary: { main: "#7c4dff" },
      secondary: { main: "#00e5ff" },
      ...(dark
        ? { background: { default: "#121214", paper: "#1b1b1f" } }
        : { background: { default: "#f5f6f8", paper: "#ffffff" } }),
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily:
        '"Inter", "Roboto", "Helvetica Neue", -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
      fontSize: 13,
    },
    components: {
      MuiTextField: { defaultProps: { size: "small", fullWidth: true } },
      MuiButton: { defaultProps: { size: "small" } },
    },
  });
}
