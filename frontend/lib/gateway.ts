export const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:8000";

export function gatewayUnreachable(): Response {
  return Response.json(
    {
      detail: `Gateway unreachable at ${GATEWAY_URL}. Start it: cd gateway && ./run.sh`,
    },
    { status: 502 },
  );
}

async function parseGatewayBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { detail: text };
  }
}

export async function proxyGateway(
  path: string,
  init: RequestInit,
): Promise<Response> {
  try {
    const res = await fetch(`${GATEWAY_URL}${path}`, init);
    const data = await parseGatewayBody(res);
    return Response.json(data, { status: res.status });
  } catch {
    return gatewayUnreachable();
  }
}

export function requireAuthorization(request: Request): string | Response {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return Response.json(
      { detail: "Missing Authorization header" },
      { status: 401 },
    );
  }
  return authorization;
}
