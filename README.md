# Density Occupancy Dashboard

A Next.js dashboard for monitoring live and historical occupancy data from Density sensors.

## Features

- **Live Occupancy** — Real-time occupancy counts via Density WebSocket streams, with per-doorway connection status
- **Historical Charts** — View historical occupancy metrics (avg/min/max, entrances/exits) with configurable date ranges and auto-scaling resolution
- **Schedule Upload** — Upload a CSV class schedule to view occupancy data aligned to class times, with configurable buffer windows
- **Sensor Health** — Surface sensor health status (healthy/degraded/offline) per doorway
- **Password Authentication** — Simple password-based login using iron-session

## Tech Stack

- [Next.js 15](https://nextjs.org/) (App Router, Turbopack)
- [React 19](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS 4](https://tailwindcss.com/)
- [Recharts](https://recharts.org/) for data visualization
- [iron-session](https://github.com/vvo/iron-session) for session management

## Getting Started

### Prerequisites

- Node.js 18+
- A Density API key

### Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/roychandensity/dashboards.git
   cd dashboards
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy the example environment file and fill in your values:

   ```bash
   cp .env.example .env.local
   ```

   | Variable | Description |
   |---|---|
   | `SITE_PASSWORD` | Password users enter to access the dashboard |
   | `IRON_SESSION_SECRET` | A random string (32+ characters) for encrypting session cookies |
   | `DENSITY_API_KEY` | Your Density API key |
   | `DENSITY_API_BASE_URL` | Density API base URL (defaults to `https://api.density.io`) |

4. Start the development server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production

```bash
npm run build
npm start
```

## CSV Schedule Format

Upload a CSV with the following columns:

```
studio,date,time,class_name,instructor,buffer_before,buffer_after
Studio A,15/03/2025,09:00,Yoga,Jane,,
Studio B,15/03/2025,10:30,Spin,John,10,10
```

- **studio** — Must match a Density space name
- **date** — `DD/MM/YYYY` format
- **time** — `HH:MM` (24-hour)
- **class_name** / **instructor** — Display labels
- **buffer_before** / **buffer_after** — Optional per-class buffer overrides (minutes)

You can download a pre-filled template from the dashboard.
