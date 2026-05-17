const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:8000";

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization) {
    return Response.json(
      { detail: "Missing Authorization header" },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.toString();
  const path = query ? `${GATEWAY_URL}/hello?${query}` : `${GATEWAY_URL}/hello`;

  const refreshToken = request.headers.get("x-refresh-token");

  try {
    const headers: Record<string, string> = { Authorization: authorization };
    if (refreshToken) {
      headers["X-Refresh-Token"] = refreshToken;
    }

    const res = await fetch(path, {
      headers,
      cache: "no-store",
    });

    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      {
        detail: `Gateway unreachable at ${GATEWAY_URL}. Run: cd gateway && uvicorn main:app --reload --port 8000`,
      },
      { status: 502 },
    );
  }
}
