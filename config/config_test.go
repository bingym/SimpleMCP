package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestConfigPath(t *testing.T) {
	p, err := ConfigPath()
	if err != nil {
		t.Fatalf("ConfigPath: %v", err)
	}
	want := filepath.Join(os.Getenv("HOME"), ".config", "simplemcp", "config.json")
	if p != want {
		t.Fatalf("got %q, want %q", p, want)
	}
}

// TestStoreRoundTrip verifies file persistence using an isolated HOME.
func TestStoreRoundTrip(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	s, err := NewStore()
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	if got := s.Get(); got.Theme != "dark" || got.Locale != "zh" || len(got.Presets) != 0 {
		t.Fatalf("unexpected defaults: %+v", got)
	}

	if _, err := s.SetTheme("light"); err != nil {
		t.Fatalf("SetTheme: %v", err)
	}
	if _, err := s.SetLocale("en"); err != nil {
		t.Fatalf("SetLocale: %v", err)
	}
	presets := []Preset{{Name: "demo", Transport: "stdio", Command: "npx", Args: "-y x"}}
	if _, err := s.SetPresets(presets); err != nil {
		t.Fatalf("SetPresets: %v", err)
	}

	path, _ := ConfigPath()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("config file was not created at %s: %v", path, err)
	}
	t.Logf("config file content:\n%s", data)

	// Reload from disk and verify.
	s2, err := NewStore()
	if err != nil {
		t.Fatalf("reload NewStore: %v", err)
	}
	got := s2.Get()
	if got.Theme != "light" || got.Locale != "en" {
		t.Fatalf("theme/locale not persisted: %+v", got)
	}
	if len(got.Presets) != 1 || got.Presets[0].Name != "demo" {
		t.Fatalf("presets not persisted: %+v", got.Presets)
	}

	// Invalid values are rejected.
	if _, err := s2.SetTheme("blue"); err == nil {
		t.Fatal("expected error for invalid theme")
	}
	if _, err := s2.SetLocale("fr"); err == nil {
		t.Fatal("expected error for invalid locale")
	}

	// Corrupt file is reported, not silently ignored.
	if err := os.WriteFile(path, []byte("{invalid"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := NewStore(); err == nil {
		t.Fatal("expected error for corrupt config file")
	}
}
