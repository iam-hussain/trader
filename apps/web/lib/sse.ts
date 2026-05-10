"use client";
import { useEffect, useRef } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export interface UserEvent {
  type: string;
  data: unknown;
}

/**
 * Open an EventSource to /api/sse/events. Reconnects on close with
 * exponential backoff capped at 10 s. Calls handler for every message.
 */
export function useUserEvents(handler: (e: UserEvent) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let backoff = 1000;
    let cancelled = false;

    const open = () => {
      if (cancelled) return;
      try {
        es = new EventSource(`${API}/api/sse/events`, { withCredentials: true });
      } catch {
        scheduleReconnect();
        return;
      }
      es.onopen = () => {
        backoff = 1000;
      };
      es.onmessage = (ev: MessageEvent) => {
        let payload: unknown = ev.data;
        try {
          payload = JSON.parse(ev.data);
        } catch {
          // leave as raw string
        }
        const event: UserEvent =
          payload && typeof payload === "object" && "type" in (payload as object)
            ? (payload as UserEvent)
            : { type: ev.type || "message", data: payload };
        handlerRef.current(event);
      };
      es.onerror = () => {
        es?.close();
        es = null;
        scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        backoff = Math.min(backoff * 2, 10_000);
        open();
      }, backoff);
    };

    open();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
      es = null;
    };
  }, []);
}
