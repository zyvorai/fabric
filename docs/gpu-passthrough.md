# GPU Passthrough

Pass physical GPUs through to VMs for graphics workloads, machine learning, and gaming using VFIO and IOMMU.

---

## Prerequisites

### Hardware

- CPU with IOMMU support (Intel VT-d or AMD-Vi)
- Dedicated GPU for passthrough (separate from the host display GPU)
- Motherboard with IOMMU support enabled in BIOS/UEFI

### Enable IOMMU

Add the appropriate kernel parameter:

```bash
# Intel CPU
GRUB_CMDLINE_LINUX_DEFAULT="quiet intel_iommu=on iommu=pt"

# AMD CPU
GRUB_CMDLINE_LINUX_DEFAULT="quiet amd_iommu=on iommu=pt"
```

Update bootloader and reboot:

```bash
sudo update-grub    # Debian/Ubuntu
sudo grub2-mkconfig -o /boot/grub2/grub.cfg    # Fedora/RHEL
sudo reboot
```

### Verify IOMMU

```bash
dmesg | grep -i iommu
find /sys/kernel/iommu_groups/ -type l
```

---

## Detect Available GPUs

```bash
# CLI
vmctl gpu list

# API
curl http://localhost:9095/api/gpu/devices
```

```json
[
  {
    "pci_address": "0000:01:00.0",
    "vendor": "10de:1b80",
    "device_name": "NVIDIA GeForce GTX 1080",
    "driver": "nvidia",
    "is_available": false
  },
  {
    "pci_address": "0000:02:00.0",
    "vendor": "10de:1c03",
    "device_name": "NVIDIA GeForce GTX 1050 Ti",
    "driver": "",
    "is_available": true
  }
]
```

A GPU is `is_available: true` when it is not bound to a host driver and can be assigned to a VM.

---

## Bind GPU to VFIO

Before passing a GPU to a VM, bind it to the `vfio-pci` driver:

```bash
# CLI
vmctl gpu bind 0000:02:00.0

# API
curl -X POST http://localhost:9095/api/gpu/bind \
  -H "Content-Type: application/json" \
  -d '{"pci_address": "0000:02:00.0"}'

# Manual
echo "0000:02:00.0" > /sys/bus/pci/drivers/nouveau/unbind
echo "10de 1c03" > /sys/bus/pci/drivers/vfio-pci/new_id
```

---

## Create a VM with GPU Passthrough

```bash
curl -X POST http://localhost:9095/api/vms \
  -H "Content-Type: application/json" \
  -d '{
    "name": "gaming-vm",
    "image": "/var/lib/vmspawnd/images/windows10.qcow2",
    "cpus": 8,
    "memory": 16384,
    "gpu_passthrough": {
      "pci_address": "0000:02:00.0",
      "multifunction": false,
      "romfile": "/usr/share/vgabios/GTX1050Ti.rom"
    }
  }'
```

### VM Configuration File

```toml
# /etc/vmspawnd/vms/gaming-vm.toml
[vm]
name = "gaming-vm"
cpus = 8
memory = 16384

[gpu]
enabled = true
pci_address = "0000:02:00.0"
multifunction = false
romfile = "/usr/share/vgabios/GTX1050Ti.rom"

[display]
type = "none"     # Disable emulated display when using passthrough GPU
vnc = false
```

### Extract GPU ROM (if needed)

Some GPUs require a ROM file for passthrough:

```bash
cd /sys/bus/pci/devices/0000:02:00.0
echo 1 > rom
cat rom > /usr/share/vgabios/GTX1050Ti.rom
echo 0 > rom
```

---

## Guest Driver Setup

### NVIDIA on Windows

1. Install NVIDIA drivers normally
2. If you get "Error 43", add hypervisor hiding to the VM config:

```xml
<hyperv>
  <vendor_id state='on' value='1234567890ab'/>
</hyperv>
<kvm>
  <hidden state='on'/>
</kvm>
```

### NVIDIA on Linux

```bash
sudo apt install nvidia-driver-xxx    # Debian/Ubuntu
sudo dnf install akmod-nvidia         # Fedora
nvidia-smi                            # Verify
```

### AMD GPUs

Some AMD GPUs have a reset bug. Workaround:

```bash
# Kernel parameters
amd_iommu=on iommu=pt video=efifb:off

# Install vendor-reset module
git clone https://github.com/gnif/vendor-reset
cd vendor-reset && make && sudo make install
sudo modprobe vendor-reset
```

---

## Multi-GPU Passthrough

Pass multiple GPUs to a single VM:

```json
{
  "name": "multi-gpu-vm",
  "gpus": [
    {"pci_address": "0000:01:00.0", "primary": true},
    {"pci_address": "0000:02:00.0", "primary": false}
  ]
}
```

For SLI/CrossFire, ensure GPUs are in the same IOMMU group:

```bash
for d in /sys/kernel/iommu_groups/*/devices/*; do
    n=${d#*/iommu_groups/*}; n=${n%%/*}
    printf 'IOMMU Group %s ' "$n"
    lspci -nns "${d##*/}"
done
```

---

## vGPU (Virtual GPU)

### NVIDIA GRID

For NVIDIA GRID/vGPU (requires license):

```bash
sudo systemctl start nvidia-vgpud
vmctl gpu create-vgpu --physical-gpu 0000:02:00.0 --type nvidia-256
```

### Intel GVT-g

For Intel integrated graphics virtualization:

```bash
echo "i915.enable_gvt=1" >> /etc/modprobe.d/i915.conf
vmctl gpu create-vgpu --physical-gpu 0000:00:02.0 --type i915-GVTg_V5_4
```

---

## Performance Optimization

### CPU Pinning

Pin VM vCPUs for consistent GPU performance:

```toml
[cpu]
mode = "host-passthrough"
pins = [0, 1, 2, 3, 4, 5, 6, 7]
```

### Huge Pages

Reduce memory overhead:

```bash
echo 8192 > /sys/kernel/mm/hugepages/hugepages-2048kB/nr_hugepages
```

```toml
[memory]
hugepages = true
```

### MSI Interrupts

Enable MSI for better interrupt performance:

```bash
echo 1 > /sys/bus/pci/devices/0000:02:00.0/msi_bus
```

---

## Monitoring

```bash
# GPU assignment status
vmctl gpu list --assigned

# Per-VM GPU stats
vmctl gpu stats gaming-vm
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| NVIDIA Error 43 | Add `<kvm><hidden state='on'/></kvm>` to VM config |
| Black screen | Check if GPU ROM is needed; verify IOMMU groups; try different display port |
| GPU not releasing after VM shutdown | `vmctl gpu unbind 0000:02:00.0` then `modprobe -r vfio-pci && modprobe vfio-pci` |
| IOMMU group contains other devices | Use ACS override (`pcie_acs_override=downstream,multifunction`) -- not recommended for production |

---

## Security Considerations

- A passthrough GPU has direct memory access (DMA) to VM memory
- IOMMU provides isolation between the GPU and other system memory
- Always verify driver signatures in the guest OS
- Do not pass through GPUs on multi-tenant hosts without understanding the DMA risk
