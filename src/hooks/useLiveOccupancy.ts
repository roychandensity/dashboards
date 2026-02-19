"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface DoorwayState {
  count: number;
  entrances: number;
  exits: number;
  connected: boolean;
}

export interface LiveEvent {
  doorwayId: string;
  direction: 1 | -1;
  timestamp: Date;
}

interface UseLiveOccupancyResult {
  totalCount: number;
  totalEntrances: number;
  totalExits: number;
  allConnected: boolean;
  anyConnected: boolean;
  doorwayStates: Record<string, DoorwayState>;
  events: LiveEvent[];
  resetCounts: () => void;
}

const RECONNECT_DELAY = 3000;
const MAX_EVENTS = 200;

export function useLiveOccupancy(
  doorwayIds: string[]
): UseLiveOccupancyResult {
  const [doorwayStates, setDoorwayStates] = useState<
    Record<string, DoorwayState>
  >({});
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const wsRefs = useRef<Record<string, WebSocket>>({});
  const reconnectTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const connectDoorway = useCallback(
    (doorwayId: string) => {
      // Fetch ws_url from our broker
      fetch(`/api/ws-broker/${doorwayId}`)
        .then((res) => {
          if (!res.ok) throw new Error(`Broker returned ${res.status}`);
          return res.json();
        })
        .then(({ ws_url }) => {
          // Clean up any existing connection
          if (wsRefs.current[doorwayId]) {
            wsRefs.current[doorwayId].close();
          }

          const ws = new WebSocket(ws_url);
          wsRefs.current[doorwayId] = ws;

          ws.onopen = () => {
            setDoorwayStates((prev) => ({
              ...prev,
              [doorwayId]: {
                count: prev[doorwayId]?.count || 0,
                entrances: prev[doorwayId]?.entrances || 0,
                exits: prev[doorwayId]?.exits || 0,
                connected: true,
              },
            }));
          };

          ws.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              // direction: 1 = entry, -1 = exit
              if (typeof data.direction === "number") {
                const dir = data.direction as 1 | -1;
                setDoorwayStates((prev) => {
                  const cur = prev[doorwayId];
                  return {
                    ...prev,
                    [doorwayId]: {
                      ...cur,
                      count: (cur?.count || 0) + dir,
                      entrances: (cur?.entrances || 0) + (dir === 1 ? 1 : 0),
                      exits: (cur?.exits || 0) + (dir === -1 ? 1 : 0),
                    },
                  };
                });
                setEvents((prev) => {
                  const next = [...prev, { doorwayId, direction: dir, timestamp: new Date() }];
                  return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
                });
              }
            } catch {
              // Ignore non-JSON messages (heartbeats, etc.)
            }
          };

          ws.onclose = () => {
            setDoorwayStates((prev) => ({
              ...prev,
              [doorwayId]: {
                count: prev[doorwayId]?.count || 0,
                entrances: prev[doorwayId]?.entrances || 0,
                exits: prev[doorwayId]?.exits || 0,
                connected: false,
              },
            }));
            // Reconnect after delay
            reconnectTimers.current[doorwayId] = setTimeout(() => {
              connectDoorway(doorwayId);
            }, RECONNECT_DELAY);
          };

          ws.onerror = () => {
            ws.close();
          };
        })
        .catch((err) => {
          console.error(`Failed to connect doorway ${doorwayId}:`, err);
          setDoorwayStates((prev) => ({
            ...prev,
            [doorwayId]: {
              count: prev[doorwayId]?.count || 0,
              entrances: prev[doorwayId]?.entrances || 0,
              exits: prev[doorwayId]?.exits || 0,
              connected: false,
            },
          }));
          // Retry
          reconnectTimers.current[doorwayId] = setTimeout(() => {
            connectDoorway(doorwayId);
          }, RECONNECT_DELAY);
        });
    },
    []
  );

  const doorwayKey = doorwayIds.join(",");

  useEffect(() => {
    // Initialize states
    const initial: Record<string, DoorwayState> = {};
    for (const id of doorwayIds) {
      initial[id] = { count: 0, entrances: 0, exits: 0, connected: false };
    }
    setDoorwayStates(initial);
    setEvents([]);

    // Connect all doorways
    for (const id of doorwayIds) {
      connectDoorway(id);
    }

    return () => {
      // Cleanup all connections
      for (const id of doorwayIds) {
        if (wsRefs.current[id]) {
          wsRefs.current[id].close();
        }
        if (reconnectTimers.current[id]) {
          clearTimeout(reconnectTimers.current[id]);
        }
      }
      wsRefs.current = {};
      reconnectTimers.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doorwayKey, connectDoorway]);

  const resetCounts = useCallback(() => {
    setDoorwayStates((prev) => {
      const next: Record<string, DoorwayState> = {};
      for (const [id, state] of Object.entries(prev)) {
        next[id] = { ...state, count: 0, entrances: 0, exits: 0 };
      }
      return next;
    });
    setEvents([]);
  }, []);

  const vals = Object.values(doorwayStates);
  const totalCount = vals.reduce((sum, s) => sum + s.count, 0);
  const totalEntrances = vals.reduce((sum, s) => sum + s.entrances, 0);
  const totalExits = vals.reduce((sum, s) => sum + s.exits, 0);
  const allConnected =
    doorwayIds.length > 0 &&
    doorwayIds.every((id) => doorwayStates[id]?.connected);
  const anyConnected = doorwayIds.some(
    (id) => doorwayStates[id]?.connected
  );

  return {
    totalCount,
    totalEntrances,
    totalExits,
    allConnected,
    anyConnected,
    doorwayStates,
    events,
    resetCounts,
  };
}
