package proxy

import (
	"encoding/base64"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"wren/internal/models"
)

func Execute(req models.Request, env models.Environment) models.SendResponse {
	vars := env.Variables

	resolvedURL := sub(req.URL, vars)

	// Append enabled params as query string
	if len(req.Params) > 0 {
		q := url.Values{}
		for _, p := range req.Params {
			if p.Enabled {
				q.Set(p.Key, sub(p.Value, vars))
			}
		}
		if qs := q.Encode(); qs != "" {
			if strings.Contains(resolvedURL, "?") {
				resolvedURL += "&" + qs
			} else {
				resolvedURL += "?" + qs
			}
		}
	}

	var bodyReader io.Reader
	var contentType string

	switch req.Body.Type {
	case "json":
		bodyReader = strings.NewReader(strings.TrimSpace(sub(req.Body.Content, vars)))
		contentType = "application/json"
	case "form":
		form := url.Values{}
		for _, f := range req.Body.Fields {
			if f.Enabled {
				form.Set(f.Key, sub(f.Value, vars))
			}
		}
		bodyReader = strings.NewReader(form.Encode())
		contentType = "application/x-www-form-urlencoded"
	case "raw":
		bodyReader = strings.NewReader(sub(req.Body.Content, vars))
	}

	httpReq, err := http.NewRequest(req.Method, resolvedURL, bodyReader)
	if err != nil {
		return models.SendResponse{Error: err.Error()}
	}

	if contentType != "" {
		httpReq.Header.Set("Content-Type", contentType)
	}

	switch req.Auth.Type {
	case "bearer":
		httpReq.Header.Set("Authorization", "Bearer "+sub(req.Auth.Token, vars))
	case "basic":
		creds := base64.StdEncoding.EncodeToString(
			[]byte(sub(req.Auth.Username, vars) + ":" + sub(req.Auth.Password, vars)),
		)
		httpReq.Header.Set("Authorization", "Basic "+creds)
	case "custom":
		hdr := req.Auth.Header
		if hdr == "" {
			hdr = "Authorization"
		}
		httpReq.Header.Set(hdr, sub(req.Auth.Value, vars))
	}

	for _, h := range req.Headers {
		if h.Enabled {
			httpReq.Header.Set(h.Key, sub(h.Value, vars))
		}
	}

	start := time.Now()
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return models.SendResponse{Error: err.Error()}
	}
	defer resp.Body.Close()

	duration := time.Since(start).Milliseconds()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20)) // 10 MB cap
	if err != nil {
		return models.SendResponse{Error: err.Error()}
	}

	headers := make(map[string]string, len(resp.Header))
	for k, v := range resp.Header {
		headers[k] = strings.Join(v, ", ")
	}

	return models.SendResponse{
		Status:     resp.StatusCode,
		StatusText: resp.Status,
		Headers:    headers,
		Body:       string(body),
		Duration:   duration,
		Size:       len(body),
	}
}

func sub(s string, vars map[string]string) string {
	for k, v := range vars {
		s = strings.ReplaceAll(s, "{{"+k+"}}", v)
	}
	return s
}
