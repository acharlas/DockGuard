import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Dashboard from "@/app/page";

const mockScanResponse = {
  id: 1,
  image_name: "nginx:latest",
  scan_status: "pending",
  started_at: "2026-03-11T00:00:00Z",
  completed_at: null,
  summary: null,
  created_at: "2026-03-11T00:00:00Z",
};

const mockScanDetail = {
  ...mockScanResponse,
  scan_status: "completed",
  completed_at: "2026-03-11T00:01:00Z",
  summary: { critical: 1, high: 1, medium: 1, low: 1, unknown: 0 },
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
    {
      vuln_id: "CVE-2024-0003",
      package_name: "zlib1g",
      installed_version: "1.2.13",
      fixed_version: null,
      severity: "MEDIUM",
      title: "Integer overflow",
    },
    {
      vuln_id: "CVE-2024-0004",
      package_name: "libc6",
      installed_version: "2.36-9",
      fixed_version: "2.36-10",
      severity: "LOW",
      title: "Memory leak",
    },
  ],
};

jest.mock("next/link", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  return {
    __esModule: true,
    default: ({
      children,
      href,
    }: {
      children: React.ReactNode;
      href: string;
    }) => React.createElement("a", { href }, children),
  };
});

// Mock recharts to avoid SVG rendering issues in jsdom
jest.mock("recharts", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  return {
    PieChart: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "pie-chart" }, children),
    Pie: () => null,
    Cell: () => null,
    Tooltip: () => null,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", null, children),
  };
});

beforeEach(() => {
  jest.restoreAllMocks();
});

test("renders scan form with input and button", () => {
  render(<Dashboard />);
  expect(
    screen.getByPlaceholderText(/enter image name/i)
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /scan/i })).toBeInTheDocument();
});

test("submits scan and displays vulnerability table after completion", async () => {
  const user = userEvent.setup();

  const mockStats = {
    total_scans: 0,
    completed_scans: 0,
    failed_scans: 0,
    severity_breakdown: { critical: 0, high: 0, medium: 0, low: 0 },
    top_cves: [],
    top_images: [],
  };

  global.fetch = jest.fn((url: string, options?: RequestInit) => {
    if (url === "/api/v1/stats") {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockStats) });
    }
    if (options?.method === "POST") {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockScanResponse) });
    }
    // GET /api/v1/scans/:id — polling
    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockScanDetail) });
  }) as jest.Mock;

  render(<Dashboard />);

  const input = screen.getByPlaceholderText(/enter image name/i);
  const button = screen.getByRole("button", { name: /scan/i });

  await user.type(input, "nginx:latest");
  await user.click(button);

  // Wait for vulnerabilities to appear
  await waitFor(() => {
    expect(screen.getByText("CVE-2024-0001")).toBeInTheDocument();
  });

  // Check all vulnerability rows rendered
  expect(screen.getByText("CVE-2024-0002")).toBeInTheDocument();
  expect(screen.getByText("CVE-2024-0003")).toBeInTheDocument();
  expect(screen.getByText("CVE-2024-0004")).toBeInTheDocument();

  // Check package names
  expect(screen.getByText("libssl3")).toBeInTheDocument();
  expect(screen.getByText("libcurl4")).toBeInTheDocument();

  // Check severity badges (may appear in both table and chart legend)
  expect(screen.getAllByText("CRITICAL").length).toBeGreaterThan(0);
  expect(screen.getAllByText("HIGH").length).toBeGreaterThan(0);

  // Check "No fix" shows for null fixed_version
  expect(screen.getByText("No fix")).toBeInTheDocument();

  // Verify fetch was called correctly
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/v1/scans"),
    expect.objectContaining({ method: "POST" })
  );
});

test("displays error when scan fails", async () => {
  const user = userEvent.setup();

  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: false, status: 422 })
  ) as jest.Mock;

  render(<Dashboard />);

  await user.type(
    screen.getByPlaceholderText(/enter image name/i),
    "bad-image"
  );
  await user.click(screen.getByRole("button", { name: /scan/i }));

  await waitFor(() => {
    expect(screen.getByText(/failed to start scan/i)).toBeInTheDocument();
  });
});
