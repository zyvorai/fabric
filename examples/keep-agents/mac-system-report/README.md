# mac-system-report

A `system_profiler` report in, a short machine summary out: model, chip, cores, memory, macOS and kernel version,
firmware, System Integrity Protection, Activation Lock and uptime.

```bash
system_profiler SPHardwareDataType SPSoftwareDataType > report.txt
./scripts/keepctl deploy examples/keep-agents/mac-system-report --test
./scripts/keepctl run mac-system-report report.txt
```

**Serial number, hardware UUID, computer name and user name are not listed**: no rule matches them. The bundled sample
carries placeholder values so you can check that. The layout is `system_profiler`'s on macOS 26; older versions word a few
lines differently, and a line that is missing shows as "(no matches)".

**Not this:** Keep does not connect to your Mac. It reads a file you export, in a sealed Linux cell.

These files describe a real machine and can contain hostnames, user names and installed software, so treat the summary as sensitive as the export. The cell has no network (the run reports `0` outbound connections) and no model reads the file, but the evidence class is `software-test`: whoever operates the host could still read a cell's memory ([VENDORS.md](../../../docs/keep/VENDORS.md)).
