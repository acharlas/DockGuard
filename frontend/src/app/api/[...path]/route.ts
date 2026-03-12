export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function buildBackendUrl(request: Request, path: string[]): string {
  const baseUrl = process.env.API_URL || "http://localhost:8000";
  const target = new URL(`/api/${path.join("/")}`, baseUrl);
  target.search = new URL(request.url).search;
  return target.toString();
}

function proxyHeaders(request: Request): Headers {
  const headers = new Headers();
  for (const headerName of ["accept", "content-type"]) {
    const value = request.headers.get(headerName);
    if (value) {
      headers.set(headerName, value);
    }
  }
  return headers;
}

async function proxyRequest(
  request: Request,
  path: string[]
): Promise<Response> {
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.text();

  try {
    const upstream = await fetch(buildBackendUrl(request, path), {
      method: request.method,
      headers: proxyHeaders(request),
      body,
      cache: "no-store",
    });

    const responseHeaders = new Headers();
    const contentType = upstream.headers.get("content-type");
    if (contentType) {
      responseHeaders.set("content-type", contentType);
    }

    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      { detail: "Backend unavailable." },
      { status: 502 }
    );
  }
}

type RouteContext = {
  params: {
    path: string[];
  };
};

export async function GET(request: Request, context: RouteContext) {
  return proxyRequest(request, context.params.path);
}

export async function POST(request: Request, context: RouteContext) {
  return proxyRequest(request, context.params.path);
}
