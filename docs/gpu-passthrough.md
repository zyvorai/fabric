# GPU Passthrough Guide

## Prerequisites

### 1. Hardware Requirements

- CPU with IOMMU support (Intel VT-d or AMD-Vi)
- Dedicated GPU for passthrough
- Motherboard with IOMMU support

### 2. Enable IOMMU

#### Intel CPU

Edit `/etc/default/grub`:

```bash
GRUB_CMDLINE_LINUX_DEFAULT="quiet intel_iommu=on iommu=pt"
```

#### AMD CPU

```bash
GRUB_CMDLINE_LINUX_DEFAULT="quiet amd_iommu=on iommu=pt"
```

Update GRUB:

```bash
sudo update-grub
sudo reboot
```

### 3. Verify IOMMU

```bash
# Check if IOMMU is enabled
dmesg | grep -i iommu

# Check IOMMU groups
find /sys/kernel/iommu_groups/ -type l
```

## Detect Available GPUs

```bash
# Using vmctl
vmctl gpu list

# Using API
curl http://localhost:8080/api/gpu/devices
```

Response:
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

## Bind GPU to VFIO

### Method 1: Using vmctl

```bash
vmctl gpu bind 0000:02:00.0
```

### Method 2: Using API

```bash
curl -X POST http://localhost:8080/api/gpu/bind \
  -H "Content-Type: application/json" \
  -d '{"pci_address": "0000:02:00.0"}'
```

### Method 3: Manual

```bash
# Unbind from current driver
echo "0000:02:00.0" > /sys/bus/pci/drivers/nouveau/unbind

# Bind to vfio-pci
echo "10de 1c03" > /sys/bus/pci/drivers/vfio-pci/new_id
```

## Create VM with GPU Passthrough

```bash
curl -X POST http://localhost:8080/api/vms \
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

## Configuration

### GPU ROM File

Some GPUs require a ROM file for passthrough:

```bash
# Extract GPU ROM
cd /sys/bus/pci/devices/0000:02:00.0
echo 1 > rom
cat rom > /usr/share/vgabios/GTX1050Ti.rom
echo 0 > rom
```

### VM Configuration

`/etc/vmspawnd/vms/gaming-vm.toml`:

```toml
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
type = "none"  # Disable emulated display
vnc = false
```

## NVIDIA Driver Setup (Guest)

### Windows Guest

1. Install NVIDIA drivers normally
2. If "Error 43", add to VM config:

```xml
<hyperv>
  <vendor_id state='on' value='1234567890ab'/>
</hyperv>
<kvm>
  <hidden state='on'/>
</kvm>
```

### Linux Guest

```bash
# Install NVIDIA drivers
sudo apt install nvidia-driver-xxx

# Verify GPU
nvidia-smi
```

## AMD GPU Passthrough

### Reset Bug Workaround

Some AMD GPUs need reset workaround:

```bash
# Add to kernel parameters
amd_iommu=on iommu=pt video=efifb:off
```

### Vendor Reset Module

```bash
# Install vendor-reset
git clone https://github.com/gnif/vendor-reset
cd vendor-reset
make
sudo make install

# Load module
sudo modprobe vendor-reset
```

## Multi-GPU Setup

### Pass Multiple GPUs

```json
{
  "name": "multi-gpu-vm",
  "gpus": [
    {
      "pci_address": "0000:01:00.0",
      "primary": true
    },
    {
      "pci_address": "0000:02:00.0",
      "primary": false
    }
  ]
}
```

### SLI/CrossFire

Ensure GPUs are in same IOMMU group:

```bash
# Check IOMMU groups
for d in /sys/kernel/iommu_groups/*/devices/*; do
    n=${d#*/iommu_groups/*}
    n=${n%%/*}
    printf 'IOMMU Group %s ' "$n"
    lspci -nns "${d##*/}"
done
```

## Troubleshooting

### Error 43 (NVIDIA)

Add to VM config:
```xml
<features>
  <hyperv>
    <vendor_id state='on' value='1234567890ab'/>
  </hyperv>
  <kvm>
    <hidden state='on'/>
  </kvm>
</features>
```

### Black Screen

- Check if GPU ROM is needed
- Verify IOMMU groups
- Try different display port/HDMI cable
- Check BIOS settings

### GPU Not Releasing

```bash
# Force unbind
vmctl gpu unbind 0000:02:00.0

# Restart vfio module
sudo modprobe -r vfio-pci
sudo modprobe vfio-pci
```

### IOMMU Group Issues

If GPU shares IOMMU group with other devices, use ACS override patch (not recommended for production):

```bash
# Kernel parameter
pcie_acs_override=downstream,multifunction
```

## Performance Optimization

### CPU Pinning

```toml
[cpu]
mode = "host-passthrough"
pins = [0, 1, 2, 3, 4, 5, 6, 7]
```

### Huge Pages

```bash
# Enable huge pages
echo 8192 > /sys/kernel/mm/hugepages/hugepages-2048kB/nr_hugepages

# VM config
[memory]
hugepages = true
```

### MSI Interrupts

```bash
# Enable MSI for better performance
echo 1 > /sys/bus/pci/devices/0000:02:00.0/msi_bus
```

## Best Practices

1. **Dedicated GPU**: Use separate GPU for passthrough
2. **IOMMU Groups**: Keep clean IOMMU groups
3. **ROM Files**: Extract and use GPU ROM when needed
4. **Driver Updates**: Keep guest drivers updated
5. **Huge Pages**: Enable for better memory performance
6. **CPU Pinning**: Pin CPU cores for better performance
7. **Benchmarks**: Test performance vs bare metal

## Advanced Features

### vGPU (NVIDIA GRID)

For NVIDIA GRID/vGPU support (requires license):

```bash
# Load vGPU manager
sudo systemctl start nvidia-vgpud

# Create vGPU
vmctl gpu create-vgpu \
  --physical-gpu 0000:02:00.0 \
  --type nvidia-256
```

### Intel GVT-g

For Intel integrated graphics virtualization:

```bash
# Enable GVT-g
echo "i915.enable_gvt=1" >> /etc/modprobe.d/i915.conf

# Create vGPU
vmctl gpu create-vgpu \
  --physical-gpu 0000:00:02.0 \
  --type i915-GVTg_V5_4
```

## Monitoring

### GPU Usage in VM

```bash
# Get GPU stats
vmctl gpu stats gaming-vm
```

### Host Monitoring

```bash
# Check GPU assignment
vmctl gpu list --assigned
```

## Security Considerations

- GPU can access all VM memory
- DMA attacks possible
- Use IOMMU for isolation
- Verify driver signatures in guest
