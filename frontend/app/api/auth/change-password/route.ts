import { proxyGateway, requireAuthorization } from "@/lib/gateway";

export async function POST(request: Request) {
  const authorization = requireAuthorization(request);
  if (authorization instanceof Response) return authorization;

  const body = await request.json();
  return proxyGateway("/auth/change-password", {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
