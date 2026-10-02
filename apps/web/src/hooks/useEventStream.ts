import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, fetchGraphSnapshot, fetchWsTicket } from "../services/api";
import { useAuthStore } from "../stores/useAuthStore";
import { useGraphStore } from "../stores/useGraphStore";
import type { ConnectionStatus, DecisionEvent, EventEnvelope } from "../types/graph";

const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;

export function getWsUrl(ticket: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return `${protocol}//${host}/ws/events?ticket=${encodeURIComponent(ticket)}`;
}

export function useEventStream() {
  const sessionToken = useAuthStore((s) => s.sessionToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);

  const applySnapshot = useGraphStore((s) => s.applySnapshot);
  const applyEvent = useGraphStore((s) => s.applyEvent);

  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [retryCount, setRetryCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const bufferedEventsRef = useRef<DecisionEvent[]>([]);
  const isHydratedRef = useRef<boolean>(false);
  const isIntentionallyClosedRef = useRef<boolean>(false);

  const cleanupSocket = useCallback(() => {
    if (reconnectTimeoutRef.current !== null) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      isIntentionallyClosedRef.current = true;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(async () => {
    if (!sessionToken || !isAuthenticated) {
      setStatus("disconnected");
      return;
    }

    cleanupSocket();
    isIntentionallyClosedRef.current = false;
    bufferedEventsRef.current = [];
    isHydratedRef.current = false;

    setStatus((prev) => (prev === "reconnecting" ? "reconnecting" : "connecting"));
    setError(null);

    let ticket: string;
    try {
      // 1. Mint fresh single-use WebSocket ticket
      const ticketResp = await fetchWsTicket(sessionToken);
      ticket = ticketResp.ticket;
    } catch (err: unknown) {
      if (
        (err instanceof ApiError && err.status === 401) ||
        (err instanceof Error && err.message.includes("401"))
      ) {
        logout();
      }
      const errMsg = err instanceof Error ? err.message : "Failed to obtain WebSocket ticket";
      setError(errMsg);
      setStatus("disconnected");
      return;
    }

    try {
      const socket = new WebSocket(getWsUrl(ticket));
      wsRef.current = socket;

      socket.onopen = async () => {
        setStatus("connected");
        setRetryCount(0);
        setError(null);

        // 2. Fetch snapshot to initialize baseline state
        try {
          const snapshot = await fetchGraphSnapshot(sessionToken);
          applySnapshot(snapshot);

          // 3. Replay buffered events arrived during snapshot fetch
          const buffered = bufferedEventsRef.current;
          for (const ev of buffered) {
            if (ev.audit_seq > snapshot.latest_audit_seq) {
              applyEvent(ev);
            }
          }
          bufferedEventsRef.current = [];
          isHydratedRef.current = true;
        } catch (snapErr: unknown) {
          const snapMsg = snapErr instanceof Error ? snapErr.message : "Snapshot fetch failed";
          setError(snapMsg);
        }
      };

      socket.onmessage = async (event: MessageEvent) => {
        try {
          const envelope: EventEnvelope = JSON.parse(event.data);

          // Handle server-side queue overflow instruction
          if (envelope.type === "stream.resync") {
            try {
              const freshSnapshot = await fetchGraphSnapshot(sessionToken);
              applySnapshot(freshSnapshot);
            } catch {
              // Ignore snapshot refetch failure during resync
            }
            return;
          }

          if (envelope.type === "action.decided") {
            const decision = envelope.payload as unknown as DecisionEvent;
            if (!isHydratedRef.current) {
              // Buffer until initial snapshot finishes applying
              bufferedEventsRef.current.push(decision);
            } else {
              applyEvent(decision);
            }
          }
        } catch {
          // Ignore invalid non-JSON frames
        }
      };

      socket.onclose = () => {
        if (isIntentionallyClosedRef.current) {
          setStatus("disconnected");
          return;
        }

        // Exponential backoff reconnection
        setRetryCount((prev) => {
          const nextCount = prev + 1;
          if (nextCount > MAX_RECONNECT_ATTEMPTS) {
            setStatus("disconnected");
            setError("Maximum reconnection attempts reached");
            return nextCount;
          }

          setStatus("reconnecting");
          const delay = Math.min(
            BASE_RECONNECT_DELAY_MS * Math.pow(2, prev),
            MAX_RECONNECT_DELAY_MS,
          );
          reconnectTimeoutRef.current = window.setTimeout(() => {
            connect();
          }, delay);

          return nextCount;
        });
      };

      socket.onerror = () => {
        // Close event will follow and trigger reconnection
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "WebSocket initialization error";
      setError(msg);
      setStatus("disconnected");
    }
  }, [sessionToken, isAuthenticated, applySnapshot, applyEvent, cleanupSocket]);

  const manualReconnect = useCallback(() => {
    setRetryCount(0);
    connect();
  }, [connect]);

  useEffect(() => {
    if (isAuthenticated && sessionToken) {
      connect();
    } else {
      cleanupSocket();
      setStatus("disconnected");
    }

    return () => {
      cleanupSocket();
    };
  }, [isAuthenticated, sessionToken, connect, cleanupSocket]);

  return {
    status,
    retryCount,
    error,
    reconnect: manualReconnect,
  };
}
