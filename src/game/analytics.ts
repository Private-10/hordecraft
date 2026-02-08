// Simple analytics - tracks events to Firestore 'analytics' collection
import { db } from "./firebase";
import { collection, addDoc } from "firebase/firestore";

interface AnalyticsEvent {
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
  sessionId: string;
}

const SESSION_ID = Math.random().toString(36).slice(2);
const eventQueue: AnalyticsEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function trackEvent(event: string, data: Record<string, unknown> = {}) {
  eventQueue.push({
    event,
    data,
    timestamp: new Date().toISOString(),
    sessionId: SESSION_ID,
  });

  // Batch flush every 10 seconds
  if (!flushTimer) {
    flushTimer = setTimeout(flushEvents, 10000);
  }
}

async function flushEvents() {
  flushTimer = null;
  if (eventQueue.length === 0) return;

  const batch = eventQueue.splice(0, eventQueue.length);
  try {
    for (const evt of batch) {
      await addDoc(collection(db, "analytics"), evt);
    }
  } catch (e) {
    console.error("Analytics flush failed:", e);
    // Don't re-queue, just drop - analytics shouldn't block gameplay
  }
}

// Track on page unload
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (eventQueue.length > 0) {
      // Use sendBeacon for reliable delivery
      const data = JSON.stringify(eventQueue);
      navigator.sendBeacon?.("/api/analytics", data);
    }
  });
}
