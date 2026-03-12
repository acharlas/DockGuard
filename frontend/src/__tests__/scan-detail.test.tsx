import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ScanDetailPage from "@/app/scans/[id]/page";

jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "1" }),
}));

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

const mockScanDetail = {
  id: 1,
  image_name: "nginx:latest",
  scan_status: "completed",
  started_at: "2026-03-11T00:00:00Z",
  completed_at: "2026-03-11T00:01:00Z",
  summary: { critical: 1, high: 1, medium: 1, low: 1, unknown: 0 },
  created_at: "2026-03-11T00:00:00Z",
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

beforeEach(() => {
  jest.restoreAllMocks();
});

test("renders scan image name and status", async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(mockScanDetail) })
  ) as jest.Mock;

  render(<ScanDetailPage />);

  await waitFor(() => {
    expect(screen.getByText("nginx:latest")).toBeInTheDocument();
  });

  expect(screen.getByText("completed")).toBeInTheDocument();
});

test("renders vulnerability table with all rows", async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(mockScanDetail) })
  ) as jest.Mock;

  render(<ScanDetailPage />);

  await waitFor(() => {
    expect(screen.getByText("CVE-2024-0001")).toBeInTheDocument();
  });

  expect(screen.getByText("CVE-2024-0002")).toBeInTheDocument();
  expect(screen.getByText("CVE-2024-0003")).toBeInTheDocument();
  expect(screen.getByText("CVE-2024-0004")).toBeInTheDocument();
  expect(screen.getByText("libssl3")).toBeInTheDocument();
  expect(screen.getByText("No fix")).toBeInTheDocument();
});

test("severity filter buttons work", async () => {
  const user = userEvent.setup();

  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(mockScanDetail) })
  ) as jest.Mock;

  render(<ScanDetailPage />);

  await waitFor(() => {
    expect(screen.getByText("CVE-2024-0001")).toBeInTheDocument();
  });

  // Click CRITICAL filter
  const criticalButton = screen.getByRole("button", { name: /critical/i });
  await user.click(criticalButton);

  // Only CRITICAL vulns should be shown
  expect(screen.getByText("CVE-2024-0001")).toBeInTheDocument();
  expect(screen.queryByText("CVE-2024-0002")).not.toBeInTheDocument();
  expect(screen.queryByText("CVE-2024-0003")).not.toBeInTheDocument();
  expect(screen.queryByText("CVE-2024-0004")).not.toBeInTheDocument();

  // Clear filter shows all again
  await user.click(screen.getByText("Clear filter ×"));
  expect(screen.getByText("CVE-2024-0002")).toBeInTheDocument();
});

test("shows error when scan not found", async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: false, status: 404 })
  ) as jest.Mock;

  render(<ScanDetailPage />);

  await waitFor(() => {
    expect(screen.getByText("Scan not found")).toBeInTheDocument();
  });
});
