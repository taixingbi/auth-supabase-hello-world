import { proxyGateway } from "@/lib/gateway";

export async function POST(request: Request) {
  const body = await request.json();
  return proxyGateway("/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
