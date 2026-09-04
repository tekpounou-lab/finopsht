import { describe, it, expect, vi } from "vitest";
import { PaginatedResult } from "../../repositories/PaginatedRepository";

describe("Pagination & Cursor State Pipeline Unit Tests", () => {
  it("should handle cursor progression and batch concatenation", async () => {
    const page1Docs = [{ id: "1", name: "Alpha" }, { id: "2", name: "Beta" }];
    const page2Docs = [{ id: "3", name: "Gamma" }];

    const fetcher = vi.fn().mockImplementation(async ({ pageSize, lastDoc }) => {
      if (!lastDoc) {
        return {
          items: page1Docs,
          lastDoc: { id: "cursor_page1" } as any,
          hasMore: true,
          totalFetched: 2
        } as unknown as PaginatedResult<{ id: string; name: string }>;
      } else {
        return {
          items: page2Docs,
          lastDoc: { id: "cursor_page2" } as any,
          hasMore: false,
          totalFetched: 1
        } as unknown as PaginatedResult<{ id: string; name: string }>;
      }
    });

    // Step 1: Initial fetch (lastDoc = null)
    const page1 = await fetcher({ pageSize: 2, lastDoc: null });
    expect(page1.items).toEqual(page1Docs);
    expect(page1.hasMore).toBe(true);
    expect(page1.lastDoc).toEqual({ id: "cursor_page1" });

    // Step 2: Second fetch (lastDoc = page1.lastDoc)
    const page2 = await fetcher({ pageSize: 2, lastDoc: page1.lastDoc });
    expect(page2.items).toEqual(page2Docs);
    expect(page2.hasMore).toBe(false);
    expect(page2.lastDoc).toEqual({ id: "cursor_page2" });

    // Total aggregated state
    const aggregated = [...page1.items, ...page2.items];
    expect(aggregated).toHaveLength(3);
    expect(aggregated.map((i) => i.name)).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("should isolate filter parameters during pagination reload", async () => {
    const fetcher = vi.fn().mockImplementation(async ({ filters }) => {
      return {
        items: [{ id: "inv_1", status: filters?.status || "ALL" }],
        lastDoc: { id: "cursor_inv_1" } as any,
        hasMore: false,
        totalFetched: 1
      };
    });

    const res1 = await fetcher({ pageSize: 10, lastDoc: null, filters: { status: "PAID" } });
    expect(res1.items[0].status).toBe("PAID");

    const res2 = await fetcher({ pageSize: 10, lastDoc: null, filters: { status: "OVERDUE" } });
    expect(res2.items[0].status).toBe("OVERDUE");

    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
