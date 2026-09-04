import { Employee } from "../../../types";

export interface ParsedQuickBooksRow {
  department: string;
  itemName: string;
  associate: string;
  qtySold: number;
  extPrice: number;
  itemNumber: string;
  itemDescription: string;
}

export type ResolutionStatus = 'EXACT' | 'HIGH_CONFIDENCE' | 'UNRESOLVED';

export interface AssociateResolution {
  rawName: string;
  status: ResolutionStatus;
  matchedEmployeeId: string | null;
  matchedEmail: string | null;
  candidates: Employee[]; 
}
