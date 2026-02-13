"use client";

import { useState, useEffect } from "react";
import { getNowNZ, addMinutesNZ } from "@/lib/nz-time";

export type ClassStatus = "upcoming" | "live" | "completed" | "no-time";

export function useClassStatus(
  date: string,
  time: string,
  bufferBefore: number,
  bufferAfter: number
): ClassStatus {
  const [status, setStatus] = useState<ClassStatus>(() =>
    compute(date, time, bufferBefore, bufferAfter)
  );

  useEffect(() => {
    if (!time || !date) {
      setStatus("no-time");
      return;
    }

    // Compute immediately on param change
    setStatus(compute(date, time, bufferBefore, bufferAfter));

    const id = setInterval(() => {
      setStatus(compute(date, time, bufferBefore, bufferAfter));
    }, 15_000);

    return () => clearInterval(id);
  }, [date, time, bufferBefore, bufferAfter]);

  return status;
}

function compute(
  date: string,
  time: string,
  bufferBefore: number,
  bufferAfter: number
): ClassStatus {
  if (!time || !date) return "no-time";

  const now = getNowNZ();
  const windowStart = addMinutesNZ(date, time, -bufferBefore);
  const windowEnd = addMinutesNZ(date, time, bufferAfter);

  if (now < windowStart) return "upcoming";
  if (now <= windowEnd) return "live";
  return "completed";
}
