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

type storagePoolRecord struct {
	Name string `json:"name"`
	Path string `json:"path"`
	Type string `json:"type"`
}

type createLocalPoolRequest struct {
	Name      string `json:"name"`
	Path      string `json:"path"`
	AutoStart bool   `json:"auto_start"`
}

func (c *Client) GetStoragePool(ctx context.Context, name string) (*storagePoolRecord, error) {
	var pool storagePoolRecord
	if err := c.do(ctx, http.MethodGet, "/api/storage/pools/"+name, nil, &pool); err != nil {
		return nil, err
	}
	return &pool, nil
}

func (c *Client) CreateLocalStoragePool(ctx context.Context, name, path string, autoStart bool) (*storagePoolRecord, error) {
	var pool storagePoolRecord
	req := createLocalPoolRequest{Name: name, Path: path, AutoStart: autoStart}
	if err := c.do(ctx, http.MethodPost, "/api/storage/pools/local", req, &pool); err != nil {
		return nil, err
	}
	return &pool, nil
}

func (c *Client) DeleteStoragePool(ctx context.Context, name string) error {
	return c.do(ctx, http.MethodDelete, "/api/storage/pools/"+name, nil, nil)
}

type networkPolicyRecord struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
}

type createNetworkPolicyRequest struct {
	Name              string            `json:"name"`
	Description       string            `json:"description"`
	EndpointSelector  labelSelector     `json:"endpoint_selector"`
	Ingress           []any             `json:"ingress"`
	Egress            []any             `json:"egress"`
	Enabled           bool              `json:"enabled"`
}

type labelSelector struct {
	MatchLabels map[string]string `json:"match_labels"`
}

func (c *Client) CreateNetworkPolicy(ctx context.Context, name, description string, enabled bool, labels map[string]string) (*networkPolicyRecord, error) {
	var policy networkPolicyRecord
	req := createNetworkPolicyRequest{
		Name:        name,
		Description: description,
		Enabled:     enabled,
		EndpointSelector: labelSelector{MatchLabels: labels},
		Ingress:     []any{},
		Egress:      []any{},
	}
	if err := c.do(ctx, http.MethodPost, "/api/network-policies", req, &policy); err != nil {
		return nil, err
	}
	return &policy, nil
}

func (c *Client) DeleteNetworkPolicy(ctx context.Context, id string) error {
	return c.do(ctx, http.MethodDelete, "/api/network-policies/"+id, nil, nil)
}

type vmSnapshotRecord struct {
	ID     string `json:"id"`
	VMName string `json:"vm_name"`
	Name   string `json:"name"`
}

type createSnapshotRequest struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
}

func (c *Client) CreateVMSnapshot(ctx context.Context, vmName, snapshotName, description string) (*vmSnapshotRecord, error) {
	var snap vmSnapshotRecord
	req := createSnapshotRequest{Name: snapshotName, Description: description}
	if err := c.do(ctx, http.MethodPost, "/api/vms/"+vmName+"/snapshots", req, &snap); err != nil {
		return nil, err
	}
	return &snap, nil
}

func (c *Client) DeleteVMSnapshot(ctx context.Context, vmName, snapshotID string) error {
	return c.do(ctx, http.MethodDelete, "/api/vms/"+vmName+"/snapshots/"+snapshotID, nil, nil)
}
