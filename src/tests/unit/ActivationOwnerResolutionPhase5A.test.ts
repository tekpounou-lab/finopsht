import { describe, it, expect } from "vitest";
import { resolveOwnerInfo, OwnerResolutionError } from "../../services/business/BusinessActivationService";

describe("Phase 5A Correctif B — Business Activation Owner Resolution", () => {
  it("1. ownerId present and owner_id absent resolves to ownerId", () => {
    const res = resolveOwnerInfo({ ownerId: "usr_camel_123" });
    expect(res.ownerUid).toBe("usr_camel_123");
    expect(res.ownerEmployeeId).toBe("emp_usr_camel_123");
  });

  it("2. owner_id present and ownerId absent resolves to owner_id", () => {
    const res = resolveOwnerInfo({ owner_id: "usr_snake_456" });
    expect(res.ownerUid).toBe("usr_snake_456");
    expect(res.ownerEmployeeId).toBe("emp_usr_snake_456");
  });

  it("3. Both ownerId and owner_id present and equal resolves to that value", () => {
    const res = resolveOwnerInfo({ 
      ownerId: " usr_789 ", 
      owner_id: "usr_789",
      ownerEmployeeId: "emp_789",
      owner_employee_id: "emp_789" 
    });
    expect(res.ownerUid).toBe("usr_789");
    expect(res.ownerEmployeeId).toBe("emp_789");
  });

  it("4. Both ownerId and owner_id present and contradictory throws OWNER_ID_COHERENCE_MISMATCH error", () => {
    expect(() => resolveOwnerInfo({ 
      ownerId: "usr_alice", 
      owner_id: "usr_bob" 
    })).toThrowError(OwnerResolutionError);

    expect(() => resolveOwnerInfo({ 
      ownerId: "usr_alice", 
      owner_id: "usr_bob" 
    })).toThrowError("OWNER_ID_COHERENCE_MISMATCH");
  });

  it("5. Both ownerId and owner_id absent throws MISSING_OWNER_ID error and aborts activation", () => {
    expect(() => resolveOwnerInfo({})).toThrowError(OwnerResolutionError);
    expect(() => resolveOwnerInfo({})).toThrowError("MISSING_OWNER_ID");
  });

  it("6. Contradictory ownerEmployeeId throws OWNER_EMPLOYEE_ID_COHERENCE_MISMATCH error", () => {
    expect(() => resolveOwnerInfo({ 
      ownerId: "usr_same", 
      owner_id: "usr_same",
      ownerEmployeeId: "emp_001",
      owner_employee_id: "emp_002"
    })).toThrowError("OWNER_EMPLOYEE_ID_COHERENCE_MISMATCH");
  });
});
