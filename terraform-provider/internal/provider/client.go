package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Client struct {
	baseURL    string
	token      string
	httpClient *http.Client
}

func NewClient(endpoint, token string) *Client {
	return &Client{
		baseURL: strings.TrimRight(endpoint, "/"),
		token:   token,
		httpClient: &http.Client{
			Timeout: 60 * time.Second,
		},
	}
}

func (c *Client) do(ctx context.Context, method, path string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(b)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	res, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	data, err := io.ReadAll(res.Body)
	if err != nil {
		return err
	}
	if res.StatusCode >= 400 {
		return fmt.Errorf("API %s %s: %s", method, path, strings.TrimSpace(string(data)))
	}
	if out == nil || len(data) == 0 {
		return nil
	}
	return json.Unmarshal(data, out)
}

type vmRecord struct {
	Name   string  `json:"name"`
	State  string  `json:"state"`
	CPUs   int64   `json:"cpus"`
	Memory int64   `json:"memory"`
	Image  string  `json:"image"`
	IP     *string `json:"ip"`
}

type createVMRequest struct {
	Name   string `json:"name"`
	Image  string `json:"image"`
	CPUs   int64  `json:"cpus"`
	Memory int64  `json:"memory"`
}

func (c *Client) GetVM(ctx context.Context, name string) (*vmRecord, error) {
	var vm vmRecord
	if err := c.do(ctx, http.MethodGet, "/api/vms/"+name, nil, &vm); err != nil {
		return nil, err
	}
	return &vm, nil
}

func (c *Client) CreateVM(ctx context.Context, req createVMRequest) (*vmRecord, error) {
	var vm vmRecord
	if err := c.do(ctx, http.MethodPost, "/api/vms", req, &vm); err != nil {
		return nil, err
	}
	return &vm, nil
}

func (c *Client) DeleteVM(ctx context.Context, name string) error {
	return c.do(ctx, http.MethodDelete, "/api/vms/"+name, nil, nil)
}

func (c *Client) StartVM(ctx context.Context, name string) error {
	return c.do(ctx, http.MethodPost, "/api/vms/"+name+"/start", map[string]any{}, nil)
}
