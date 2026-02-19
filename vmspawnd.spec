Name:           vmspawnd
Version:        0.1.0
Release:        1%{?dist}
Summary:        Virtual Machine Spawn Daemon

License:        MIT
URL:            https://github.com/vmspawnd/vmspawnd
Source0:        %{name}-%{version}.tar.gz

BuildRequires:  rust
BuildRequires:  cargo
BuildRequires:  nodejs
BuildRequires:  npm
BuildRequires:  systemd-rpm-macros

Requires:       systemd

%description
vmspawnd is a daemon for managing virtual machines with systemd-vmspawn.
Includes vmctl CLI and vmctl-tui terminal interface.

%package web
Summary:        Web UI for vmspawnd
Requires:       %{name} = %{version}-%{release}
BuildArch:      noarch

%description web
Web-based management interface for vmspawnd. Provides a browser UI
for managing virtual machines.

%prep
%autosetup

%build
%make_build build

%install
%make_install PREFIX=%{_prefix}

%pre
%systemd_pre vmspawnd.service

%post
%systemd_post vmspawnd.service

%preun
%systemd_preun vmspawnd.service

%postun
%systemd_postun_with_restart vmspawnd.service

%files
%license LICENSE
%doc README.md
%{_bindir}/vmspawnd
%{_bindir}/vmctl
%{_bindir}/vmctl-tui
%{_unitdir}/vmspawnd.service
%{_unitdir}/vm@.service
%dir %{_sysconfdir}/vmspawnd
%config(noreplace) %{_sysconfdir}/vmspawnd/vmspawnd.toml
%dir /var/lib/vmspawnd

%files web
%{_datadir}/vmspawnd/web/
