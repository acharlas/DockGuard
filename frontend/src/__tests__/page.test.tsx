import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Dashboard from "@/app/page";

const mockScanResponse = {
  id: 1,
  image_name: "nginx:latest",
  scan_status: "pending",
  build_status: null,
  started_at: null,
  completed_at: null,
  summary: null,
  created_at: "2026-03-11T00:00:00Z",
};

const mockRunningScanDetail = {
  ...mockScanResponse,
  scan_status: "running",
  started_at: "2026-03-11T00:00:05Z",
  vulnerabilities: [],
  build: null,
};

const mockBuild = {
  status: "completed",
  failure_reason: null,
  summary: {
    image_size_bytes: 205000000,
    efficiency_score: 0.87,
    wasted_bytes: 18450000,
    wasted_percent: 9.0,
    layer_count: 4,
    inefficient_layer_count: 2,
  },
  report: {
    layers: [
      {
        index: 0,
        layer_id: "sha256:layer-1",
        instruction: "RUN apk add curl bash",
        size_bytes: 40200000,
        wasted_bytes: 8200000,
        wasted_percent: 20.4,
        efficiency_score: 0.8,
      },
    ],
  },
};

const mockScanDetail = {
  ...mockScanResponse,
  scan_status: "completed",
  build_status: "completed",
  started_at: "2026-03-11T00:00:05Z",
  completed_at: "2026-03-11T00:01:00Z",
  summary: { critical: 1, high: 1, medium: 1, low: 1, unknown: 0 },
  build: mockBuild,
  vulnerabilities: [
    {
      vuln_id: "CVE-2024-0001",
      package_name: "libssl3",
      installed_version: "3.0.13-1",
      fixed_version: "3.0.13-2",
      severity: "CRITICAL",
      title: "Buffer overflow",
    },
    {
      vuln_id: "CVE-2024-0002",
      package_name: "libcurl4",
      installed_version: "7.88.1-10",
      fixed_version: "7.88.1-11",
      severity: "HIGH",
      title: "Use-after-free",
    },
  ],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test("renders the lean analysis shell", () => {
  render(<Dashboard />);

  expect(screen.getByText("Scan an image")).toBeInTheDocument();
  expect(screen.getByPlaceholderText("nginx:latest")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /run analysis/i })).toBeInTheDocument();
  expect(screen.getByText("Issues")).toBeInTheDocument();
  expect(screen.queryByText("Coverage")).not.toBeInTheDocument();
  expect(screen.queryByText("Total scans")).not.toBeInTheDocument();
});

test("submits scan and displays security workspace after completion", async () => {
  const user = userEvent.setup();

  global.fetch = jest.fn((url: string, options?: RequestInit) => {
    if (options?.method === "POST" && url === "/api/v1/scans") {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockScanResponse) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockScanDetail) });
  }) as jest.Mock;

  render(<Dashboard />);

  await user.type(screen.getByPlaceholderText("nginx:latest"), "nginx:latest");
  await user.click(screen.getByRole("button", { name: /run analysis/i }));

  await waitFor(() => {
    expect(screen.getByText("Vulnerabilities (2)")).toBeInTheDocument();
  });

  const criticalCve = screen.getAllByText("CVE-2024-0001")[0];
  const highCve = screen.getAllByText("CVE-2024-0002")[0];

  expect(criticalCve).toBeInTheDocument();
  expect(screen.getAllByText("CRITICAL").length).toBeGreaterThan(0);
  expect(criticalCve.className).not.toEqual(highCve.className);
  expect(criticalCve.closest("tr")?.getAttribute("style")).toContain("inset 3px 0 0");
  expect(criticalCve.closest("tr")?.getAttribute("style")).not.toEqual(
    highCve.closest("tr")?.getAttribute("style")
  );
});

test("switches to the build tab and renders build metrics", async () => {
  const user = userEvent.setup();

  global.fetch = jest.fn((url: string, options?: RequestInit) => {
    if (options?.method === "POST" && url === "/api/v1/scans") {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockScanResponse) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockScanDetail) });
  }) as jest.Mock;

  render(<Dashboard />);

  await user.type(screen.getByPlaceholderText("nginx:latest"), "nginx:latest");
  await user.click(screen.getByRole("button", { name: /run analysis/i }));

  await waitFor(() => {
    expect(screen.getByText("Vulnerabilities (2)")).toBeInTheDocument();
  });

  await user.click(screen.getAllByRole("button", { name: "Build" })[0]);

  expect(screen.getByText("Highest waste contributors")).toBeInTheDocument();
  expect(screen.getByLabelText("Build efficiency distribution")).toBeInTheDocument();
  expect(screen.getAllByText("Image Size").length).toBeGreaterThan(0);
  expect(screen.getByText("RUN apk add curl bash")).toBeInTheDocument();
  expect(screen.queryByText("Issues")).not.toBeInTheDocument();
});

test("shows queue message when scan queue is full", async () => {
  const user = userEvent.setup();

  global.fetch = jest.fn((url: string, options?: RequestInit) => {
    if (options?.method === "POST" && url === "/api/v1/scans") {
      return Promise.resolve({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ detail: "Scan queue is full. Try again later." }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockScanDetail) });
  }) as jest.Mock;

  render(<Dashboard />);

  await user.type(screen.getByPlaceholderText("nginx:latest"), "nginx:latest");
  await user.click(screen.getByRole("button", { name: /run analysis/i }));

  await waitFor(() => {
    expect(screen.getByText("Scan queue is full. Try again later.")).toBeInTheDocument();
  });
});

test("keeps the current workspace visible when a new submit fails", async () => {
  const user = userEvent.setup();
  let createAttempts = 0;

  global.fetch = jest.fn((url: string, options?: RequestInit) => {
    if (options?.method === "POST" && url === "/api/v1/scans") {
      createAttempts += 1;
      if (createAttempts === 1) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              ...mockScanResponse,
              scan_status: "completed",
              build_status: "completed",
              started_at: "2026-03-11T00:00:05Z",
              completed_at: "2026-03-11T00:01:00Z",
              summary: { critical: 1, high: 1, medium: 1, low: 1, unknown: 0 },
            }),
        });
      }

      return Promise.resolve({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ detail: "Scan queue is full. Try again later." }),
      });
    }

    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockScanDetail) });
  }) as jest.Mock;

  render(<Dashboard />);

  const input = screen.getByPlaceholderText("nginx:latest");

  await user.type(input, "nginx:latest");
  await user.click(screen.getByRole("button", { name: /run analysis/i }));

  await waitFor(() => {
    expect(screen.getByText("Vulnerabilities (2)")).toBeInTheDocument();
  });

  await user.clear(input);
  await user.type(input, "alpine:latest");
  await user.click(screen.getByRole("button", { name: /run analysis/i }));

  await waitFor(() => {
    expect(screen.getByText("Scan queue is full. Try again later.")).toBeInTheDocument();
  });

  expect(screen.getByText("Vulnerabilities (2)")).toBeInTheDocument();
  expect(screen.getAllByText("CVE-2024-0001").length).toBeGreaterThan(0);
});

test("renders cached completed scans without starting a poll loop", async () => {
  const user = userEvent.setup();
  const completedCreateResponse = {
    ...mockScanResponse,
    scan_status: "completed",
    build_status: "completed",
    started_at: "2026-03-11T00:00:05Z",
    completed_at: "2026-03-11T00:01:00Z",
    summary: { critical: 1, high: 1, medium: 1, low: 1, unknown: 0 },
  };

  global.fetch = jest.fn((url: string, options?: RequestInit) => {
    if (options?.method === "POST" && url === "/api/v1/scans") {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(completedCreateResponse),
      });
    }
    if (url === "/api/v1/scans/1") {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockScanDetail) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockScanDetail) });
  }) as jest.Mock;

  render(<Dashboard />);

  await user.type(screen.getByPlaceholderText("nginx:latest"), "nginx:latest");
  await user.click(screen.getByRole("button", { name: /run analysis/i }));

  await waitFor(() => {
    expect(screen.getByText("Vulnerabilities (2)")).toBeInTheDocument();
  });

  const scanDetailFetches = (global.fetch as jest.Mock).mock.calls.filter(
    ([url, options]) => url === "/api/v1/scans/1" && !options?.method
  );
  expect(scanDetailFetches).toHaveLength(1);
  expect(screen.queryByRole("button", { name: /^cancel$/i })).not.toBeInTheDocument();
});

test("renders pending scan workspace without started_at", async () => {
  const user = userEvent.setup();

  global.fetch = jest.fn((url: string, options?: RequestInit) => {
    if (options?.method === "POST" && url === "/api/v1/scans") {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockScanResponse) });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ ...mockScanResponse, vulnerabilities: [], build: null }),
    });
  }) as jest.Mock;

  render(<Dashboard />);

  await user.type(screen.getByPlaceholderText("nginx:latest"), "nginx:latest");
  await user.click(screen.getByRole("button", { name: /run analysis/i }));

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
  });
  expect(screen.getByText("nginx:latest")).toBeInTheDocument();
});

test("ignores stale poll responses after cancel and restart", async () => {
  const user = userEvent.setup();
  const firstPoll = deferred<{ ok: boolean; json: () => Promise<typeof mockScanDetail> }>();

  const secondScanResponse = {
    id: 2,
    image_name: "alpine:latest",
    scan_status: "pending",
    build_status: null,
    started_at: null,
    completed_at: null,
    summary: null,
    created_at: "2026-03-11T00:02:00Z",
  };
  const secondScanDetail = {
    ...secondScanResponse,
    scan_status: "completed",
    build_status: "unavailable",
    completed_at: "2026-03-11T00:03:00Z",
    summary: { critical: 0, high: 1, medium: 0, low: 0, unknown: 0 },
    build: {
      status: "unavailable",
      failure_reason: "docker_unavailable",
      summary: null,
      report: null,
    },
    vulnerabilities: [
      {
        vuln_id: "CVE-2024-9999",
        package_name: "apk-tools",
        installed_version: "1.0.0",
        fixed_version: "1.0.1",
        severity: "HIGH",
        title: "Second scan only",
      },
    ],
  };

  global.fetch = jest.fn((url: string, options?: RequestInit) => {
    if (options?.method === "POST" && url === "/api/v1/scans") {
      const body = JSON.parse(String(options.body));
      if (body.image === "nginx:latest") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockScanResponse) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(secondScanResponse) });
    }
    if (options?.method === "POST" && url === "/api/v1/scans/1/cancel") {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ...mockScanResponse,
            scan_status: "cancelled",
            completed_at: "2026-03-11T00:00:10Z",
          }),
      });
    }
    if (url === "/api/v1/scans/1") {
      return firstPoll.promise;
    }
    if (url === "/api/v1/scans/2") {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(secondScanDetail) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockScanDetail) });
  }) as jest.Mock;

  render(<Dashboard />);

  await user.type(screen.getByPlaceholderText("nginx:latest"), "nginx:latest");
  await user.click(screen.getByRole("button", { name: /run analysis/i }));
  await waitFor(() => {
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
  });

  await user.click(screen.getByRole("button", { name: /^cancel$/i }));

  const input = screen.getByPlaceholderText("nginx:latest");
  await user.clear(input);
  await user.type(input, "alpine:latest");
  await user.click(screen.getByRole("button", { name: /run analysis/i }));

  await act(async () => {
    firstPoll.resolve({
      ok: true,
      json: () => Promise.resolve(mockScanDetail),
    });
    await Promise.resolve();
  });

  await waitFor(() => {
    expect(screen.getByText("apk-tools")).toBeInTheDocument();
  });
  expect(screen.queryByText("libssl3")).not.toBeInTheDocument();
});

test("keeps polling when running cancel is still settling", async () => {
  const user = userEvent.setup();
  let scanPolls = 0;

  global.fetch = jest.fn((url: string, options?: RequestInit) => {
    if (options?.method === "POST" && url === "/api/v1/scans") {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockScanResponse) });
    }
    if (url === "/api/v1/scans/1" && !options?.method) {
      scanPolls += 1;
      if (scanPolls === 1) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockRunningScanDetail) });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ...mockRunningScanDetail,
            scan_status: "cancelled",
            completed_at: "2026-03-11T00:00:10Z",
          }),
      });
    }
    if (options?.method === "POST" && url === "/api/v1/scans/1/cancel") {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockRunningScanDetail) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockScanDetail) });
  }) as jest.Mock;

  render(<Dashboard />);

  await user.type(screen.getByPlaceholderText("nginx:latest"), "nginx:latest");
  await user.click(screen.getByRole("button", { name: /run analysis/i }));

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
  });

  await user.click(screen.getByRole("button", { name: /^cancel$/i }));

  await waitFor(() => {
    expect(screen.queryByRole("button", { name: /^cancel$/i })).not.toBeInTheDocument();
  });
  expect(scanPolls).toBeGreaterThanOrEqual(2);
});

test("refreshes terminal state when cancel returns 409", async () => {
  const user = userEvent.setup();
  let scanFetches = 0;

  global.fetch = jest.fn((url: string, options?: RequestInit) => {
    if (options?.method === "POST" && url === "/api/v1/scans") {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockScanResponse) });
    }
    if (url === "/api/v1/scans/1" && !options?.method) {
      scanFetches += 1;
      if (scanFetches === 1) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockRunningScanDetail) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockScanDetail) });
    }
    if (options?.method === "POST" && url === "/api/v1/scans/1/cancel") {
      return Promise.resolve({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ detail: "Cannot cancel a scan with status 'completed'" }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockScanDetail) });
  }) as jest.Mock;

  render(<Dashboard />);

  await user.type(screen.getByPlaceholderText("nginx:latest"), "nginx:latest");
  await user.click(screen.getByRole("button", { name: /run analysis/i }));

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
  });

  await user.click(screen.getByRole("button", { name: /^cancel$/i }));

  await waitFor(() => {
    expect(screen.getByText("Vulnerabilities (2)")).toBeInTheDocument();
  });

  expect(screen.queryByText("Failed to cancel scan.")).not.toBeInTheDocument();
  expect(scanFetches).toBe(2);
});

test("clears pending poll timer on unmount", async () => {
  jest.useFakeTimers();
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  const pendingDetail = {
    ...mockScanResponse,
    vulnerabilities: [],
    build: null,
  };

  global.fetch = jest.fn((url: string, options?: RequestInit) => {
    if (options?.method === "POST" && url === "/api/v1/scans") {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockScanResponse) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(pendingDetail) });
  }) as jest.Mock;

  const view = render(<Dashboard />);
  await user.type(screen.getByPlaceholderText("nginx:latest"), "nginx:latest");
  await user.click(screen.getByRole("button", { name: /run analysis/i }));

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
  });

  expect(global.fetch).toHaveBeenCalledTimes(2);
  view.unmount();

  await act(async () => {
    jest.advanceTimersByTime(2500);
  });

  expect(global.fetch).toHaveBeenCalledTimes(2);
});
