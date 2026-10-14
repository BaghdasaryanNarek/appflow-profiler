/**
 * Pure, deterministic formatting helpers using Intl.NumberFormat and SI conventions.
 */

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const;

/**
 * Format raw byte quantities into human-readable IEC/SI magnitudes.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1);
  const unit = BYTE_UNITS[i] ?? "B";
  if (i === 0) {
    return `${String(Math.round(bytes))} ${unit}`;
  }
  const val = bytes / Math.pow(1024, i);
  const fractionDigits = i >= 3 ? 2 : 1;
  return `${val.toFixed(fractionDigits)} ${unit}`;
}

/**
 * Format requests-per-second throughput metrics.
 */
export function formatRps(rps: number): string {
  if (!Number.isFinite(rps) || rps <= 0) {
    return "0 rps";
  }
  if (rps >= 1_000_000) {
    return `${(rps / 1_000_000).toFixed(1)}M rps`;
  }
  if (rps >= 1_000) {
    return `${(rps / 1_000).toFixed(1)}k rps`;
  }
  return `${rps < 10 ? rps.toFixed(1) : Math.round(rps).toString()} rps`;
}

/**
 * Format millisecond round-trip or queueing latencies.
 */
export function formatLatencyMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "0 ms";
  }
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)} s`;
  }
  if (ms < 1) {
    return `${ms.toFixed(2)} ms`;
  }
  return `${ms < 10 ? ms.toFixed(1) : Math.round(ms).toString()} ms`;
}

/**
 * Format unit ratio (0.0 to 1.0) as a clean percentage string.
 */
export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return "0.0%";
  }
  const pct = Math.min(100, Math.max(0, ratio * 100));
  return `${pct.toFixed(1)}%`;
}

/**
 * Compact numeric formatter for fleet-wide totals (e.g. 1.2k, 4.5M).
 */
export function formatCompactNumber(n: number): string {
  if (!Number.isFinite(n)) {
    return "0";
  }
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

/**
 * Format duration in seconds to compact human format (s, m s, h m).
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0s";
  }
  if (seconds < 60) {
    return `${String(Math.round(seconds))}s`;
  }
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins)}m ${String(secs)}s`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${String(hours)}h ${String(mins)}m`;
}
