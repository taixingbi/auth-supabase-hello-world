const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:8000";

export async function POST(request: Request) {
  const body = await request.json();

  try {
    const res = await fetch(`${GATEWAY_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
