type CookieRequest = {
  protocol?: string;
  headers: Record<string, string | string[] | undefined>;
};

export type SessionCookieOptions = {
  domain?: string;
  httpOnly: boolean;
  path: string;
  sameSite: "lax" | "strict" | "none";
  secure: boolean;
};

function isSecureRequest(req: CookieRequest): boolean {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList: string[] = Array.isArray(forwardedProto)
    ? forwardedProto.map(String)
    : forwardedProto.split(",");

  return protoList.some(
    (proto: string) => proto.trim().toLowerCase() === "https"
  );
}

export function getSessionCookieOptions(
  req: CookieRequest
): SessionCookieOptions {
  return {
    domain: undefined,
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req),
  };
}
