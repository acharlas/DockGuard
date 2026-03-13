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
  await waitFor(() => {
    expect(screen.getByText("2 scans")).toBeInTheDocument();
  });
});

test("renders scan rows from API with build status", async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(mockScans) })
  ) as jest.Mock;

  render(<ScansPage />);

  await waitFor(() => {
    expect(screen.getAllByText("nginx:latest").length).toBeGreaterThan(0);
  });

  expect(screen.getAllByText("alpine:3.19").length).toBeGreaterThan(0);
  expect(screen.getAllByText("completed").length).toBeGreaterThan(0);
  expect(screen.getAllByText("unavailable").length).toBeGreaterThan(0);
  expect(screen.getByText("2 scans")).toBeInTheDocument();
  expect(screen.getByText("Submitted")).toBeInTheDocument();
  expect(
    screen.getAllByText(new Date("2026-03-11T00:00:00Z").toLocaleString()).length
  ).toBeGreaterThan(0);
});

test("shows empty state when no scans exist", async () => {
  const emptyResponse = { items: [], total: 0, page: 1, size: 20 };
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(emptyResponse) })
  ) as jest.Mock;

  render(<ScansPage />);

  await waitFor(() => {
    expect(screen.getAllByText(/no scans yet/i).length).toBeGreaterThan(0);
  });
});

test("shows an error state instead of fake empty history when the API fails", async () => {
  global.fetch = jest.fn(() => Promise.reject(new Error("backend down"))) as jest.Mock;

  render(<ScansPage />);

  await waitFor(() => {
    expect(
      screen.getAllByText("Failed to load scan history. Check backend availability.")
        .length
    ).toBeGreaterThan(0);
  });

  expect(screen.getAllByRole("button", { name: "Retry" }).length).toBeGreaterThan(0);
  expect(screen.queryByText(/no scans yet/i)).not.toBeInTheDocument();
});

test("keeps the last successful page visible when a later pagination request fails", async () => {
  const paginatedPageOne = {
    items: [
      {
        id: 11,
        image_name: "page-one:latest",
        scan_status: "completed",
        build_status: "completed",
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
  expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/v1/scans?page=1&size=20");
  expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/scans?page=2&size=20");
});
