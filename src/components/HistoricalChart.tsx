"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { MetricsBucket } from "@/lib/density-api";

interface HistoricalChartProps {
  data: MetricsBucket[];
  loading: boolean;
  error: string | null;
  doorways?: { id: string; name: string }[];
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString("en-NZ", {
    timeZone: "Pacific/Auckland",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HistoricalChart({
  data,
  loading,
  error,
  doorways,
}: HistoricalChartProps) {
  const header = (
    <>
      <h2 className="text-lg font-semibold text-gray-700 mb-1">
        Historical Occupancy
      </h2>
      {doorways && doorways.length > 0 && (
        <p className="text-sm text-gray-500 mb-4">
          Doorways: {doorways.map((d) => d.name).join(", ")}
        </p>
      )}
    </>
  );

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-md p-6">
        {header}
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-400 animate-pulse">Loading chart data...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-md p-6">
        {header}
        <div className="flex items-center justify-center h-64">
          <div className="text-red-500 text-sm">{error}</div>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-md p-6">
        {header}
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-400">No data for selected range</div>
        </div>
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    label: formatTimestamp(d.timestamp),
  }));

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      {header}
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            interval="preserveStartEnd"
          />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Line
            type="monotone"
            dataKey="occupancy_avg"
            name="Avg Occupancy"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="occupancy_max"
            name="Max Occupancy"
            stroke="#ef4444"
            strokeWidth={1}
            strokeDasharray="4 4"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="entrances"
            name="Entrances"
            stroke="#22c55e"
            strokeWidth={1}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="exits"
            name="Exits"
            stroke="#f59e0b"
            strokeWidth={1}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
