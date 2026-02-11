const API_BASE = process.env.DENSITY_API_BASE_URL || "https://api.density.io";
const API_KEY = process.env.DENSITY_API_KEY!;

// Density resolution limits (max time ranges)
const RESOLUTION_LIMITS: Record<string, number> = {
  "1m": 4 * 60 * 60 * 1000, // 4 hours
  "5m": 24 * 60 * 60 * 1000, // 1 day
  "15m": 3 * 24 * 60 * 60 * 1000, // 3 days
  "1h": 31 * 24 * 60 * 60 * 1000, // 31 days
  "1d": 366 * 24 * 60 * 60 * 1000, // 366 days
};

const RESOLUTION_ORDER = ["1m", "5m", "15m", "1h", "1d"];

/**
 * Given a requested resolution and time range, return a valid resolution.
 * If the requested resolution exceeds Density's max range, downgrade automatically.
 */
export function getValidResolution(
  requestedResolution: string,
  startDate: string,
  endDate: string
): string {
  const rangeMs =
    new Date(endDate).getTime() - new Date(startDate).getTime();
  const startIdx = RESOLUTION_ORDER.indexOf(requestedResolution);
  const searchFrom = startIdx >= 0 ? startIdx : 0;

  for (let i = searchFrom; i < RESOLUTION_ORDER.length; i++) {
    const res = RESOLUTION_ORDER[i];
    if (rangeMs <= RESOLUTION_LIMITS[res]) {
      return res;
    }
  }

  return "1d"; // fallback to coarsest
}

export interface HistoricalMetricsParams {
  spaceId: string;
  startDate: string;
  endDate: string;
  resolution: string;
}

export interface MetricsBucket {
  timestamp: string;
  occupancy_avg: number | null;
  occupancy_max: number | null;
  occupancy_min: number | null;
  entrances: number;
  exits: number;
}

export interface MetricsResponse {
  results: MetricsBucket[];
  resolution: string;
}

export async function fetchHistoricalMetrics(
  params: HistoricalMetricsParams
): Promise<MetricsResponse> {
  const resolution = getValidResolution(
    params.resolution,
    params.startDate,
    params.endDate
  );

  const formatTime = (iso: string) =>
    new Date(iso).toISOString().replace(/\.\d{3}Z$/, "");

  const qs = new URLSearchParams({
    start_time: formatTime(params.startDate),
    end_time: formatTime(params.endDate),
    interval: resolution,
    order: "asc",
  });

  let url: string | null =
    `${API_BASE}/v2/spaces/${params.spaceId}/counts?${qs}`;

  console.log("[Density Counts] Fetching:", url);

  const allResults: MetricsBucket[] = [];

  while (url) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Density API error (${res.status}): ${text}`);
    }

    const data = await res.json();

    if (data.results) {
      for (const r of data.results) {
        const a = r.interval?.analytics;
        allResults.push({
          timestamp: r.timestamp,
          occupancy_avg: r.count ?? null,
          occupancy_max: a?.max ?? null,
          occupancy_min: a?.min ?? null,
          entrances: a?.entrances ?? 0,
          exits: a?.exits ?? 0,
        });
      }
    }

    url = data.next || null;
  }

  console.log(
    `[Density Counts] ${params.spaceId} | ${resolution} | ${allResults.length} buckets`
  );

  return { results: allResults, resolution };
}

export interface DensityDoorway {
  id: string;
  name: string;
}

export interface DensitySpace {
  id: string;
  name: string;
  capacity: number | null;
  doorways: DensityDoorway[];
}

async function fetchDoorwaysForSpace(
  spaceId: string
): Promise<DensityDoorway[]> {
  const res = await fetch(
    `${API_BASE}/v2/links?space_id=${spaceId}`,
    {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Density API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const links = data.results || data;
  return (Array.isArray(links) ? links : []).map(
    (link: Record<string, unknown>) => ({
      id: String(link.doorway_id ?? link.id),
      name: (link.doorway_name as string) ?? (link.name as string) ?? String(link.doorway_id ?? link.id),
    })
  );
}

export async function fetchSpaces(): Promise<DensitySpace[]> {
  const res = await fetch(`${API_BASE}/v2/spaces`, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Density API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const rawSpaces = data.results || data;

  const spaces: DensitySpace[] = await Promise.all(
    (rawSpaces as Record<string, unknown>[]).map(async (s) => {
      const doorways = await fetchDoorwaysForSpace(s.id as string);
      return {
        id: s.id as string,
        name: s.name as string,
        capacity: (s.capacity ?? s.target_capacity ?? null) as number | null,
        doorways,
      };
    })
  );

  return spaces;
}

export async function fetchSpace(spaceId: string): Promise<DensitySpace> {
  const res = await fetch(`${API_BASE}/v2/spaces/${spaceId}`, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Density API error (${res.status}): ${text}`);
  }

  const s = await res.json();
  const doorways = await fetchDoorwaysForSpace(spaceId);

  return {
    id: s.id,
    name: s.name,
    capacity: s.capacity ?? s.target_capacity ?? null,
    doorways,
  };
}

export interface SensorHealth {
  doorway_id: string;
  serial_number: string;
  health_status: "healthy" | "degraded" | "offline" | "unknown";
}

export async function fetchSensorHealth(): Promise<SensorHealth[]> {
  const res = await fetch(`${API_BASE}/v3/sensors/health/current`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[Sensor Health] API error (${res.status}): ${text}`);
    return [];
  }

  const data = await res.json();
  const results = data.results || data;
  if (!Array.isArray(results)) return [];

  return results.map((r: Record<string, unknown>) => ({
    doorway_id: String(r.doorway_id ?? ""),
    serial_number: String(r.serial_number ?? ""),
    health_status: (r.health_status as SensorHealth["health_status"]) ?? "unknown",
  }));
}

export async function getWebSocketUrl(doorwayId: string): Promise<string> {
  const res = await fetch(
    `${API_BASE}/v3/analytics/ws/doorway/${doorwayId}/events`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Density WS broker error (${res.status}): ${text}`
    );
  }

  const data = await res.json();
  return data.ws_url;
}
