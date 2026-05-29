Name:           vmspawnd
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
vmspawnd is a daemon for managing virtual machines with systemd-vmspawn
and systemd-machined. Provides REST API, WebSocket console, VNC proxy,
and comprehensive VM lifecycle management.

Includes vmctl CLI tool and vmctl-tui terminal interface.

%package web
Summary:        Web UI for vmspawnd
Requires:       %{name} = %{version}-%{release}
BuildArch:      noarch

%description web
Web-based management interface for vmspawnd. Provides a React dashboard
with 37+ pages for managing VMs, storage, network security, and more.

%prep
%autosetup

%build
%make_build

%install
%make_install PREFIX=%{_prefix}

%pre
%sysusers_create_package %{name} systemd/vmspawnd.sysusers

%post
%systemd_post vmspawnd.service vmspawnd.socket
%tmpfiles_create %{name}.conf

%preun
%systemd_preun vmspawnd.service vmspawnd.socket

%postun
%systemd_postun_with_restart vmspawnd.service

%files
%license LICENSE
%doc README.md
%{_bindir}/vmspawnd
%{_bindir}/vmctl
%{_bindir}/vmctl-tui
%{_unitdir}/vmspawnd.service
%{_unitdir}/vmspawnd.socket
%{_unitdir}/vm@.service
%{_presetdir}/90-vmspawnd.preset
%{_sysusersdir}/vmspawnd.conf
%{_tmpfilesdir}/vmspawnd.conf
%dir %{_sysconfdir}/vmspawnd
%config(noreplace) %{_sysconfdir}/vmspawnd/vmspawnd.toml
%config(noreplace) %{_sysconfdir}/vmspawnd/vmspawnd.env
%config(noreplace) %{_sysconfdir}/modules-load.d/vmspawnd.conf
%dir %attr(0755,root,root) /var/lib/vmspawnd
%dir %attr(0755,root,root) /var/lib/vmspawnd/images

%files web
%{_datadir}/vmspawnd/web/

%changelog
* Mon Mar 03 2026 ZyvorAI Labs Private Limited <ssahani@gmail.com> - 0.1.0-1
- Initial package
- vmspawnd daemon with REST API and WebSocket
- vmctl CLI with JSON/YAML output and 15+ subcommand groups
- vmctl-tui terminal UI with 8 views
- Network security (policies, firewall, service mesh, QoS, DNS, VPN, mirror, NAT, monitor)
- Ceph/RBD storage support
- systemd units with socket activation, sysusers, tmpfiles, and preset
