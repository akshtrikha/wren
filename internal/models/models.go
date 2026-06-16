package models

import "time"

type Workspace struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Requests  []Request `json:"requests"`
	Folders   []Folder  `json:"folders"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Folder struct {
	ID       string    `json:"id"`
	Name     string    `json:"name"`
	Requests []Request `json:"requests"`
}

type Request struct {
	ID      string      `json:"id"`
	Name    string      `json:"name"`
	Method  string      `json:"method"`
	URL     string      `json:"url"`
	Headers []Header    `json:"headers"`
	Params  []Param     `json:"params"`
	Body    RequestBody `json:"body"`
	Auth    Auth        `json:"auth"`
}

type Header struct {
	Key     string `json:"key"`
	Value   string `json:"value"`
	Enabled bool   `json:"enabled"`
}

type Param struct {
	Key     string `json:"key"`
	Value   string `json:"value"`
	Enabled bool   `json:"enabled"`
}

type RequestBody struct {
	Type    string  `json:"type"` // "none" | "json" | "form" | "multipart" | "raw"
	Content string  `json:"content"`
	Fields  []Field `json:"fields"`
}

type Field struct {
	Key     string `json:"key"`
	Value   string `json:"value"`
	Enabled bool   `json:"enabled"`
}

type Auth struct {
	Type     string `json:"type"` // "none" | "bearer" | "basic" | "custom"
	Token    string `json:"token"`
	Username string `json:"username"`
	Password string `json:"password"`
	Header   string `json:"header"`
	Value    string `json:"value"`
}

type Environment struct {
	ID        string            `json:"id"`
	Name      string            `json:"name"`
	Variables map[string]string `json:"variables"`
	CreatedAt time.Time         `json:"createdAt"`
	UpdatedAt time.Time         `json:"updatedAt"`
}

type SendRequest struct {
	Request     Request     `json:"request"`
	Environment Environment `json:"environment"`
}

type SendResponse struct {
	Status     int               `json:"status"`
	StatusText string            `json:"statusText"`
	Headers    map[string]string `json:"headers"`
	Body       string            `json:"body"`
	Duration   int64             `json:"duration"` // ms
	Size       int               `json:"size"`     // bytes
	Error      string            `json:"error,omitempty"`
}

type HistoryEntry struct {
	Timestamp time.Time    `json:"timestamp"`
	Request   Request      `json:"request"`
	Response  SendResponse `json:"response"`
}
