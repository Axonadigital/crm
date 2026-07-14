import { describe, expect, it } from "vitest";
import {
  accessTokenExpiresAt,
  buildAuthorizationUrl,
  clientCredentialsBody,
  decodeJwtPayload,
  extractTenantId,
  isExpired,
} from "./oauth.ts";

function makeJwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${encode({ alg: "RS256" })}.${encode(payload)}.signature`;
}

describe("buildAuthorizationUrl", () => {
  it("requests a service account with offline access", () => {
    const url = new URL(
      buildAuthorizationUrl({
        clientId: "abc123",
        redirectUri: "https://crm.example.com/fortnox/callback",
        state: "state-xyz",
        scopes: ["companyinformation", "invoice"],
      }),
    );

    expect(url.origin + url.pathname).toBe(
      "https://apps.fortnox.se/oauth-v1/auth",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("access_type")).toBe("offline");
    // Without account_type=service there is no service account, and therefore
    // no client_credentials flow — this is the whole point of the design.
    expect(url.searchParams.get("account_type")).toBe("service");
    expect(url.searchParams.get("scope")).toBe("companyinformation invoice");
    expect(url.searchParams.get("state")).toBe("state-xyz");
  });
});

describe("extractTenantId", () => {
  it("finds the tenant id whatever Fortnox chooses to call the claim", () => {
    expect(extractTenantId({ tenantId: "123456" })).toBe("123456");
    expect(extractTenantId({ tenant_id: 987654 })).toBe("987654");
    expect(extractTenantId({ "@fortnox:tenantid": "555" })).toBe("555");
  });

  it("returns undefined when no claim looks like a tenant", () => {
    expect(extractTenantId({ sub: "user-1", iss: "fortnox" })).toBeUndefined();
    expect(extractTenantId(null)).toBeUndefined();
  });

  it("reads the claim straight off a real-shaped access token", () => {
    const jwt = makeJwt({ sub: "user-1", tenantId: 4242 });
    expect(extractTenantId(decodeJwtPayload(jwt))).toBe("4242");
  });
});

describe("decodeJwtPayload", () => {
  it("returns null for opaque, non-JWT tokens", () => {
    expect(decodeJwtPayload("a7302e6b-b1cb-4508-b884-cf9abd9a51de")).toBeNull();
  });
});

describe("token expiry", () => {
  it("expires a token two minutes early so it is never used on the edge", () => {
    const now = Date.parse("2026-07-14T10:00:00.000Z");
    expect(accessTokenExpiresAt(3600, now)).toBe("2026-07-14T10:58:00.000Z");
  });

  it("treats a missing or unparsable expiry as expired", () => {
    const now = Date.now();
    expect(isExpired(null, now)).toBe(true);
    expect(isExpired("not-a-date", now)).toBe(true);
    expect(isExpired(new Date(now + 60_000).toISOString(), now)).toBe(false);
    expect(isExpired(new Date(now - 1).toISOString(), now)).toBe(true);
  });
});

describe("clientCredentialsBody", () => {
  it("omits scope so Fortnox falls back to the consented scopes", () => {
    expect(clientCredentialsBody()).toBe("grant_type=client_credentials");
  });
});
