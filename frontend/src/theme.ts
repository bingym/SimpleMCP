import { createTheme, type PaletteMode } from "@mui/material/styles";

export function buildTheme(mode: PaletteMode) {
  const dark = mode === "dark";
  return createTheme({
    palette: {
      mode,
      primary: { main: dark ? "#7dd3fc" : "#0369a1" },
      secondary: { main: dark ? "#fbbf24" : "#b45309" },
      ...(dark
        ? { background: { default: "#121214", paper: "#1b1b1f" } }
        : { background: { default: "#f5f6f8", paper: "#ffffff" } }),
    },
    shape: { borderRadius: 8 },
    typography: {
      fontFamily:
        '"Inter", "Roboto", "Helvetica Neue", -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
      fontSize: 13,
    },
    components: {
      MuiTextField: { defaultProps: { size: "small", fullWidth: true } },
      MuiButton: { defaultProps: { size: "small" } },
      MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
    },
  });
}
