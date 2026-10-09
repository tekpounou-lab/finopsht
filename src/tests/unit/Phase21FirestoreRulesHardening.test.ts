import { describe, it, expect } from "vitest";
import fs from "fs";

describe("Phase 21: Firestore Rules Static Hardening & Anti-Bypass Audit", () => {
  const rules = fs.readFileSync("firestore.rules", "utf8");

  it("verifies that dummy hasNoObsolete helper functions are completely eliminated", () => {
    expect(rules).not.toContain("hasNoObsoleteBusinessFields");
    expect(rules).not.toContain("hasNoObsoleteFields");
    expect(rules).not.toContain("hasNoObsoleteBranchFields");
    expect(rules).not.toContain("hasNoObsoleteUserFields");
  });

  it("verifies that isSuperAdmin() does NOT read client-writable user profile documents", () => {
    // isSuperAdmin function body should not contain get(.../users/...)
    const isSuperAdminDecl = rules.substring(rules.indexOf("function isSuperAdmin()"), rules.indexOf("function hasUserData()"));
    expect(isSuperAdminDecl).not.toContain("/users/");
  });

  it("verifies that public write rules allow create: if true are strictly forbidden except schema-validated sales_requests", () => {
    expect(rules).not.toContain("allow write: if true");
    expect(rules).not.toContain("allow create: if true");
  });
});
