package curl

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"

	"wren/internal/models"
)

// Parse converts a curl command string into a Request.
func Parse(s string) (models.Request, error) {
	tokens := tokenize(s)

	req := models.Request{
		Method: "GET",
		Auth:   models.Auth{Type: "none"},
		Body:   models.RequestBody{Type: "none"},
	}

	var bodyParts []string

	i := 0
	for i < len(tokens) {
		tok := tokens[i]
		switch tok {
		case "curl":
			i++
		case "-X", "--request":
			i++
			if i < len(tokens) {
				req.Method = strings.ToUpper(tokens[i])
				i++
			}
		case "-H", "--header":
			i++
			if i < len(tokens) {
				parseHeader(tokens[i], &req)
				i++
			}
		case "-d", "--data", "--data-raw", "--data-ascii", "--data-binary":
			i++
			if i < len(tokens) {
				bodyParts = append(bodyParts, tokens[i])
				i++
			}
		case "--data-urlencode":
			i++
			if i < len(tokens) {
				bodyParts = append(bodyParts, tokens[i])
				i++
			}
		case "-u", "--user":
			i++
			if i < len(tokens) {
				parts := strings.SplitN(tokens[i], ":", 2)
				req.Auth = models.Auth{Type: "basic", Username: parts[0]}
				if len(parts) > 1 {
					req.Auth.Password = parts[1]
				}
				i++
			}
		case "--url":
			i++
			if i < len(tokens) {
				req.URL = tokens[i]
				i++
			}
		// flags that consume a value we don't use
		case "-o", "--output", "-A", "--user-agent", "-e", "--referer",
			"--cacert", "--cert", "--key", "--proxy", "-x",
			"--max-time", "--connect-timeout", "--limit-rate":
			i += 2
		// boolean flags we ignore
		case "-L", "--location", "-s", "--silent", "-v", "--verbose",
			"-k", "--insecure", "-i", "--include", "-I", "--head",
			"--compressed", "-g", "--globoff", "-f", "--fail",
			"--http1.1", "--http2", "-b", "--cookie":
			i++
			// -b actually takes a value; eat it
			if (tok == "-b" || tok == "--cookie") && i < len(tokens) {
				i++
			}
		default:
			if (strings.HasPrefix(tok, "http://") || strings.HasPrefix(tok, "https://")) && req.URL == "" {
				req.URL = tok
			} else if !strings.HasPrefix(tok, "-") && req.URL == "" {
				req.URL = tok
			}
			i++
		}
	}

	if len(bodyParts) > 0 {
		body := strings.Join(bodyParts, "&")
		trimmed := strings.TrimSpace(body)
		var raw json.RawMessage
		if json.Unmarshal([]byte(trimmed), &raw) == nil {
			req.Body = models.RequestBody{Type: "json", Content: trimmed}
		} else if vals, err := url.ParseQuery(body); err == nil && len(vals) > 0 {
			var fields []models.Field
			for k, v := range vals {
				fields = append(fields, models.Field{Key: k, Value: v[0], Enabled: true})
			}
			req.Body = models.RequestBody{Type: "form", Fields: fields}
		} else {
			req.Body = models.RequestBody{Type: "raw", Content: body}
		}
		if req.Method == "GET" {
			req.Method = "POST"
		}
	}

	return req, nil
}

func parseHeader(raw string, req *models.Request) {
	key, val, ok := strings.Cut(raw, ":")
	if !ok {
		return
	}
	key = strings.TrimSpace(key)
	val = strings.TrimSpace(val)

	if strings.EqualFold(key, "Authorization") {
		if token, ok := strings.CutPrefix(val, "Bearer "); ok {
			req.Auth = models.Auth{Type: "bearer", Token: token}
			return
		}
		if encoded, ok := strings.CutPrefix(val, "Basic "); ok {
			decoded, err := base64.StdEncoding.DecodeString(encoded)
			if err == nil {
				parts := strings.SplitN(string(decoded), ":", 2)
				req.Auth = models.Auth{Type: "basic", Username: parts[0]}
				if len(parts) > 1 {
					req.Auth.Password = parts[1]
				}
				return
			}
		}
	}

	req.Headers = append(req.Headers, models.Header{Key: key, Value: val, Enabled: true})
}

// Export converts a Request into a curl command string.
func Export(req models.Request) string {
	var b strings.Builder
	sq := func(s string) string { return "'" + strings.ReplaceAll(s, "'", `'"'"'`) + "'" }
	w := func(s string) { b.WriteString(s) }

	w("curl")

	if req.Method != "GET" && req.Method != "" {
		w(" -X " + req.Method)
	}

	switch req.Auth.Type {
	case "bearer":
		w(" -H " + sq("Authorization: Bearer "+req.Auth.Token))
	case "basic":
		w(" -u " + sq(req.Auth.Username+":"+req.Auth.Password))
	case "custom":
		hdr := req.Auth.Header
		if hdr == "" {
			hdr = "Authorization"
		}
		w(" -H " + sq(hdr+": "+req.Auth.Value))
	}

	for _, h := range req.Headers {
		if h.Enabled {
			w(" -H " + sq(h.Key+": "+h.Value))
		}
	}

	switch req.Body.Type {
	case "json":
		w(" -H 'Content-Type: application/json'")
		w(" -d " + sq(req.Body.Content))
	case "form":
		w(" -H 'Content-Type: application/x-www-form-urlencoded'")
		var parts []string
		for _, f := range req.Body.Fields {
			if f.Enabled {
				parts = append(parts, url.QueryEscape(f.Key)+"="+url.QueryEscape(f.Value))
			}
		}
		w(" -d " + sq(strings.Join(parts, "&")))
	case "raw":
		w(" -d " + sq(req.Body.Content))
	}

	w(" " + sq(req.URL))
	return b.String()
}

// Import is the HTTP handler that parses a curl string from the request body.
func Import(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Curl string `json:"curl"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	req, err := Parse(body.Curl)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(req)
}

// tokenize splits a curl command respecting single/double quotes and \ continuations.
func tokenize(s string) []string {
	var tokens []string
	var cur strings.Builder
	inSingle, inDouble := false, false

	i := 0
	for i < len(s) {
		c := s[i]

		if inSingle {
			if c == '\'' {
				inSingle = false
			} else {
				cur.WriteByte(c)
			}
			i++
			continue
		}

		if inDouble {
			if c == '"' {
				inDouble = false
			} else if c == '\\' && i+1 < len(s) {
				i++
				switch s[i] {
				case 'n':
					cur.WriteByte('\n')
				case 't':
					cur.WriteByte('\t')
				default:
					cur.WriteByte(s[i])
				}
			} else {
				cur.WriteByte(c)
			}
			i++
			continue
		}

		switch c {
		case '\'':
			inSingle = true
		case '"':
			inDouble = true
		case '\\':
			if i+1 < len(s) && (s[i+1] == '\n' || s[i+1] == '\r') {
				i++
				if s[i] == '\r' && i+1 < len(s) && s[i+1] == '\n' {
					i++
				}
			} else if i+1 < len(s) {
				i++
				cur.WriteByte(s[i])
			}
		case ' ', '\t', '\n', '\r':
			if cur.Len() > 0 {
				tokens = append(tokens, cur.String())
				cur.Reset()
			}
		default:
			cur.WriteByte(c)
		}
		i++
	}

	if cur.Len() > 0 {
		tokens = append(tokens, cur.String())
	}
	return tokens
}
