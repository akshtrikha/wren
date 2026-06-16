package main

import (
	"embed"
	"encoding/json"
	"io/fs"
	"log"
	"net/http"
	"os"
	"time"

	"wren/internal/curl"
	"wren/internal/models"
	"wren/internal/postman"
	"wren/internal/proxy"
	"wren/internal/storage"
	"wren/internal/uid"
)

//go:embed frontend
var frontendFS embed.FS

func main() {
	store, err := storage.New()
	if err != nil {
		log.Fatal(err)
	}

	sub, err := fs.Sub(frontendFS, "frontend")
	if err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()

	// Static frontend
	mux.Handle("GET /", http.FileServerFS(sub))

	// ── Workspaces ──────────────────────────────────────────────────────────
	mux.HandleFunc("GET /api/workspaces", func(w http.ResponseWriter, r *http.Request) {
		list, err := store.ListWorkspaces()
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		writeJSON(w, list)
	})

	mux.HandleFunc("POST /api/workspaces", func(w http.ResponseWriter, r *http.Request) {
		var ws models.Workspace
		if err := json.NewDecoder(r.Body).Decode(&ws); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		now := time.Now()
		if ws.ID == "" {
			ws.ID = uid.New()
		}
		if ws.CreatedAt.IsZero() {
			ws.CreatedAt = now
		}
		ws.UpdatedAt = now
		if ws.Requests == nil {
			ws.Requests = []models.Request{}
		}
		if ws.Folders == nil {
			ws.Folders = []models.Folder{}
		}
		if err := store.SaveWorkspace(ws); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		w.WriteHeader(201)
		writeJSON(w, ws)
	})

	mux.HandleFunc("GET /api/workspaces/{id}", func(w http.ResponseWriter, r *http.Request) {
		ws, err := store.GetWorkspace(r.PathValue("id"))
		if err != nil {
			if os.IsNotExist(err) {
				http.NotFound(w, r)
				return
			}
			http.Error(w, err.Error(), 500)
			return
		}
		writeJSON(w, ws)
	})

	mux.HandleFunc("PUT /api/workspaces/{id}", func(w http.ResponseWriter, r *http.Request) {
		var ws models.Workspace
		if err := json.NewDecoder(r.Body).Decode(&ws); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		ws.ID = r.PathValue("id")
		ws.UpdatedAt = time.Now()
		if err := store.SaveWorkspace(ws); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		writeJSON(w, ws)
	})

	mux.HandleFunc("DELETE /api/workspaces/{id}", func(w http.ResponseWriter, r *http.Request) {
		if err := store.DeleteWorkspace(r.PathValue("id")); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		w.WriteHeader(204)
	})

	// ── Environments ─────────────────────────────────────────────────────────
	mux.HandleFunc("GET /api/environments", func(w http.ResponseWriter, r *http.Request) {
		list, err := store.ListEnvironments()
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		writeJSON(w, list)
	})

	mux.HandleFunc("POST /api/environments", func(w http.ResponseWriter, r *http.Request) {
		var env models.Environment
		if err := json.NewDecoder(r.Body).Decode(&env); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		now := time.Now()
		if env.ID == "" {
			env.ID = uid.New()
		}
		if env.CreatedAt.IsZero() {
			env.CreatedAt = now
		}
		env.UpdatedAt = now
		if env.Variables == nil {
			env.Variables = map[string]string{}
		}
		if err := store.SaveEnvironment(env); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		w.WriteHeader(201)
		writeJSON(w, env)
	})

	mux.HandleFunc("GET /api/environments/{id}", func(w http.ResponseWriter, r *http.Request) {
		env, err := store.GetEnvironment(r.PathValue("id"))
		if err != nil {
			if os.IsNotExist(err) {
				http.NotFound(w, r)
				return
			}
			http.Error(w, err.Error(), 500)
			return
		}
		writeJSON(w, env)
	})

	mux.HandleFunc("PUT /api/environments/{id}", func(w http.ResponseWriter, r *http.Request) {
		var env models.Environment
		if err := json.NewDecoder(r.Body).Decode(&env); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		env.ID = r.PathValue("id")
		env.UpdatedAt = time.Now()
		if err := store.SaveEnvironment(env); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		writeJSON(w, env)
	})

	mux.HandleFunc("DELETE /api/environments/{id}", func(w http.ResponseWriter, r *http.Request) {
		if err := store.DeleteEnvironment(r.PathValue("id")); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		w.WriteHeader(204)
	})

	// ── Send ─────────────────────────────────────────────────────────────────
	mux.HandleFunc("POST /api/send", func(w http.ResponseWriter, r *http.Request) {
		var sr models.SendRequest
		if err := json.NewDecoder(r.Body).Decode(&sr); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		resp := proxy.Execute(sr.Request, sr.Environment)
		go store.AppendHistory(models.HistoryEntry{
			Timestamp: time.Now(),
			Request:   sr.Request,
			Response:  resp,
		})
		writeJSON(w, resp)
	})

	// ── Import / Export ───────────────────────────────────────────────────────
	mux.HandleFunc("POST /api/import/curl", curl.Import)

	mux.HandleFunc("POST /api/export/curl", func(w http.ResponseWriter, r *http.Request) {
		var req models.Request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		writeJSON(w, map[string]string{"curl": curl.Export(req)})
	})

	mux.HandleFunc("POST /api/import/postman", postman.Import(store))

	// ── History ───────────────────────────────────────────────────────────────
	mux.HandleFunc("GET /api/history", func(w http.ResponseWriter, r *http.Request) {
		entries, err := store.GetHistory(r.URL.Query().Get("date"))
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		writeJSON(w, entries)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "7070"
	}

	log.Printf("wren → http://localhost:%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}
