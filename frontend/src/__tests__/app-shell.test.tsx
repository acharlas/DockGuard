import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppShell } from "@/components/AppShell";

const mockUsePathname = jest.fn();

jest.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

describe("AppShell", () => {
  const originalGrafanaUrl = process.env.NEXT_PUBLIC_GRAFANA_URL;

  beforeEach(() => {
    mockUsePathname.mockReturnValue("/");
    process.env.NEXT_PUBLIC_GRAFANA_URL = "http://localhost:3001";
  });

  afterEach(() => {
    if (originalGrafanaUrl === undefined) {
      delete process.env.NEXT_PUBLIC_GRAFANA_URL;
      return;
    }

    process.env.NEXT_PUBLIC_GRAFANA_URL = originalGrafanaUrl;
  });

  test("renders analysis and history navigation", () => {
    render(
      <AppShell>
        <div>Workspace</div>
      </AppShell>
    );

    expect(screen.getAllByRole("link", { name: "Analysis" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "History" }).length).toBeGreaterThan(0);
  });

  test("marks the active route", () => {
    mockUsePathname.mockReturnValue("/scans");

    render(
      <AppShell>
        <div>Workspace</div>
      </AppShell>
    );

    expect(screen.getAllByRole("link", { name: "History" })[0]).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  test("renders grafana link from env", () => {
    render(
      <AppShell>
        <div>Workspace</div>
      </AppShell>
    );

    expect(screen.getAllByRole("link", { name: /grafana/i })[0]).toHaveAttribute(
      "href",
      "http://localhost:3001"
    );
    expect(screen.getAllByRole("link", { name: /grafana/i })[0]).toHaveAttribute(
      "target",
      "_blank"
    );
  });

  test("hides grafana link when env is absent", () => {
    delete process.env.NEXT_PUBLIC_GRAFANA_URL;

    render(
      <AppShell>
        <div>Workspace</div>
      </AppShell>
    );

    expect(screen.queryByRole("link", { name: /grafana/i })).not.toBeInTheDocument();
  });

  test("opens the mobile navigation drawer", async () => {
    const user = userEvent.setup();

    render(
      <AppShell>
        <div>Workspace</div>
      </AppShell>
    );

    await user.click(screen.getByRole("button", { name: "Open navigation" }));

    expect(screen.getByLabelText("Mobile navigation")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Analysis" }).length).toBeGreaterThan(1);
    expect(
      screen.getAllByRole("button", { name: "Close navigation" }).length
    ).toBeGreaterThan(0);
  });
});
