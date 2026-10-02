import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEventStream } from "../hooks/useEventStream";
import { useAuthStore } from "../stores/useAuthStore";
import { useGraphStore } from "../stores/useGraphStore";
import * as api from "../services/api";
import type { GraphSnapshot, DecisionEvent } from "../types/graph";

// Mock WebSocket implementation
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  simulateOpen() {
    if (this.onopen) this.onopen();
  }

  simulateMessage(data: unknown) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent("message", { data: JSON.stringify(data) }));
    }
  }

  simulateClose() {
    if (this.onclose) this.onclose();
  }

  simulateError() {
    if (this.onerror) this.onerror();
  }

  close() {
    this.simulateClose();
  }
}

function makeDecision(seq: number): DecisionEvent {
  return {
    decision_id: `dec-${seq}`,
    action_id: `act-${seq}`,
    agent_id: "ag-1",
    agent_name: "Support-Bot",
    tool_id: "crm.read_ticket",
    outcome: "allow",
    rule_id: "R1-allow-read-tickets",
    risk_score: 0.1,
    session_id: "sess-1",
    parent_action_id: null,
    audit_seq: seq,
    data_classes: [],
    latency_ms: 5.0,
  };
}

describe("useEventStream", () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    useAuthStore.setState({
      sessionToken: "valid-session-token",
      isAuthenticated: true,
      mode: "admin",
    });
    useGraphStore.getState().clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    vi.useRealTimers();
  });

  it("mints a fresh single-use ticket on connection", async () => {
    const fetchTicketSpy = vi.spyOn(api, "fetchWsTicket").mockResolvedValueOnce({
      ticket: "prh_wstk_single_use_abc",
      expires_in: 30,
    });
    vi.spyOn(api, "fetchGraphSnapshot").mockResolvedValueOnce({
      latest_audit_seq: 10,
      agents: [],
      tools: [],
      grants: [],
      recent_decisions: [],
    });

    const { result } = renderHook(() => useEventStream());

    // Flush promises
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchTicketSpy).toHaveBeenCalledWith("valid-session-token");
    expect(MockWebSocket.instances.length).toBe(1);
    expect(MockWebSocket.instances[0]!.url).toContain("ticket=prh_wstk_single_use_abc");
    expect(result.current.status).toBe("connecting");
  });

  it("buffers events arriving during snapshot fetch and applies only newer events (subscribe-buffer-snapshot flow)", async () => {
    vi.spyOn(api, "fetchWsTicket").mockResolvedValueOnce({
      ticket: "ticket-1",
      expires_in: 30,
    });

    let resolveSnapshot!: (val: GraphSnapshot) => void;
    const snapshotPromise = new Promise<GraphSnapshot>((resolve) => {
      resolveSnapshot = resolve;
    });
    vi.spyOn(api, "fetchGraphSnapshot").mockReturnValueOnce(snapshotPromise);

    renderHook(() => useEventStream());

    await act(async () => {
      await Promise.resolve();
    });

    const socket = MockWebSocket.instances[0]!;

    // Socket connects
    await act(async () => {
      socket.simulateOpen();
    });

    // While snapshot is in flight, receive two events: seq 8 (stale) and seq 12 (newer)
    await act(async () => {
      socket.simulateMessage({
        event_id: "ev-1",
        timestamp: new Date().toISOString(),
        type: "action.decided",
        payload: makeDecision(8),
      });
      socket.simulateMessage({
        event_id: "ev-2",
        timestamp: new Date().toISOString(),
        type: "action.decided",
        payload: makeDecision(12),
      });
    });

    // Snapshot has not resolved yet -> decisions should still be empty
    expect(useGraphStore.getState().decisions.length).toBe(0);

    // Now resolve snapshot with latest_audit_seq = 10
    await act(async () => {
      resolveSnapshot({
        latest_audit_seq: 10,
        agents: [],
        tools: [],
        grants: [],
        recent_decisions: [makeDecision(9), makeDecision(10)],
      });
      await Promise.resolve();
    });

    const state = useGraphStore.getState();
    // Seq 8 was discarded (< 10). Snapshot provided 9, 10. Buffered seq 12 was applied (> 10).
    expect(state.latestAuditSeq).toBe(12);
    expect(state.decisions.map((d) => d.audit_seq)).toEqual([9, 10, 12]);
  });

  it("re-fetches graph snapshot when stream.resync event is received", async () => {
    vi.spyOn(api, "fetchWsTicket").mockResolvedValueOnce({ ticket: "t1", expires_in: 30 });
    const snapshotSpy = vi.spyOn(api, "fetchGraphSnapshot")
      .mockResolvedValueOnce({
        latest_audit_seq: 5,
        agents: [],
        tools: [],
        grants: [],
        recent_decisions: [],
      })
      .mockResolvedValueOnce({
        latest_audit_seq: 20,
        agents: [],
        tools: [],
        grants: [],
        recent_decisions: [makeDecision(20)],
      });

    renderHook(() => useEventStream());
    await act(async () => {
      await Promise.resolve();
    });

    const socket = MockWebSocket.instances[0]!;
    await act(async () => {
      socket.simulateOpen();
    });

    expect(snapshotSpy).toHaveBeenCalledTimes(1);

    // Server emits stream.resync due to buffer overflow
    await act(async () => {
      socket.simulateMessage({
        event_id: "overflow-notice",
        timestamp: new Date().toISOString(),
        type: "stream.resync",
        payload: { reason: "queue_overflow" },
      });
      await Promise.resolve();
    });

    expect(snapshotSpy).toHaveBeenCalledTimes(2);
    expect(useGraphStore.getState().latestAuditSeq).toBe(20);
  });

  it("handles 401 by calling logout and aborting connection", async () => {
    vi.spyOn(api, "fetchWsTicket").mockRejectedValueOnce(
      new api.ApiError(401, "Session expired or invalid credentials"),
    );

    const { result } = renderHook(() => useEventStream());

    await act(async () => {
      await Promise.resolve();
    });

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().sessionToken).toBeNull();
    expect(result.current.status).toBe("disconnected");
    expect(MockWebSocket.instances.length).toBe(0);
  });

  it("reconnects with exponential backoff on close", async () => {
    vi.spyOn(api, "fetchWsTicket").mockResolvedValue({ ticket: "t-fresh", expires_in: 30 });
    vi.spyOn(api, "fetchGraphSnapshot").mockResolvedValue({
      latest_audit_seq: 0,
      agents: [],
      tools: [],
      grants: [],
      recent_decisions: [],
    });

    const { result } = renderHook(() => useEventStream());
    await act(async () => {
      await Promise.resolve();
    });

    const socket1 = MockWebSocket.instances[0]!;
    await act(async () => {
      socket1.simulateOpen();
    });
    expect(result.current.status).toBe("connected");

    // Socket drops
    await act(async () => {
      socket1.simulateClose();
    });

    expect(result.current.status).toBe("reconnecting");
    expect(result.current.retryCount).toBe(1);

    // Fast-forward backoff delay (1000ms)
    await act(async () => {
      vi.advanceTimersByTime(1050);
      await Promise.resolve();
    });

    // Second socket instance should have been instantiated
    expect(MockWebSocket.instances.length).toBe(2);
  });
});
