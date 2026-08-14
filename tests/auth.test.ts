import { describe, expect, it } from "vitest";
import { authorizeOwner } from "../app/server/auth-policy";

const owner = {
  userId: "owner-id",
  email: "owner@example.com",
  displayName: "Owner",
  fullName: "Owner",
};

describe("owner authorization policy", () => {
  it("rejects missing configuration and anonymous users", () => {
    expect(() => authorizeOwner(owner, undefined)).toThrowError(expect.objectContaining({ code: "OWNER_NOT_CONFIGURED", status: 503 }));
    expect(() => authorizeOwner(null, owner.email)).toThrowError(expect.objectContaining({ code: "AUTH_REQUIRED", status: 401 }));
  });

  it("rejects non-owner accounts and accepts the configured owner case-insensitively", () => {
    expect(() => authorizeOwner({ ...owner, email: "other@example.com" }, owner.email)).toThrowError(expect.objectContaining({ code: "OWNER_ONLY", status: 403 }));
    expect(authorizeOwner(owner, " Owner@Example.com ")).toEqual(owner);
  });
});
