"use client";

import { useReportWebVitals } from "next/web-vitals";

export interface WebVitalMetricRecord {
  readonly id: string;
  readonly name: string;
  readonly value: number;
  readonly rating?: string;
}

declare global {
  interface Window {
    __APPFLOW_WEB_VITALS__?: Record<string, WebVitalMetricRecord>;
  }
}

/**
 * Reports Core Web Vitals (LCP, INP, CLS, FCP, TTFB) in development console
 * and records latest measurements on `window.__APPFLOW_WEB_VITALS__` for
 * automated performance verification (§3.6, Phase 16).
 */
export function WebVitalsReporter(): null {
  useReportWebVitals((metric: WebVitalMetricRecord) => {
    if (typeof window !== "undefined") {
      const store = (window.__APPFLOW_WEB_VITALS__ ??= {});
      const record: WebVitalMetricRecord = {
        id: metric.id,
        name: metric.name,
        value: metric.value,
        ...(typeof metric.rating === "string" ? { rating: metric.rating } : {}),
      };
      store[metric.name] = record;
    }

    if (process.env.NODE_ENV === "development") {
      const formatted =
        metric.name === "CLS" ? metric.value.toFixed(4) : `${metric.value.toFixed(1)}ms`;
      console.info(`[WebVitals] ${metric.name}: ${formatted}`);
    }
  });

  return null;
}
