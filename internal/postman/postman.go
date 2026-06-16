package postman

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"wren/internal/models"
	"wren/internal/storage"
	"wren/internal/uid"
)

// ---- Postman Collection v2 / v2.1 types ----

type Collection struct {
	Info struct {
		Name string `json:"name"`
	} `json:"info"`
	Item []Item `json:"item"`
}

type Item struct {
	Name    string  `json:"name"`
	Item    []Item  `json:"item"`
	Request *PMReq  `json:"request"`
}

type PMReq struct {
	Method string     `json:"method"`
	URL    PMURL      `json:"url"`
	Header []PMHeader `json:"header"`
	Body   *PMBody    `json:"body"`
	Auth   *PMAuth    `json:"auth"`
}

// PMURL handles both string and object forms.
type PMURL struct {
	Raw  string   `json:"raw"`
	Host []string `json:"host"`
	Path []string `json:"path"`
}

func (u *PMURL) UnmarshalJSON(data []byte) error {
	var s string
	if json.Unmarshal(data, &s) == nil {
		u.Raw = s
		return nil
	}
	type alias PMURL
	var a alias
	if err := json.Unmarshal(data, &a); err != nil {
		return err
	}
	*u = PMURL(a)
	return nil
}

type PMHeader struct {
	Key      string `json:"key"`
	Value    string `json:"value"`
	Disabled bool   `json:"disabled"`
}

type PMBody struct {
	Mode       string    `json:"mode"`
	Raw        string    `json:"raw"`
	URLEncoded []PMField `json:"urlencoded"`
	FormData   []PMField `json:"formdata"`
}

type PMField struct {
	Key      string `json:"key"`
	Value    string `json:"value"`
	Disabled bool   `json:"disabled"`
}

type PMAuth struct {
	Type   string  `json:"type"`
	Bearer []PMVar `json:"bearer"`
	Basic  []PMVar `json:"basic"`
	Apikey []PMVar `json:"apikey"`
}

type PMVar struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// ---- HTTP handler ----

func Import(store *storage.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var col Collection
		if err := json.NewDecoder(r.Body).Decode(&col); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		ws := convert(col)
		if err := store.SaveWorkspace(ws); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(ws)
	}
}

// ---- Conversion ----

func convert(col Collection) models.Workspace {
	now := time.Now()
	ws := models.Workspace{
		ID:        uid.New(),
		Name:      col.Info.Name,
		Requests:  []models.Request{},
		Folders:   []models.Folder{},
		CreatedAt: now,
		UpdatedAt: now,
	}

	for _, item := range col.Item {
		if item.Request != nil {
			ws.Requests = append(ws.Requests, convertReq(item))
		} else if len(item.Item) > 0 {
			folder := models.Folder{
				ID:       uid.New(),
				Name:     item.Name,
				Requests: []models.Request{},
			}
			for _, sub := range item.Item {
				if sub.Request != nil {
					folder.Requests = append(folder.Requests, convertReq(sub))
				}
			}
			ws.Folders = append(ws.Folders, folder)
		}
	}

	return ws
}

func convertReq(item Item) models.Request {
	pm := item.Request
	req := models.Request{
		ID:     uid.New(),
		Name:   item.Name,
		Method: strings.ToUpper(pm.Method),
		Auth:   models.Auth{Type: "none"},
		Body:   models.RequestBody{Type: "none"},
	}

	if pm.URL.Raw != "" {
		req.URL = pm.URL.Raw
	} else {
		req.URL = strings.Join(pm.URL.Host, ".") + "/" + strings.Join(pm.URL.Path, "/")
	}

	for _, h := range pm.Header {
		req.Headers = append(req.Headers, models.Header{
			Key:     h.Key,
			Value:   h.Value,
			Enabled: !h.Disabled,
		})
	}
	if req.Headers == nil {
		req.Headers = []models.Header{}
	}

	if pm.Body != nil {
		switch pm.Body.Mode {
		case "raw":
			trimmed := strings.TrimSpace(pm.Body.Raw)
			if strings.HasPrefix(trimmed, "{") || strings.HasPrefix(trimmed, "[") {
				req.Body = models.RequestBody{Type: "json", Content: pm.Body.Raw}
			} else {
				req.Body = models.RequestBody{Type: "raw", Content: pm.Body.Raw}
			}
		case "urlencoded":
			var fields []models.Field
			for _, f := range pm.Body.URLEncoded {
				fields = append(fields, models.Field{Key: f.Key, Value: f.Value, Enabled: !f.Disabled})
			}
			req.Body = models.RequestBody{Type: "form", Fields: fields}
		case "formdata":
			var fields []models.Field
			for _, f := range pm.Body.FormData {
				fields = append(fields, models.Field{Key: f.Key, Value: f.Value, Enabled: !f.Disabled})
			}
			req.Body = models.RequestBody{Type: "multipart", Fields: fields}
		}
	}

	if pm.Auth != nil {
		switch pm.Auth.Type {
		case "bearer":
			req.Auth = models.Auth{Type: "bearer", Token: pmVar(pm.Auth.Bearer, "token")}
		case "basic":
			req.Auth = models.Auth{
				Type:     "basic",
				Username: pmVar(pm.Auth.Basic, "username"),
				Password: pmVar(pm.Auth.Basic, "password"),
			}
		case "apikey":
			req.Auth = models.Auth{
				Type:   "custom",
				Header: pmVar(pm.Auth.Apikey, "key"),
				Value:  pmVar(pm.Auth.Apikey, "value"),
			}
		}
	}

	return req
}

func pmVar(vars []PMVar, key string) string {
	for _, v := range vars {
		if v.Key == key {
			return v.Value
		}
	}
	return ""
}
