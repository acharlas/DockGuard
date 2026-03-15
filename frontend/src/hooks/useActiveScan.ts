"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, cancelScan, createScan, getScan, ScanDetail } from "@/lib/api";
import { SCAN_STATUS } from "@/lib/constants";

export function isActiveScanStatus(status: string) {
  return status === SCAN_STATUS.PENDING || status === SCAN_STATUS.RUNNING;
}

export function useActiveScan() {
  const [image, setImage] = useState("");
  const [scan, setScan] = useState<ScanDetail | null>(null);
  const [activeScanId, setActiveScanId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activeScanId === null) {
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    const poll = async () => {
      try {
        const data = await getScan(activeScanId, controller.signal);
        if (cancelled || data.id !== activeScanId) {
          return;
        }
        setScan(data);
        if (isActiveScanStatus(data.scan_status)) {
          timeoutId = setTimeout(poll, 2000);
          return;
        }
        setActiveScanId(null);
        setLoading(false);
      } catch (err) {
        if (cancelled) {
          return;
        }
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
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
  }, [activeScanId]);

  const runScan = useCallback(async () => {
    if (!image.trim()) {
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const created = await createScan(image.trim());
      if (isActiveScanStatus(created.scan_status)) {
        setScan({ ...created, vulnerabilities: [], build: null });
        setActiveScanId(created.id);
        return;
      }

      const detail = await getScan(created.id);
      setScan(detail);
      setLoading(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError(err.detail ?? "Scan queue is full. Try again later.");
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
      }
      setLoading(false);
    }
  }, [image]);

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
    }
  }, [scan]);

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
