"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, cancelScan, createScan, getScan, ScanDetail } from "@/lib/api";
import { SCAN_STATUS } from "@/lib/constants";
import { useToast } from "@/contexts/ToastContext";

const MAX_POLL_RETRIES = 3;
const POLL_INITIAL_MS = 2000;
const POLL_BACKOFF_MS = 3000;
const POLL_BACKOFF_LONG_MS = 5000;
const POLL_BACKOFF_MAX_MS = 10000;

export function isActiveScanStatus(status: string) {
  return status === SCAN_STATUS.PENDING || status === SCAN_STATUS.RUNNING;
}

export function useActiveScan() {
  const [image, setImage] = useState("");
  const [scan, setScan] = useState<ScanDetail | null>(null);
  const [activeScanId, setActiveScanId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const toast = useToast();

  const initialScanId = useMemo(() => {
    if (typeof window === "undefined") return null;
    const id = new URLSearchParams(window.location.search).get("scanId");
    if (!id) return null;
    const num = Number(id);
    return isNaN(num) ? null : num;
  }, []);

  // Track consecutive poll failures without triggering re-renders.
  const failureCountRef = useRef(0);
  const pollStartRef = useRef(0);

  useEffect(() => {
    if (activeScanId === null) {
      return;
    }

    pollStartRef.current = Date.now();
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    const poll = async () => {
      try {
        const data = await getScan(activeScanId, controller.signal);
        if (cancelled || data.id !== activeScanId) {
          return;
        }
        // Reset failure count on successful poll.
        failureCountRef.current = 0;
        setScan(data);
        if (isActiveScanStatus(data.scan_status)) {
          const elapsed = Date.now() - pollStartRef.current;
          const delay =
            elapsed < 30_000 ? POLL_INITIAL_MS
            : elapsed < 120_000 ? POLL_BACKOFF_LONG_MS
            : POLL_BACKOFF_MAX_MS;
          timeoutId = setTimeout(poll, delay);
          return;
        }
        setActiveScanId(null);
        setLoading(false);

        if (data.scan_status === SCAN_STATUS.COMPLETED) {
          const parts: string[] = [];
          if (data.summary?.critical) parts.push(`${data.summary.critical} CRITICAL`);
          if (data.summary?.high) parts.push(`${data.summary.high} HIGH`);
          if (data.summary?.medium) parts.push(`${data.summary.medium} MEDIUM`);
          toast.success(`${data.image_name} — Scan complete`, {
            description: parts.length ? parts.join(" · ") : "No vulnerabilities found",
          });
        } else if (data.scan_status === SCAN_STATUS.FAILED) {
          toast.error(`${data.image_name} — Scan failed`);
        } else if (data.scan_status === SCAN_STATUS.CANCELLED) {
          toast.info(`${data.image_name} — Cancelled`);
        }
      } catch (err) {
        if (cancelled) {
          return;
        }
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        failureCountRef.current += 1;

        if (failureCountRef.current < MAX_POLL_RETRIES) {
          // Transient failure — keep polling with a short backoff.
          timeoutId = setTimeout(poll, POLL_BACKOFF_MS);
          return;
        }

        // Max retries exceeded — surface the error and stop polling.
        setError(
          getApiErrorMessage(
            err,
            "Failed to fetch scan status. Check backend availability.",
            {
              notFoundMessage: "Failed to fetch scan status. The scan no longer exists.",
              unavailableMessage: "Failed to fetch scan status. Backend unavailable.",
            }
          )
        );
        setActiveScanId(null);
        setLoading(false);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      controller.abort();
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    };
  }, [activeScanId, toast]);

  useEffect(() => {
    if (initialScanId === null) return;

    let cancelled = false;

    getScan(initialScanId)
      .then((detail) => {
        if (cancelled) return;
        setScan(detail);
        setImage(detail.image_name);
        if (isActiveScanStatus(detail.scan_status)) {
          setActiveScanId(initialScanId);
          setLoading(true);
        }
      })
      .catch(() => {
        // Scan no longer exists — user sees empty workspace.
      });

    return () => {
      cancelled = true;
    };
  }, [initialScanId]);

  const runScan = useCallback(async () => {
    if (!image.trim()) {
      return;
    }

    setError(null);
    setLoading(true);
    failureCountRef.current = 0;

    try {
      const created = await createScan(image.trim());
      router.replace(`/?scanId=${created.id}`);
      if (isActiveScanStatus(created.scan_status)) {
        const seed: ScanDetail = {
          ...created,
          vulnerabilities: [],
          build: null,
        };
        setScan(seed);
        setActiveScanId(created.id);
        return;
      }

      const detail = await getScan(created.id);
      setScan(detail);
      setLoading(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError(err.detail ?? "Scan queue is full. Try again later.");
        toast.error("Scan queue is full");
      } else {
        setError(
          getApiErrorMessage(
            err,
            "Failed to start scan. Check backend availability.",
            {
              invalidInputMessage: "Failed to start scan. Check the image name.",
              unavailableMessage: "Failed to start scan. Backend unavailable.",
            }
          )
        );
        toast.error("Failed to start scan");
      }
      setLoading(false);
    }
  }, [image, router, toast]);

  const cancelActiveScan = useCallback(async () => {
    if (!scan) {
      return;
    }

    const scanId = scan.id;
    setActiveScanId(null);

    try {
      const updated = await cancelScan(scanId);
      setScan((current) =>
        current
          ? { ...current, ...updated }
          : { ...updated, vulnerabilities: [], build: null }
      );

      if (isActiveScanStatus(updated.scan_status)) {
        setLoading(true);
        setActiveScanId(scanId);
      } else {
        setLoading(false);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        try {
          const latest = await getScan(scanId);
          setScan(latest);
          const stillActive = isActiveScanStatus(latest.scan_status);
          setLoading(stillActive);
          if (stillActive) {
            setActiveScanId(scanId);
          }
          return;
        } catch {
          // Fall through to the generic error state below.
        }
      }

      setActiveScanId(scanId);
      setError(
        getApiErrorMessage(err, "Failed to cancel scan. Check backend availability.", {
          unavailableMessage: "Failed to cancel scan. Backend unavailable.",
        })
      );
      toast.error("Failed to cancel scan");
    }
  }, [scan, toast]);

  return {
    image,
    setImage,
    scan,
    loading,
    error,
    isActiveScan: scan ? isActiveScanStatus(scan.scan_status) : false,
    runScan,
    cancelActiveScan,
  };
}

function getApiErrorMessage(
  err: unknown,
  fallback: string,
  {
    invalidInputMessage,
    notFoundMessage,
    unavailableMessage,
  }: {
    invalidInputMessage?: string;
    notFoundMessage?: string;
    unavailableMessage?: string;
  } = {}
) {
  if (!(err instanceof ApiError)) {
    return fallback;
  }

  if (err.status === 404 && notFoundMessage) {
    return notFoundMessage;
  }
  if (err.status === 422 && invalidInputMessage) {
    return invalidInputMessage;
  }
  if (err.status === 502 && unavailableMessage) {
    return unavailableMessage;
  }
  return err.detail ?? fallback;
}
