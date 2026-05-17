import { proxyGateway, requireAuthorization } from "@/lib/gateway";

export async function GET(request: Request) {
  const authorization = requireAuthorization(request);
  if (authorization instanceof Response) return authorization;

  return proxyGateway("/profile", {
    headers: { Authorization: authorization },
    cache: "no-store",
  });
}

export async function PATCH(request: Request) {
  const authorization = requireAuthorization(request);
  if (authorization instanceof Response) return authorization;

  const body = await request.json();
  return proxyGateway("/profile", {
    method: "PATCH",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
