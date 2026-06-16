package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"wren/internal/models"
)

type Store struct {
	dir string
}

func New() (*Store, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	dir := filepath.Join(home, ".apiclient")
	for _, sub := range []string{"workspaces", "environments", "history"} {
		if err := os.MkdirAll(filepath.Join(dir, sub), 0755); err != nil {
			return nil, err
		}
	}
	return &Store{dir: dir}, nil
}

func (s *Store) ListWorkspaces() ([]models.Workspace, error) {
	entries, err := os.ReadDir(filepath.Join(s.dir, "workspaces"))
	if err != nil {
		return nil, err
	}
	var out []models.Workspace
	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		ws, err := s.GetWorkspace(strings.TrimSuffix(e.Name(), ".json"))
		if err != nil {
			continue
		}
		out = append(out, ws)
	}
	if out == nil {
		out = []models.Workspace{}
	}
	return out, nil
}

func (s *Store) GetWorkspace(id string) (models.Workspace, error) {
	data, err := os.ReadFile(filepath.Join(s.dir, "workspaces", id+".json"))
	if err != nil {
		return models.Workspace{}, err
	}
	var ws models.Workspace
	return ws, json.Unmarshal(data, &ws)
}

func (s *Store) SaveWorkspace(ws models.Workspace) error {
	data, err := json.MarshalIndent(ws, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(s.dir, "workspaces", ws.ID+".json"), data, 0644)
}

func (s *Store) DeleteWorkspace(id string) error {
	return os.Remove(filepath.Join(s.dir, "workspaces", id+".json"))
}

func (s *Store) ListEnvironments() ([]models.Environment, error) {
	entries, err := os.ReadDir(filepath.Join(s.dir, "environments"))
	if err != nil {
		return nil, err
	}
	var out []models.Environment
	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		env, err := s.GetEnvironment(strings.TrimSuffix(e.Name(), ".json"))
		if err != nil {
			continue
		}
		out = append(out, env)
	}
	if out == nil {
		out = []models.Environment{}
	}
	return out, nil
}

func (s *Store) GetEnvironment(id string) (models.Environment, error) {
	data, err := os.ReadFile(filepath.Join(s.dir, "environments", id+".json"))
	if err != nil {
		return models.Environment{}, err
	}
	var env models.Environment
	return env, json.Unmarshal(data, &env)
}

func (s *Store) SaveEnvironment(env models.Environment) error {
	data, err := json.MarshalIndent(env, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(s.dir, "environments", env.ID+".json"), data, 0644)
}

func (s *Store) DeleteEnvironment(id string) error {
	return os.Remove(filepath.Join(s.dir, "environments", id+".json"))
}

func (s *Store) AppendHistory(entry models.HistoryEntry) error {
	path := filepath.Join(s.dir, "history", time.Now().Format("2006-01-02")+".log")
	data, err := json.Marshal(entry)
	if err != nil {
		return err
	}
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = fmt.Fprintf(f, "%s\n", data)
	return err
}

func (s *Store) GetHistory(date string) ([]models.HistoryEntry, error) {
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}
	data, err := os.ReadFile(filepath.Join(s.dir, "history", date+".log"))
	if err != nil {
		if os.IsNotExist(err) {
			return []models.HistoryEntry{}, nil
		}
		return nil, err
	}
	var out []models.HistoryEntry
	for _, line := range strings.Split(strings.TrimSpace(string(data)), "\n") {
		if line == "" {
			continue
		}
		var e models.HistoryEntry
		if json.Unmarshal([]byte(line), &e) == nil {
			out = append(out, e)
		}
	}
	if out == nil {
		out = []models.HistoryEntry{}
	}
	return out, nil
}
