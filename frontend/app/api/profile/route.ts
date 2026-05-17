const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:8000";

function getAuthorization(request: Request): string | null {
  return request.headers.get("authorization");
}

export async function GET(request: Request) {
  const authorization = getAuthorization(request);
  if (!authorization) {
    return Response.json(
      { detail: "Missing Authorization header" },
      { status: 401 },
    );
  }

  try {
    const res = await fetch(`${GATEWAY_URL}/profile`, {
      headers: { Authorization: authorization },
      cache: "no-store",
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      { detail: `Gateway unreachable at ${GATEWAY_URL}` },
      { status: 502 },
    );
  }
}

export async function PATCH(request: Request) {
  const authorization = getAuthorization(request);
  if (!authorization) {
    return Response.json(
      { detail: "Missing Authorization header" },
      { status: 401 },
    );
  }

  const body = await request.json();

  try {
    const res = await fetch(`${GATEWAY_URL}/profile`, {
      method: "PATCH",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      { detail: `Gateway unreachable at ${GATEWAY_URL}` },
      { status: 502 },
    );
  }
}
