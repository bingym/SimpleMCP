// Package config persists user settings (theme, locale, server presets)
// to ~/.config/simplemcp/config.json. The directory is created on demand.
package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// Preset is a saved MCP server connection configuration.
type Preset struct {
	Name      string `json:"name"`
	Transport string `json:"transport"`
	Command   string `json:"command"`
	Args      string `json:"args"`
	Env       string `json:"env"`
	Cwd       string `json:"cwd"`
	URL       string `json:"url"`
	Headers   string `json:"headers"`
}

// AppConfig is the full user configuration file content.
type AppConfig struct {
	Theme   string   `json:"theme"`
	Locale  string   `json:"locale"`
	Presets []Preset `json:"presets"`
}

func defaultConfig() AppConfig {
	return AppConfig{Theme: "dark", Locale: "zh", Presets: []Preset{}}
}

// ConfigPath returns ~/.config/simplemcp/config.json.
func ConfigPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve home dir: %w", err)
	}
	return filepath.Join(home, ".config", "simplemcp", "config.json"), nil
}

// Store is a thread-safe, file-backed config store.
type Store struct {
	mu   sync.Mutex
	path string // empty means memory-only (no persistence)
	cfg  AppConfig
}

// NewStore loads the config file, creating it (and its directory) on first save.
// A missing file is not an error; defaults are used.
func NewStore() (*Store, error) {
	path, err := ConfigPath()
	if err != nil {
		return nil, err
	}
	s := &Store{path: path, cfg: defaultConfig()}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return s, nil
		}
		return nil, fmt.Errorf("read config: %w", err)
	}
	var loaded AppConfig
	if err := json.Unmarshal(data, &loaded); err != nil {
		return nil, fmt.Errorf("parse config %s: %w", path, err)
	}
	s.cfg = sanitize(loaded)
	return s, nil
}

// NewMemoryStore returns a store that never touches disk (fallback).
func NewMemoryStore() *Store {
	return &Store{cfg: defaultConfig()}
}

func sanitize(c AppConfig) AppConfig {
	if c.Theme != "light" && c.Theme != "dark" {
		c.Theme = "dark"
	}
	if c.Locale != "zh" && c.Locale != "en" {
		c.Locale = "zh"
	}
	if c.Presets == nil {
		c.Presets = []Preset{}
	}
	return c
}

// Exists reports whether the config file already exists on disk.
func (s *Store) Exists() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.path == "" {
		return false
	}
	_, err := os.Stat(s.path)
	return err == nil
}

// Get returns a copy of the current config.
func (s *Store) Get() AppConfig {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := s.cfg
	out.Presets = append([]Preset{}, s.cfg.Presets...)
	return out
}

// SetTheme updates the theme ("light"|"dark") and persists it.
func (s *Store) SetTheme(theme string) (AppConfig, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if theme != "light" && theme != "dark" {
		return s.copyLocked(), fmt.Errorf("invalid theme %q (want light|dark)", theme)
	}
	s.cfg.Theme = theme
	if err := s.saveLocked(); err != nil {
		return s.copyLocked(), err
	}
	return s.copyLocked(), nil
}

// SetLocale updates the locale ("zh"|"en") and persists it.
func (s *Store) SetLocale(locale string) (AppConfig, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if locale != "zh" && locale != "en" {
		return s.copyLocked(), fmt.Errorf("invalid locale %q (want zh|en)", locale)
	}
	s.cfg.Locale = locale
	if err := s.saveLocked(); err != nil {
		return s.copyLocked(), err
	}
	return s.copyLocked(), nil
}

// SetPresets replaces the saved presets and persists them.
func (s *Store) SetPresets(presets []Preset) (AppConfig, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if presets == nil {
		presets = []Preset{}
	}
	s.cfg.Presets = presets
	if err := s.saveLocked(); err != nil {
		return s.copyLocked(), err
	}
	return s.copyLocked(), nil
}

func (s *Store) copyLocked() AppConfig {
	out := s.cfg
	out.Presets = append([]Preset{}, s.cfg.Presets...)
	return out
}

// saveLocked writes the config atomically (tmp file + rename).
// The directory is created if missing. A memory-only store skips disk I/O.
func (s *Store) saveLocked() error {
	if s.path == "" {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return fmt.Errorf("create config dir: %w", err)
	}
	// 0600: presets may contain secrets (e.g. API keys in env).
	data, err := json.MarshalIndent(s.cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("encode config: %w", err)
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return fmt.Errorf("write config: %w", err)
	}
	if err := os.Rename(tmp, s.path); err != nil {
		return fmt.Errorf("commit config: %w", err)
	}
	return nil
}
