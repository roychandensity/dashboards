"use client";

import { useState, useEffect, useCallback } from "react";
import { MetricsBucket } from "@/lib/density-api";
import { queuedFetch } from "@/lib/fetch-queue";

interface UseHistoricalDataResult {
  data: MetricsBucket[];
  resolution: string;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useHistoricalData(
  spaceId: string,
  startDate: string,
  endDate: string,
  resolution: string
): UseHistoricalDataResult {
  const [data, setData] = useState<MetricsBucket[]>([]);
  const [actualResolution, setActualResolution] = useState(resolution);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!spaceId || !startDate || !endDate) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        resolution,
      });

      const res = await queuedFetch(
        `/api/spaces/${spaceId}/historical?${params}`
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }

      const json = await res.json();
      setData(json.results);
      setActualResolution(json.resolution);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [spaceId, startDate, endDate, resolution]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    resolution: actualResolution,
    loading,
    error,
    refetch: fetchData,
  };
}
