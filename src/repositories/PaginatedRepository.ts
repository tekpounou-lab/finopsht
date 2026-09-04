import {
  collection,
  query,
  getDocs,
  limit,
  startAfter,
  orderBy,
  QueryConstraint,
  QueryDocumentSnapshot,
  DocumentData
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";

export interface PaginatedOptions<T = any> {
  collectionPath: string;
  constraints?: QueryConstraint[];
  pageSize?: number;
  lastDoc?: QueryDocumentSnapshot<DocumentData> | null;
  orderByField?: string;
  orderDirection?: "asc" | "desc";
  transform?: (doc: QueryDocumentSnapshot<DocumentData>) => T;
}

export interface PaginatedResult<T> {
  items: T[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
  totalFetched: number;
}

export class PaginatedRepository {
  /**
   * Encapsulates Firestore cursor-based pagination query execution.
   * Requests (pageSize + 1) documents to reliably determine `hasMore` without executing a secondary count query.
   */
  public static async getPaginated<T = any>(
    options: PaginatedOptions<T>
  ): Promise<PaginatedResult<T>> {
    const {
      collectionPath,
      constraints = [],
      pageSize = 25,
      lastDoc = null,
      orderByField,
      orderDirection = "desc",
      transform = (d) => ({ id: d.id, ...d.data() } as unknown as T)
    } = options;

    try {
      const colRef = collection(db, collectionPath);
      const queryConstraints: QueryConstraint[] = [...constraints];

      if (orderByField) {
        queryConstraints.push(orderBy(orderByField, orderDirection));
      }

      if (lastDoc) {
        queryConstraints.push(startAfter(lastDoc));
      }

      // Fetch 1 extra document to test if another page is available
      queryConstraints.push(limit(pageSize + 1));

      const q = query(colRef, ...queryConstraints);
      const snapshot = await getDocs(q);

      const docs = snapshot.docs;
      const hasMore = docs.length > pageSize;
      const pageDocs = hasMore ? docs.slice(0, pageSize) : docs;

      const items = pageDocs.map(transform);
      const newLastDoc = pageDocs.length > 0 ? pageDocs[pageDocs.length - 1] : null;

      return {
        items,
        lastDoc: newLastDoc,
        hasMore,
        totalFetched: items.length
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, collectionPath);
      return {
        items: [],
        lastDoc: null,
        hasMore: false,
        totalFetched: 0
      };
    }
  }
}
