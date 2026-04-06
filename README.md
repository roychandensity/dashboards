# Les Mills Occupancy Dashboard

Real-time occupancy dashboard built for Les Mills studio locations in Auckland, New Zealand. Provides live WebSocket-based occupancy counts, historical metrics with configurable resolution, class schedule CSV upload aligned to the Les Mills schedule format, and sensor health monitoring — all powered by the Density API.

## Building Context

- **Customer:** Les Mills
- **Locations:** Britomart and other Les Mills studio locations in Auckland, New Zealand
- **Schedule format:** Supports the Les Mills CSV class schedule format for aligning occupancy data to scheduled classes

## Features

- **Live Occupancy** — Real-time occupancy counts streamed via Density WebSocket connections, with per-doorway connection status indicators
- **Historical Metrics** — View average, min, max occupancy along with entrance/exit counts across configurable date ranges with auto-scaling resolution (1m, 5m, 15m, 1h, 1d)
- **Class Schedule Upload** — Upload a Les Mills CSV class schedule to overlay occupancy data against class times, with configurable buffer windows before and after each class
- **Sensor Health** — Monitor sensor health status (healthy, degraded, offline) per doorway
- **Password Authentication** — Simple password-based login secured with encrypted session cookies via iron-session

## Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| [Next.js](https://nextjs.org/) | 15.3.3 | App Router, Turbopack, API routes |
| [React](https://react.dev/) | 19.1.0 | UI framework |
| [TypeScript](https://www.typescriptlang.org/) | 5.8.3 | Type safety |
| [Tailwind CSS](https://tailwindcss.com/) | 4 | Utility-first styling |
| [Recharts](https://recharts.org/) | 2.15.3 | Data visualization and charting |
| [iron-session](https://github.com/vvo/iron-session) | 8.0.4 | Encrypted cookie-based session management |

## Density API Endpoints

This project uses both **v2** and **v3** of the Density API.

### v2 Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/v2/spaces` | Space discovery — lists all available spaces |
| GET | `/v2/links?space_id={spaceId}` | Doorway/link information for a given space |
| GET | `/v2/spaces/{spaceId}/counts` | Historical occupancy metrics at 1m, 5m, 15m, 1h, or 1d resolution |
| GET | `/v2/spaces/{spaceId}` | Single space details |

### v3 Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/v3/sensors/health/current` | Current sensor health status per doorway |
| WebSocket | `/v3/analytics/ws/doorway/{id}/events` | Real-time doorway event stream for live occupancy |

## Getting Started

### Prerequisites

- Node.js 18+
- A Density API key with access to the relevant spaces

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

3. Create a `.env.local` file with the required environment variables (see below):

   ```bash
   cp .env.example .env.local
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm start
```

## Environment Variables

All variables should be set in `.env.local` (never commit this file).

| Variable | Required | Description |
|---|---|---|
| `DENSITY_API_KEY` | Yes | Density API key for authenticating API requests |
| `DENSITY_API_BASE_URL` | Yes | Base URL for the Density API (e.g., `https://api.density.io`) |
| `IRON_SESSION_SECRET` | Yes | Random string, 32+ characters, used to encrypt session cookies |
| `SITE_PASSWORD` | Yes | Password users enter to access the dashboard |

## CSV Schedule Format

Upload a CSV file matching the Les Mills class schedule format. The dashboard includes a downloadable template.

```
studio,date,time,class_name,instructor,buffer_before,buffer_after
Studio A,15/03/2025,09:00,Yoga,Jane,,
Studio B,15/03/2025,10:30,Spin,John,10,10
```

| Column | Format | Description |
|---|---|---|
| `studio` | Text | Must match a Density space name exactly |
| `date` | `DD/MM/YYYY` | Class date |
| `time` | `HH:MM` (24-hour) | Class start time |
| `class_name` | Text | Display label for the class |
| `instructor` | Text | Display label for the instructor |
| `buffer_before` | Integer (minutes) | Optional — minutes before class to include in the occupancy window |
| `buffer_after` | Integer (minutes) | Optional — minutes after class to include in the occupancy window |
