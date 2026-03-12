/** @jest-environment node */

import { GET, POST } from "@/app/api/[...path]/route";

describe("API proxy route", () => {
  beforeEach(() => {
    process.env.API_URL = "http://backend:8000";
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete process.env.API_URL;
    jest.restoreAllMocks();
  });

  test("forwards query string on GET without injecting client identity", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const response = await GET(
      new Request("http://localhost:3000/api/v1/scans?page=2", {
        headers: {
          Accept: "application/json",
        },
      }),
      { params: { path: ["v1", "scans"] } }
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit & { headers: Headers }
    ];
    expect(url).toBe("http://backend:8000/api/v1/scans?page=2");
    expect(init.method).toBe("GET");
    expect(init.headers.get("accept")).toBe("application/json");
    expect(init.headers.get("x-dockguard-client-ip")).toBeNull();
    expect(await response.json()).toEqual({ ok: true });
  });

  test("forwards request body on POST", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ id: 1 }), {
        status: 202,
        headers: { "content-type": "application/json" },
      })
    );

    const response = await POST(
      new Request("http://localhost:3000/api/v1/scans", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image: "nginx:latest" }),
      }),
      { params: { path: ["v1", "scans"] } }
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit & { headers: Headers; body: string }
    ];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ image: "nginx:latest" }));
    expect(init.headers.get("content-type")).toBe("application/json");
    expect(init.headers.get("x-dockguard-client-ip")).toBeNull();
    expect(await response.json()).toEqual({ id: 1 });
  });
});
