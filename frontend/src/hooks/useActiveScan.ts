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
    let timeoutId: number | undefined;
    const controller = new AbortController();

    const poll = async () => {
      try {
        const data = await getScan(activeScanId, controller.signal);
        if (cancelled || data.id !== activeScanId) {
          return;
        }
        setScan(data);
        if (isActiveScanStatus(data.scan_status)) {
          timeoutId = window.setTimeout(poll, 2000);
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
        setError("Failed to fetch scan status");
        setActiveScanId(null);
        setLoading(false);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      controller.abort();
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
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
        setError("Failed to start scan. Check the image name.");
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
          setLoading(false);
          if (isActiveScanStatus(latest.scan_status)) {
            setActiveScanId(scanId);
          }
          return;
        } catch {
          // Fall through to the generic error state below.
        }
      }

      setActiveScanId(scanId);
      setError("Failed to cancel scan.");
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
