# TUI & GUI Enhancements

Enhanced vmspawnd TUI and Web GUI with k9s/v9s-style sophisticated interfaces.

## Terminal UI (vmctl-tui) Enhancements

### Multi-View Architecture

The TUI now features a sophisticated multi-view system with 7 different views accessible via keyboard shortcuts:

#### 1. Dashboard View
- **Stats Boxes**: Total VMs, Running, Stopped, CPU Usage
- **Compact VM List**: Shows all VMs with status indicators
- **Activity Log**: Recent system events and logs

#### 2. VMs View
- **Detailed VM List**: Shows VM name, state, CPU, and memory
- **Split Pane**: Right side shows detailed info for selected VM
- **VM Actions**: Quick access to start, stop, restart, delete operations

#### 3. Logs View
- System logs with timestamp and log level
- Color-coded by severity (INFO, WARN, ERROR)
- Real-time log streaming

#### 4. Metrics View
- CPU usage breakdown (Overall, User, System)
- Memory usage statistics
- Network I/O stats

#### 5. Network View
- Network bridge configuration
- VLAN information
- IP addressing details

#### 6. Storage View
- Storage pool information
- Capacity and usage statistics
- Volume and snapshot counts

#### 7. Help View
- Complete keyboard shortcut reference
- Navigation instructions
- VM action commands

### Keyboard Shortcuts

#### View Navigation
- `1-6`: Direct view switching (Dashboard, VMs, Logs, Metrics, Network, Storage)
- `?`: Show Help view
- `Tab`: Next view
- `Shift+Tab`: Previous view

#### List Navigation
- `↑/k`: Move up
- `↓/j`: Move down (vim-style)
- `PageUp`: Jump up 10 items
- `PageDown`: Jump down 10 items
- `Home`: Jump to first item
- `End`: Jump to last item

#### VM Actions
- `s`: Start selected VM
- `t`: Stop selected VM (t for "terminate")
- `r`: Restart selected VM
- `d`: Delete selected VM
- `R`: Refresh data

#### General
- `q/Q`: Quit application

### UI Components

#### Tab Bar
- Top bar showing all available views
- Active view highlighted in yellow with underline
- Shows application name "vmspawnd TUI"

#### Dynamic Footer
- Context-sensitive help based on current view
- Shows relevant shortcuts for the active view
- Gray colored for non-intrusive display

#### Color Scheme
- **Running VMs**: Green (●)
- **Stopped VMs**: Red (○)
- **Paused VMs**: Yellow (◐)
- **Selected Items**: Yellow highlight with bold
- **Log Levels**:
  - INFO: Cyan
  - WARN: Yellow
  - ERROR: Red

### Technical Implementation

#### File Structure
```
vmctl-tui/src/
├── main.rs       # Event loop & keyboard handling
├── app.rs        # Application state & VM operations
├── ui.rs         # Main UI rendering & view routing
└── views.rs      # Individual view rendering functions
```

#### Key Features
- **Async Runtime**: Tokio for non-blocking VM operations
- **Auto-refresh**: Every 5 seconds when idle
- **State Management**: Centralized App state
- **API Integration**: reqwest HTTP client for vmspawnd REST API
- **Responsive Layout**: ratatui constraint-based layouts

## Web GUI (React) Enhancements

### Enhanced Dashboard

#### Stats Cards (4 KPI Metrics)
1. **Total VMs** (Blue)
   - VM count with trend indicator
   - Shows percentage change

2. **Running VMs** (Green)
   - Count of active VMs
   - Trend showing growth

3. **Total vCPUs** (Purple)
   - Aggregate CPU allocation
   - Across all VMs

4. **Total Memory** (Orange)
   - Total RAM allocation in GB
   - Across all VMs

#### Real-time Charts
1. **CPU Usage Chart** (Area Chart)
   - Shows last 60 seconds of CPU activity
   - Blue gradient fill
   - Smooth animation
   - Responsive design

2. **Memory Usage Chart** (Line Chart)
   - Shows last 60 seconds of memory activity
   - Green line graph
   - Real-time updates every 5 seconds

#### VM List
- Top 5 recent VMs
- Color-coded status indicators:
  - Green: Running
  - Red: Stopped
  - Yellow: Paused
- Shows vCPUs and RAM allocation
- Hover effect for interactivity

#### Activity Feed
- Recent system events
- Color-coded by type:
  - Success: Green
  - Warning: Yellow
  - Info: Blue
  - Error: Red
- Timestamp for each event
- Icon indicators

### Visual Design

#### Color Palette
- **Background**: Dark gray (#111827)
- **Cards**: Medium gray (#1F2937)
- **Borders**: Light gray (#374151)
- **Text**: White / Gray
- **Accents**:
  - Blue: #3B82F6
  - Green: #10B981
  - Yellow: #F59E0B
  - Red: #EF4444
  - Purple: #8B5CF6
  - Orange: #F97316

#### Components
- **Loading Spinner**: Blue animated spinner
- **Stat Cards**: Icon + Value + Trend
- **Charts**: Recharts with dark theme
- **Tooltips**: Dark background with border

### Technical Stack

#### Frontend Libraries
- **React 18**: Modern React with hooks
- **Recharts**: Data visualization
- **Lucide React**: Icon library
- **TailwindCSS**: Utility-first styling

#### Features
- Auto-refresh every 5 seconds
- Responsive grid layouts
- Smooth transitions and animations
- Real-time data updates
- Mock metrics generation

## Comparison: k9s-style Features

### Implemented k9s-style Features

✅ **Multi-view Navigation**: Tab-based view switching
✅ **Keyboard Shortcuts**: Comprehensive vim-style navigation
✅ **Real-time Updates**: Auto-refresh functionality
✅ **Color-coded Status**: Visual VM state indicators
✅ **Contextual Footer**: Dynamic help based on view
✅ **Split Pane Details**: Selected item detail view
✅ **Resource Metrics**: CPU, memory, network stats
✅ **Activity Logs**: Real-time event streaming
✅ **Quick Actions**: Single-key VM operations
✅ **Modern UI**: Clean, professional design

### TUI vs GUI Feature Parity

| Feature | TUI | Web GUI |
|---------|-----|---------|
| Dashboard | ✅ | ✅ |
| VM List | ✅ | ✅ |
| VM Details | ✅ | ✅ |
| Metrics | ✅ | ✅ (Charts) |
| Logs | ✅ | Planned |
| Network | ✅ | Planned |
| Storage | ✅ | Planned |
| Keyboard Nav | ✅ | N/A |
| Mouse Support | Limited | ✅ |
| Charts | N/A | ✅ |
| Search | Planned | Planned |

## Build & Run

### TUI
```bash
cd backend/vmctl-tui
cargo build --release
./target/release/vmctl-tui
```

### Web GUI
```bash
cd web
npm install
npm run dev
```

## Future Enhancements

### TUI
- [ ] Search/filter functionality (field exists)
- [ ] VM console integration
- [ ] Resource usage graphs (sparklines)
- [ ] Bulk operations
- [ ] Configuration panel

### Web GUI
- [ ] Logs view
- [ ] Network view
- [ ] Storage view
- [ ] Search functionality
- [ ] Bulk VM operations
- [ ] Dark/light theme toggle
- [ ] WebSocket real-time updates

## Summary

The vmspawnd TUI and Web GUI have been significantly enhanced to provide a k9s/v9s-style professional interface with:

- **7 comprehensive views** in TUI
- **Extensive keyboard shortcuts** for power users
- **Real-time metrics and charts** in Web GUI
- **Consistent color coding** across interfaces
- **Responsive, modern design** in both TUI and GUI
- **Professional UX** matching industry-leading tools

These enhancements make vmspawnd a pleasure to use for both terminal-focused and GUI-preferring users.
