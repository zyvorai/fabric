# Web UI Guide

Zyvor Fabric includes a React-based web dashboard for managing virtual machines through your browser. The dashboard provides real-time VM status, lifecycle management, console access, and bulk operations.

---

## Accessing the Dashboard

### Default URL

After starting Zyvor Fabric, open your browser and navigate to:

```
http://127.0.0.1:9095
```

The web UI is served directly by the vmspawnd daemon on the same port as the API. No separate web server is required.

### Remote Access

If Zyvor Fabric is configured to listen on a non-localhost address:

```toml
[daemon]
listen = "0.0.0.0:9095"
cors_origins = ["http://your-server-ip:9095"]
```

Access it at `http://your-server-ip:9095`.

For HTTPS access, generate a TLS certificate:

```bash
./vmspawnctl tls
```

---

## Login and Authentication

### Initial Login

On the login page, enter:

- **Username:** `admin`
- **Password:** the generated admin password

Retrieve the admin password:

```bash
./vmspawnctl password
# Or: sudo cat /var/lib/vmspawnd/.admin_password
```

### Session Management

After login, the dashboard stores a JWT token in the browser. The token is valid for the duration configured in `auth.token_expiration_hours` (default: 24 hours). When the token expires, you will be redirected to the login page.

### User Roles

The dashboard adapts its interface based on the authenticated user's role:

| Role | Dashboard Capabilities |
|------|----------------------|
| **Admin** | Full access: create, start, stop, delete VMs, manage users, system settings |
| **User** | Create, start, stop, restart VMs; view metrics and events |
| **Viewer** | Read-only: view VM list, metrics, and events |

---

## Dashboard Overview

The main dashboard displays:

- **VM List** -- all virtual machines with name, state, CPU, memory, disk, IP address, and creation time
- **State Indicators** -- color-coded status badges: running (green), stopped (gray), paused (yellow), failed (red), starting/stopping (blue)
- **Quick Actions** -- per-VM action buttons for common operations
- **Search and Filter** -- filter VMs by name, state, tags, or labels

### Command Palette

Press **Ctrl+K** to open the command palette for quick navigation and actions. Type to search for VMs, pages, or operations.

---

## VM Management

### Creating a VM

1. Click **Create VM** in the top navigation
2. Fill in the form:
   - **Name** -- unique VM identifier (alphanumeric, hyphens, underscores)
   - **Image** -- disk image filename (must exist in the images directory)
   - **CPUs** -- number of virtual CPUs (1-256)
   - **Memory** -- RAM in MB (128-1,048,576)
   - **Disk** -- disk size in GB (1-65,536, default: 20)
   - **Hostname** -- optional guest hostname
   - **Tags** -- optional tags for organization
   - **Labels** -- optional key-value labels
3. Click **Create**

### Lifecycle Actions

For each VM, the following actions are available through the UI:

| Action | Description | Required Role |
|--------|-------------|---------------|
| **Start** | Boot the VM | User |
| **Stop** | Graceful shutdown | User |
| **Restart** | Reboot the VM | User |
| **Pause** | Suspend in memory | User |
| **Resume** | Resume from pause | User |
| **Backup** | Create a backup snapshot | User |
| **Console** | Open browser terminal | User |
| **Delete** | Permanently remove the VM | Admin |

### Bulk Operations

Select multiple VMs using checkboxes, then use the bulk action toolbar:

- **Start All** -- start all selected VMs
- **Stop All** -- stop all selected VMs
- **Backup All** -- create backups for all selected VMs
- **Delete All** -- delete all selected VMs (admin only)

### VM Details

Click a VM name to view its detail page:

- **Overview** -- state, resources, IP, PID, creation time, last update
- **Metrics** -- CPU usage, memory usage, disk I/O, network I/O
- **Snapshots** -- list, create, revert, and delete snapshots
- **Events** -- VM lifecycle event history
- **Configuration** -- cloud-init settings, start options

---

## Console Access

The web UI provides browser-based console access to running VMs using xterm.js over WebSocket.

### Opening a Console

1. Navigate to a running VM
2. Click the **Console** button
3. A terminal window opens in your browser

The console session uses the same JWT authentication as the dashboard. No additional credentials are required to establish the WebSocket connection.

### Console Modes

| Mode | Description |
|------|-------------|
| **Interactive** | Full read-write terminal access (default) |
| **Read-only** | View-only terminal output |

---

## Real-Time Updates

The dashboard receives real-time updates via Server-Sent Events (SSE) from the `/api/events/stream` endpoint. VM state changes, creation, deletion, and error events appear immediately without page refresh.

---

## Dark Theme

The web UI uses a dark theme by default, designed for extended monitoring sessions and server room environments. The interface follows the hypersdk design system with consistent color coding for VM states and resource utilization levels.

---

## Next Steps

- [API Reference](../api.md) -- integrate with the REST API programmatically
- [TUI Guide](../tui.md) -- use the terminal-based dashboard
- [Configuration Reference](03-Configuration.md) -- customize dashboard access and CORS
