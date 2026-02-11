"use client";

import { useState } from "react";

/** Format a Date as "YYYY-MM-DDTHH:MM" in Pacific/Auckland for datetime-local inputs */
function toNZLocal(date: Date): string {
  return date
    .toLocaleString("sv-SE", { timeZone: "Pacific/Auckland" })
    .slice(0, 16)
    .replace(" ", "T");
}

interface DateRangePickerProps {
  defaultStartDate: string;
  defaultEndDate: string;
  defaultResolution: string;
  onApply: (startDate: string, endDate: string, resolution: string) => void;
}

const PRESETS = [
  { label: "Last 4 Hours", hours: 4, resolution: "1m" },
  { label: "Today", hours: 24, resolution: "5m" },
  { label: "Last 7 Days", hours: 7 * 24, resolution: "1h" },
  { label: "Last 30 Days", hours: 30 * 24, resolution: "1d" },
];

export default function DateRangePicker({
  defaultStartDate,
  defaultEndDate,
  defaultResolution,
  onApply,
}: DateRangePickerProps) {
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [resolution, setResolution] = useState(defaultResolution);

  const applyPreset = (hours: number, res: string) => {
    const end = new Date();
    const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
    const s = toNZLocal(start);
    const e = toNZLocal(end);
    setStartDate(s);
    setEndDate(e);
    setResolution(res);
    onApply(s, e, res);
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-4">
      <div className="flex flex-wrap gap-2 mb-4">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => applyPreset(preset.hours, preset.resolution)}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-4 items-end" lang="en-NZ">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Start
          </label>
          <input
            type="datetime-local"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            End
          </label>
          <input
            type="datetime-local"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Resolution
          </label>
          <select
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="1m">1 minute</option>
            <option value="5m">5 minutes</option>
            <option value="15m">15 minutes</option>
            <option value="1h">1 hour</option>
            <option value="1d">1 day</option>
          </select>
        </div>
        <button
          onClick={() => onApply(startDate, endDate, resolution)}
          className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
