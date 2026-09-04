import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock firebase/firestore with partial mock
const mockGetDocs = vi.fn();
const mockCollection = vi.fn();
const mockQuery = vi.fn();
const mockLimit = vi.fn();
const mockOrderBy = vi.fn();
const mockStartAfter = vi.fn();

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    collection: (...args: any[]) => mockCollection(...args),
    query: (...args: any[]) => mockQuery(...args),
    getDocs: (...args: any[]) => mockGetDocs(...args),
    limit: (...args: any[]) => mockLimit(...args),
    orderBy: (...args: any[]) => mockOrderBy(...args),
    startAfter: (...args: any[]) => mockStartAfter(...args)
  };
});

import { PaginatedRepository } from "../../repositories/PaginatedRepository";

describe("PaginatedRepository Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return formatted PaginatedResult and determine hasMore correctly when docs exceed pageSize", async () => {
    // Mock 4 documents returned when pageSize is 3 (hasMore should be true and items should have length 3)
    const mockDocs = [
      { id: "doc_1", data: () => ({ name: "Item 1", value: 100 }) },
      { id: "doc_2", data: () => ({ name: "Item 2", value: 200 }) },
      { id: "doc_3", data: () => ({ name: "Item 3", value: 300 }) },
      { id: "doc_4", data: () => ({ name: "Item 4", value: 400 }) } // The +1 check doc
    ];

    mockCollection.mockReturnValue({ path: "test_items" });
    mockQuery.mockReturnValue({ type: "query" });
    mockGetDocs.mockResolvedValue({ docs: mockDocs });

    const result = await PaginatedRepository.getPaginated<{ id: string; name: string; value: number }>({
      collectionPath: "test_items",
      pageSize: 3
    });

    expect(result.items).toHaveLength(3);
    expect(result.items[0]).toEqual({ id: "doc_1", name: "Item 1", value: 100 });
    expect(result.items[2]).toEqual({ id: "doc_3", name: "Item 3", value: 300 });
    expect(result.hasMore).toBe(true);
    expect(result.totalFetched).toBe(3);
    expect(result.lastDoc).toBe(mockDocs[2]);
    expect(mockLimit).toHaveBeenCalledWith(4); // pageSize + 1
  });

  it("should set hasMore to false when documents count is equal or less than pageSize", async () => {
    const mockDocs = [
      { id: "doc_1", data: () => ({ name: "Item 1" }) },
      { id: "doc_2", data: () => ({ name: "Item 2" }) }
    ];

    mockCollection.mockReturnValue({ path: "test_items" });
    mockQuery.mockReturnValue({ type: "query" });
    mockGetDocs.mockResolvedValue({ docs: mockDocs });

    const result = await PaginatedRepository.getPaginated({
      collectionPath: "test_items",
      pageSize: 5
    });

    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(false);
    expect(result.totalFetched).toBe(2);
    expect(result.lastDoc).toBe(mockDocs[1]);
  });

  it("should handle empty results gracefully", async () => {
    mockCollection.mockReturnValue({ path: "empty_collection" });
    mockQuery.mockReturnValue({ type: "query" });
    mockGetDocs.mockResolvedValue({ docs: [] });

    const result = await PaginatedRepository.getPaginated({
      collectionPath: "empty_collection",
      pageSize: 10
    });

    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(result.lastDoc).toBeNull();
    expect(result.totalFetched).toBe(0);
  });
});
