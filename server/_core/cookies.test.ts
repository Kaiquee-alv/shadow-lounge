import { describe, expect, it } from "vitest";
import { getLocalSessionCookieOptions } from "./cookies.js";

describe("cookies de sessão local", () => {
  it("permite autenticação por HTTP em instalação local sem atributo Secure", () => {
    const options = getLocalSessionCookieOptions({ protocol: "http", headers: {} });
    expect(options).toMatchObject({ secure: false, sameSite: "lax", httpOnly: true, path: "/" });
  });

  it("usa cookie cross-site seguro quando HTTPS chega via proxy", () => {
    const options = getLocalSessionCookieOptions({ protocol: "http", headers: { "x-forwarded-proto": "https" } });
    expect(options).toMatchObject({ secure: true, sameSite: "none", httpOnly: true, path: "/" });
  });
});
