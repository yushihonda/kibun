"use client";

export type ProductEventName =
  | "search"
  | "zero_results"
  | "impression"
  | "movie_click"
  | "save"
  | "playback_start"
  | "detail_view"
  | "share"
  | "recommendation_feedback";

const SESSION_KEY = "kibun:analytics-session";

export function getAnalyticsSessionId(): string {
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(SESSION_KEY, created);
  return created;
}

export function trackProductEvent(input: {
  eventName: ProductEventName;
  movieId?: string;
  sectionId?: string;
  query?: string;
  metadata?: Record<string, unknown>;
}) {
  const payload = JSON.stringify({
    sessionId: getAnalyticsSessionId(),
    ...input,
  });
  void fetch("/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
    keepalive: true,
  });
}

export function searchSessionHeaders(): HeadersInit {
  return { "x-kibun-session": getAnalyticsSessionId() };
}
