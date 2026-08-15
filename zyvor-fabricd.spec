Name:           zyvor-fabricd
Version:        0.1.0
Release:        1%{?dist}
Summary:        Virtual Machine Management Daemon

License:        MIT
URL:            https://github.com/ssahani/zyvor-fabric
Source0:        %{name}-%{version}.tar.gz

BuildRequires:  cargo
BuildRequires:  rust
BuildRequires:  nodejs
BuildRequires:  npm
BuildRequires:  systemd-rpm-macros
Requires:       systemd >= 256
Recommends:     systemd-container
Recommends:     nftables
Recommends:     wireguard-tools

%description
zyvor-fabricd is a daemon for managing virtual machines with systemd-vmspawn
and systemd-machined. Provides REST API, WebSocket console, VNC proxy,
and comprehensive VM lifecycle management.

Includes zyvorctl CLI tool and zyvorctl-tui terminal interface.

%package web
Summary:        Web UI for zyvor-fabricd
Requires:       %{name} = %{version}-%{release}
BuildArch:      noarch

%description web
Web-based management interface for zyvor-fabricd. Provides a React dashboard
with 37+ pages for managing VMs, storage, network security, and more.

%prep
%autosetup

%build
%make_build

%install
%make_install PREFIX=%{_prefix}

%pre
%sysusers_create_package %{name} systemd/zyvor-fabricd.sysusers

%post
%systemd_post zyvor-fabricd.service
%tmpfiles_create %{name}.conf

%preun
%systemd_preun zyvor-fabricd.service

%postun
%systemd_postun_with_restart zyvor-fabricd.service

%files
%license LICENSE
%doc README.md
%{_bindir}/zyvor-fabricd
%{_bindir}/zyvorctl
%{_bindir}/zyvorctl-tui
%{_unitdir}/zyvor-fabricd.service
%{_unitdir}/vm@.service
%{_presetdir}/90-zyvor-fabricd.preset
%{_sysusersdir}/zyvor-fabricd.conf
%{_tmpfilesdir}/zyvor-fabricd.conf
%dir %{_sysconfdir}/zyvor-fabricd
%config(noreplace) %{_sysconfdir}/zyvor-fabricd/zyvor-fabricd.toml
%config(noreplace) %{_sysconfdir}/zyvor-fabricd/zyvor-fabricd.env
%config(noreplace) %{_sysconfdir}/modules-load.d/zyvor-fabricd.conf
%dir %attr(0755,root,root) /var/lib/zyvor-fabricd
%dir %attr(0755,root,root) /var/lib/zyvor-fabricd/images

%files web
%{_datadir}/zyvor-fabricd/web/

%changelog
* Mon Mar 03 2026 ZyvorAI Labs Private Limited <ssahani@gmail.com> - 0.1.0-1
- Initial package
- zyvor-fabricd daemon with REST API and WebSocket
- zyvorctl CLI with JSON/YAML output and 15+ subcommand groups
- zyvorctl-tui terminal UI with 8 views
- Network security (policies, firewall, service mesh, QoS, DNS, VPN, mirror, NAT, monitor)
- Ceph/RBD storage support
- systemd units with socket activation, sysusers, tmpfiles, and preset
