import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ScanDetailPage from "@/app/scans/[id]/page";

jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "1" }),
}));

const mockScanDetail = {
  id: 1,
  image_name: "nginx:latest",
  scan_status: "completed",
  build_status: "completed",
  image_digest: "sha256:abc",
  started_at: "2026-03-11T00:00:00Z",
  completed_at: "2026-03-11T00:01:00Z",
  summary: { critical: 1, high: 1, medium: 1, low: 1, unknown: 0 },
  created_at: "2026-03-11T00:00:00Z",
  build: {
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
  },
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

beforeEach(() => {
  jest.restoreAllMocks();
});

test("renders scan image name, status, and issue card", async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(mockScanDetail) })
  ) as jest.Mock;

  render(<ScanDetailPage />);

  await waitFor(() => {
    expect(screen.getAllByText("nginx:latest").length).toBeGreaterThanOrEqual(2);
  });

  expect(screen.getAllByText("completed").length).toBeGreaterThan(0);
  expect(screen.getAllByText("sha256:abc").length).toBeGreaterThan(0);
  expect(screen.getByText("Issues")).toBeInTheDocument();
});

test("renders vulnerability workspace by default", async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(mockScanDetail) })
  ) as jest.Mock;

  render(<ScanDetailPage />);

  await waitFor(() => {
    expect(screen.getByText("Vulnerabilities (2)")).toBeInTheDocument();
  });

  expect(screen.getAllByText("CVE-2024-0001").length).toBeGreaterThan(0);
  expect(screen.queryByText("No fix")).not.toBeInTheDocument();
});

test("build tab renders layer insights", async () => {
  const user = userEvent.setup();

  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(mockScanDetail) })
  ) as jest.Mock;

  render(<ScanDetailPage />);

  await waitFor(() => {
    expect(screen.getByText("Vulnerabilities (2)")).toBeInTheDocument();
  });

  await user.click(screen.getByRole("button", { name: "Build" }));

  expect(screen.getByText("Highest waste contributors")).toBeInTheDocument();
  expect(screen.getByText("RUN apk add curl bash")).toBeInTheDocument();
  expect(screen.getByText("Wasted Space")).toBeInTheDocument();
});

test("shows error when scan not found", async () => {
  global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 404 })) as jest.Mock;

  render(<ScanDetailPage />);

  await waitFor(() => {
    expect(screen.getByText("Scan not found")).toBeInTheDocument();
  });
});
