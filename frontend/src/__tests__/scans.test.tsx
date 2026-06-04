import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
      build_summary: {
        image_size_bytes: 40000000,
        efficiency_score: 0.97,
        wasted_bytes: 1200000,
        wasted_percent: 3.0,
        layer_count: 5,
        inefficient_layer_count: 1,
      },
      started_at: "2026-03-11T00:00:05Z",
      completed_at: "2026-03-11T00:01:00Z",
      summary: { critical: 2, high: 3, medium: 1, low: 0, unknown: 0 },
      created_at: new Date().toISOString(),
    },
    {
      id: 2,
      image_name: "alpine:3.19",
      scan_status: "failed",
      build_status: "unavailable",
      build_summary: null,
      started_at: null,
      completed_at: "2026-03-11T00:03:00Z",
      summary: null,
      created_at: new Date(Date.now() - 3600000).toISOString(),
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
  await waitFor(() => {
    expect(screen.getByText("2 scans")).toBeInTheDocument();
  });
});

test("renders scan rows with health status and build data", async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(mockScans) })
  ) as jest.Mock;

  render(<ScansPage />);

  await waitFor(() => {
    expect(screen.getAllByText("nginx:latest").length).toBeGreaterThan(0);
  });

  expect(screen.getAllByText("alpine:3.19").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Complete").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Failed").length).toBeGreaterThan(0);
  expect(screen.getByText("2 scans")).toBeInTheDocument();
  expect(screen.getByText("Submitted")).toBeInTheDocument();
  expect(screen.getAllByText("just now").length).toBeGreaterThan(0);
});

test("shows empty state when no scans exist", async () => {
  const emptyResponse = { items: [], total: 0, page: 1, size: 20 };
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(emptyResponse) })
  ) as jest.Mock;

  render(<ScansPage />);

  await waitFor(() => {
    expect(screen.getAllByText(/no scans found/i).length).toBeGreaterThan(0);
  });
});

test("shows an error state instead of empty when the API fails", async () => {
  global.fetch = jest.fn(() => Promise.reject(new Error("backend down"))) as jest.Mock;

  render(<ScansPage />);

  await waitFor(() => {
    expect(
      screen.getAllByText("Failed to load scan history. Check backend availability.")
        .length
    ).toBeGreaterThan(0);
  });

  expect(screen.getAllByRole("button", { name: "Retry" }).length).toBeGreaterThan(0);
  expect(screen.queryByText(/no scans found/i)).not.toBeInTheDocument();
});

test("keeps the last successful page visible when a later pagination request fails", async () => {
  const paginatedPageOne = {
    items: [
      {
        id: 11,
        image_name: "page-one:latest",
        scan_status: "completed",
        build_status: "completed",
        build_summary: null,
        started_at: "2026-03-11T00:10:05Z",
        completed_at: "2026-03-11T00:11:00Z",
        summary: { critical: 1, high: 0, medium: 0, low: 0, unknown: 0 },
        created_at: "2026-03-11T00:10:00Z",
      },
    ],
    total: 40,
    page: 1,
    size: 20,
  };

  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(paginatedPageOne),
    })
    .mockRejectedValueOnce(new Error("backend down"));

  global.fetch = fetchMock as jest.Mock;

  render(<ScansPage />);

  await waitFor(() => {
    expect(screen.getAllByText("page-one:latest").length).toBeGreaterThan(0);
  });
  expect(screen.getByText("1 / 2")).toBeInTheDocument();

  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Next" }));

  await waitFor(() => {
    expect(
      screen.getByText("Failed to load scan history. Check backend availability.")
    ).toBeInTheDocument();
  });

  expect(screen.getByText("1 / 2")).toBeInTheDocument();
  expect(screen.getAllByText("page-one:latest").length).toBeGreaterThan(0);
  expect(fetchMock).toHaveBeenNthCalledWith(
    1,
    "/api/v1/scans?page=1&size=20&status=pending%2Crunning%2Ccompleted"
  );
  expect(fetchMock).toHaveBeenNthCalledWith(
    2,
    "/api/v1/scans?page=2&size=20&status=pending%2Crunning%2Ccompleted"
  );
});
