# Quick Start Guide

Create your first virtual machine in 5 minutes. This guide assumes you have already completed the [Installation Guide](01-Installation.md).

---

## Step 1: Start the Daemon

If Zyvor Fabric is not already running:

```bash
sudo systemctl start Zyvor Fabric
```

Verify it is listening:

```bash
curl -s http://127.0.0.1:9095/api/vms | jq .
```

Expected output:

```json
{
  "items": [],
  "total": 0,
  "offset": 0,
  "limit": 200
}
```

---

## Step 2: Authenticate

Zyvor Fabric uses JWT authentication. First, retrieve the admin password:

```bash
# Using vmspawnctl
./vmspawnctl password

# Or read the file directly
sudo cat /var/lib/vmspawnd/.admin_password
```

Log in to get a JWT token:

```bash
TOKEN=$(curl -s http://127.0.0.1:9095/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "<your-password>"}' \
  | jq -r '.token')

echo $TOKEN
```

All subsequent API calls must include this token in the `Authorization` header.

---

## Step 3: Prepare a VM Image

You need a bootable disk image in qcow2 format. You can download a cloud image or use an existing one.

### Option A: Download a Cloud Image

```bash
# Download a Fedora cloud image via the API
curl -s -X POST http://127.0.0.1:9095/api/images/cloud/download \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"distro": "fedora", "version": "41"}'
```

### Option B: Use an Existing Image

Copy a qcow2 image to the images directory:

```bash
sudo cp /path/to/your-image.qcow2 /var/lib/vmspawnd/images/
```

---

## Step 4: Create a VM

Create a virtual machine with 2 CPUs, 2 GB RAM, and 20 GB disk:

```bash
curl -s -X POST http://127.0.0.1:9095/api/vms \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "my-first-vm",
    "image": "your-image.qcow2",
    "cpus": 2,
    "memory": 2048,
    "disk": 20
  }' | jq .
```

Expected response:

```json
{
  "name": "my-first-vm",
  "state": "stopped",
  "cpus": 2,
  "memory": 2048,
  "disk": 20,
  "image": "your-image.qcow2",
  "created": "2026-04-12T10:30:00Z"
}
```

### Using the CLI

If `vmctl` is installed:

```bash
vmctl create my-first-vm \
  --image=your-image.qcow2 \
  --cpus=2 \
  --memory=2048
```

---

## Step 5: Start the VM

```bash
curl -s -X POST http://127.0.0.1:9095/api/vms/my-first-vm/start \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Response:

```json
{
  "status": "starting"
}
```

The VM starts asynchronously. Check its state:

```bash
curl -s http://127.0.0.1:9095/api/vms/my-first-vm \
  -H "Authorization: Bearer $TOKEN" | jq .state
```

Once started, the state will be `"running"`.

### Start with Advanced Options

You can pass `VMStartOptions` to configure KVM, TPM, networking, and more:

```bash
curl -s -X POST http://127.0.0.1:9095/api/vms/my-first-vm/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "kvm": true,
    "secure_boot": false,
    "network_user_mode": true,
    "console": "interactive"
  }' | jq .
```

---

## Step 6: Access the Web UI

Open your browser and navigate to:

```
http://127.0.0.1:9095
```

Log in with:
- **Username:** `admin`
- **Password:** the password from Step 2

The dashboard shows all VMs with their current state, resource usage, and available actions.

---

## Step 7: Use the Console

### Browser Console

From the web dashboard, click the **Console** button on any running VM to open a browser-based terminal via WebSocket (xterm.js).

### API Console

Connect to the WebSocket console endpoint:

```
ws://127.0.0.1:9095/api/ws/console/{vm-name}?token=<your-jwt-token>
```

---

## Step 8: View VM Metrics

```bash
curl -s http://127.0.0.1:9095/api/vms/my-first-vm/metrics \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Response includes CPU usage, memory usage, disk usage, and network I/O.

---

## Step 9: Stop the VM

```bash
curl -s -X POST http://127.0.0.1:9095/api/vms/my-first-vm/stop \
  -H "Authorization: Bearer $TOKEN" | jq .
```

---

## Step 10: Delete the VM

```bash
curl -s -X DELETE http://127.0.0.1:9095/api/vms/my-first-vm \
  -H "Authorization: Bearer $TOKEN"
```

Returns `204 No Content` on success.

---

## What You Just Did

1. Started the vmspawnd daemon
2. Authenticated and obtained a JWT token
3. Created a VM with specified resources
4. Started the VM using systemd-vmspawn
5. Accessed the web dashboard
6. Connected to the VM console
7. Viewed real-time metrics
8. Stopped and deleted the VM

---

## Next Steps

- [Configuration Reference](03-Configuration.md) -- customize Zyvor Fabric settings
- [Web UI Guide](04-Web-UI.md) -- explore the full web dashboard
- [API Reference](../api.md) -- learn the 520+ API endpoints
- [Networking Guide](../networking.md) -- configure VM networking
- [Storage Guide](../storage.md) -- set up storage backends
