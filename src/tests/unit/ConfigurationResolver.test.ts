import { describe, it, expect, vi } from "vitest";
import { ConfigurationResolver } from "../../services/config/ConfigurationResolver";

// Mock firestore queries and helpers
vi.mock("firebase/firestore", () => {
  return {
    doc: vi.fn(),
    getDoc: vi.fn(),
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    getDocs: vi.fn()
  };
});

vi.mock("../../lib/firebase", () => {
  return {
    db: {}
  };
});

vi.mock("../../utils/resilientFirestore", () => {
  return {
    resilientGetDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
    resilientGetDocs: vi.fn(() => Promise.resolve({ empty: true }))
  };
});

describe("ConfigurationResolver Unit Tests", () => {
  it("resolves employee-specific custom values with highest priority", async () => {
    const result = await ConfigurationResolver.resolve("commission_rate", {
      employeeContext: {
        id: "emp_1",
        customValue: 0.08
      }
    });

    expect(result.status).toBe("RESOLVED");
    expect(result.value).toBe(0.08);
    expect(result.source).toBe("EMPLOYEE_DATA");
  });

  it("resolves explicit zero correctly as 0 rather than fallback", async () => {
    const result = await ConfigurationResolver.resolve("commission_rate", {
      employeeContext: {
        id: "emp_1",
        customValue: 0
      }
    });

    expect(result.status).toBe("RESOLVED");
    expect(result.value).toBe(0);
    expect(result.source).toBe("EMPLOYEE_DATA");
  });

  it("returns NO_DATA if nothing is configured", async () => {
    const result = await ConfigurationResolver.resolve("commission_rate", {});

    expect(result.status).toBe("NO_DATA");
    expect(result.value).toBeNull();
    expect(result.source).toBe("NONE");
  });

  it("returns standard hours fallback of 96 hours if unconfigured", async () => {
    const result = await ConfigurationResolver.resolve("standard_hours", {});

    expect(result.status).toBe("RESOLVED");
    expect(result.value).toBe(96);
    expect(result.source).toBe("SYSTEM_DEFAULT");
  });
});
