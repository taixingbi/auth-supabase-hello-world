import {
  GATEWAY_URL,
  gatewayUnreachable,
  requireAuthorization,
} from "@/lib/gateway";

async function parseGatewayBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { detail: text };
  }
}

export async function GET(request: Request) {
  const authorization = requireAuthorization(request);
  if (authorization instanceof Response) return authorization;

  const { searchParams } = new URL(request.url);
  const query = searchParams.toString();
  const path = query ? `/hello?${query}` : "/hello";
  const refreshToken = request.headers.get("x-refresh-token");

  try {
    const headers: Record<string, string> = { Authorization: authorization };
    if (refreshToken) headers["X-Refresh-Token"] = refreshToken;

    const res = await fetch(`${GATEWAY_URL}${path}`, { headers, cache: "no-store" });
    const data = await parseGatewayBody(res);
    return Response.json(data, { status: res.status });
  } catch {
    return gatewayUnreachable();
  }
}
