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


/** Local login works over plain HTTP on a private LAN (Lax), and uses a
 * cross-site Secure cookie when the public request actually arrived over HTTPS. */
export function getLocalSessionCookieOptions(req: CookieRequest): SessionCookieOptions {
  const options = getSessionCookieOptions(req);
  return { ...options, sameSite: options.secure ? "none" : "lax" };
}
