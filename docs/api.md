# vmspawnd REST API Documentation

## Base URL

```
http://localhost:8080/api
```

## Endpoints

### List VMs

```
GET /vms
```

**Response:**
```json
[
  {
    "name": "vm1",
    "state": "running",
    "cpus": 2,
    "memory": 2048,
    "image": "/path/to/image.qcow2",
    "ip": "192.168.100.10",
    "pid": 12345
  }
]
```

### Get VM

```
GET /vms/:name
```

**Response:**
```json
{
  "name": "vm1",
  "state": "running",
  "cpus": 2,
  "memory": 2048,
  "image": "/path/to/image.qcow2",
  "ip": "192.168.100.10",
  "pid": 12345
}
```

### Create VM

```
POST /vms
Content-Type: application/json

{
  "name": "myvm",
  "image": "/path/to/image.qcow2",
  "cpus": 4,
  "memory": 4096
}
```

**Response:**
```json
{
  "name": "myvm",
  "state": "stopped",
  "cpus": 4,
  "memory": 4096,
  "image": "/path/to/image.qcow2"
}
```

### Delete VM

```
DELETE /vms/:name
```

**Response:** 204 No Content

### Start VM

```
POST /vms/:name/start
```

**Response:**
```json
{
  "status": "started"
}
```

### Stop VM

```
POST /vms/:name/stop
```

**Response:**
```json
{
  "status": "stopped"
}
```

### Restart VM

```
POST /vms/:name/restart
```

**Response:**
```json
{
  "status": "restarted"
}
```

### Get VM Metrics

```
GET /vms/:name/metrics
```

**Response:**
```json
{
  "cpu_usage": 45.2,
  "memory_usage": 1024,
  "disk_usage": 5368709120,
  "network_rx": 1048576,
  "network_tx": 2097152
}
```

## VM States

- `running` - VM is running
- `stopped` - VM is stopped
- `paused` - VM is paused
- `unknown` - VM state unknown

## Error Responses

```json
{
  "error": "Error message here"
}
```

**Status Codes:**
- 200 OK
- 201 Created
- 204 No Content
- 404 Not Found
- 500 Internal Server Error
