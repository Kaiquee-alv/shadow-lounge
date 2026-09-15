import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema.js";
import { getLocalUserFromSession } from "../db.js";
import { sdk } from "./sdk.js";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

function sessionToken(cookieHeader?: string) {
  const match = cookieHeader?.match(/(?:^|;\s*)shadow_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  let user: User | null = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch {
    user = null;
  }

  if (!user) {
    const token = sessionToken(opts.req.headers.cookie);
    if (token) user = await getLocalUserFromSession(token);
  }

  return { req: opts.req, res: opts.res, user };
}
