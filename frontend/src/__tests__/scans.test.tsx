import { render, screen, waitFor } from "@testing-library/react";
import ScansPage from "@/app/scans/page";

const mockPush = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockScans = {
  items: [
    {
      id: 1,
      image_name: "nginx:latest",
      scan_status: "completed",
      build_status: "completed",
      started_at: "2026-03-11T00:00:05Z",
      completed_at: "2026-03-11T00:01:00Z",
      summary: { critical: 2, high: 3, medium: 1, low: 0, unknown: 0 },
      created_at: "2026-03-11T00:00:00Z",
    },
    {
      id: 2,
      image_name: "alpine:3.19",
      scan_status: "failed",
      build_status: "unavailable",
      started_at: null,
      completed_at: "2026-03-11T00:03:00Z",
      summary: null,
      created_at: "2026-03-11T00:02:00Z",
    },
  ],
  total: 2,
  page: 1,
  size: 20,
};

beforeEach(() => {
  jest.restoreAllMocks();
  mockPush.mockClear();
});

test("renders history heading", async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(mockScans) })
  ) as jest.Mock;

  render(<ScansPage />);

  expect(screen.getByText("History")).toBeInTheDocument();
  expect(screen.getByText("Scan runs")).toBeInTheDocument();
});

test("renders scan rows from API with build status", async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(mockScans) })
  ) as jest.Mock;

  render(<ScansPage />);

  await waitFor(() => {
    expect(screen.getByText("nginx:latest")).toBeInTheDocument();
  });

  expect(screen.getByText("alpine:3.19")).toBeInTheDocument();
  expect(screen.getAllByText("completed").length).toBeGreaterThan(0);
  expect(screen.getByText("unavailable")).toBeInTheDocument();
  expect(screen.getByText("2 scans")).toBeInTheDocument();
  expect(screen.getByText("Submitted")).toBeInTheDocument();
  expect(screen.getByText(new Date("2026-03-11T00:00:00Z").toLocaleString())).toBeInTheDocument();
});

test("shows empty state when no scans exist", async () => {
  const emptyResponse = { items: [], total: 0, page: 1, size: 20 };
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(emptyResponse) })
  ) as jest.Mock;

  render(<ScansPage />);

  await waitFor(() => {
    expect(screen.getByText(/no scans yet/i)).toBeInTheDocument();
  });
});
