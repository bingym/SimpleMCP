import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { translate, type Locale, type StrKey } from "./i18n";
import { mcpApi } from "./api/mcp";

export type ThemeMode = "light" | "dark";

// localStorage is kept as a fast cache / fallback; the source of truth is
// ~/.config/simplemcp/config.json managed by the Go backend.
const THEME_KEY = "simplemcp.theme";
const LOCALE_KEY = "simplemcp.locale";

function loadTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* ignore */
  }
  return "dark";
}

function loadLocale(): Locale {
  try {
    const v = localStorage.getItem(LOCALE_KEY);
    if (v === "zh" || v === "en") return v;
    const nav = navigator.language.toLowerCase();
    if (nav.startsWith("en")) return "en";
  } catch {
    /* ignore */
  }
  return "zh";
}

function cache(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

interface Settings {
  mode: ThemeMode;
  locale: Locale;
  toggleMode: () => void;
  setLocale: (l: Locale) => void;
  toggleLocale: () => void;
  t: (key: StrKey, params?: Record<string, string | number>) => string;
}

const SettingsContext = createContext<Settings | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(loadTheme);
  const [locale, setLocaleState] = useState<Locale>(loadLocale);

  // On startup the config file wins over the cache. If the file does not
  // exist yet (first launch after migrating to file-based config), seed it
  // from the localStorage cache instead of clobbering local state.
  useEffect(() => {
    mcpApi
      .configExists()
      .then((exists) => {
        if (!exists) {
          mcpApi.setTheme(loadTheme()).catch(() => {});
          mcpApi.setLocale(loadLocale()).catch(() => {});
          return;
        }
        return mcpApi
          .getConfig()
          .then((cfg) => {
            if (cfg.theme === "light" || cfg.theme === "dark") {
              setMode(cfg.theme);
              cache(THEME_KEY, cfg.theme);
            }
            if (cfg.locale === "zh" || cfg.locale === "en") {
              setLocaleState(cfg.locale);
              cache(LOCALE_KEY, cfg.locale);
            }
          })
          .catch(() => {
            /* keep cache */
          });
      })
      .catch(() => {
        /* backend unavailable (e.g. plain vite preview): keep cache */
      });
  }, []);

  const toggleMode = useCallback(() => {
    setMode((m) => {
      const next = m === "dark" ? "light" : "dark";
      cache(THEME_KEY, next);
      mcpApi.setTheme(next).catch(() => {
        /* keep local state; file write failed */
      });
      return next;
    });
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    cache(LOCALE_KEY, l);
    mcpApi.setLocale(l).catch(() => {
      /* keep local state; file write failed */
    });
  }, []);

  const toggleLocale = useCallback(() => {
    setLocaleState((l) => {
      const next = l === "zh" ? "en" : "zh";
      cache(LOCALE_KEY, next);
      mcpApi.setLocale(next).catch(() => {
        /* keep local state; file write failed */
      });
      return next;
    });
  }, []);

  const t = useCallback(
    (key: StrKey, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale],
  );

  return (
    <SettingsContext.Provider value={{ mode, locale, toggleMode, setLocale, toggleLocale, t }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): Settings {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
