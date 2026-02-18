# Web UI

Modern React-based web interface for vmspawnd.

## Features

- Dashboard with VM overview
- Create/start/stop/delete VMs
- Real-time status updates
- Responsive design
- Dark theme

## Technology Stack

- React 18
- TypeScript
- Vite
- TailwindCSS
- React Router
- Recharts (metrics)
- Lucide React (icons)

## Development

```bash
cd web
npm install
npm run dev
```

Access at `http://localhost:3000`

## Production Build

```bash
npm run build
```

Output in `dist/` directory.

## Pages

### Dashboard
- VM count statistics
- Recent VMs list
- Quick status overview

### VM List
- Grid of VM cards
- Quick actions (start/stop/delete)
- Status indicators

### VM Details
- Full VM information
- Control buttons
- Metrics (planned)

### Create VM
- Form-based VM creation
- Validation
- Error handling

### Console
- Terminal access (planned)
- WebSocket connection (planned)

## API Integration

All API calls go through `/api` proxy in development.

In production, served by vmspawnd daemon.

## Customization

Edit `tailwind.config.js` for theme customization.

## Future Features

- Real-time WebSocket updates
- xterm.js console integration
- noVNC viewer
- Metrics graphs
- VM templates
