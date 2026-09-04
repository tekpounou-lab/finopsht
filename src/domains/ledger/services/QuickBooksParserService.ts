import * as XLSX from 'xlsx';
import { ParsedQuickBooksRow } from '../types/quickbooks';

export interface ExtractedHeaderDateRange {
  startDate: string;
  endDate: string;
  rawText: string;
}

export interface QuickBooksParseResult {
  rows: ParsedQuickBooksRow[];
  uniqueAssociates: string[];
  extractedDateRange?: ExtractedHeaderDateRange;
  skippedSummaryRowsCount: number;
}

export class QuickBooksParserService {
  /**
   * Helper to parse a date string (DD/MM/YYYY or YYYY-MM-DD or MM/DD/YYYY) to ISO YYYY-MM-DD
   */
  private static parseDateToISO(dStr: string): string | null {
    if (!dStr) return null;
    const cleanStr = dStr.trim();
    
    // YYYY-MM-DD
    const isoMatch = cleanStr.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (isoMatch) {
      const y = isoMatch[1];
      const m = isoMatch[2].padStart(2, '0');
      const d = isoMatch[3].padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    // DD/MM/YYYY or MM/DD/YYYY
    const frMatch = cleanStr.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (frMatch) {
      const part1 = parseInt(frMatch[1], 10);
      const part2 = parseInt(frMatch[2], 10);
      let year = frMatch[3];
      if (year.length === 2) year = "20" + year;

      // In French QuickBooks reports (e.g., 01/08/2026 or 15/08/2026), part1 is day, part2 is month
      let day = part1;
      let month = part2;

      // Swap if month > 12 (definitely DD/MM/YYYY) or standard French convention
      if (month > 12 && day <= 12) {
        const tmp = day;
        day = month;
        month = tmp;
      }

      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    return null;
  }

  /**
   * Parses a raw QuickBooks Excel or CSV file into standard structured rows.
   * Dynamically finds the header row, extracts header date range if present,
   * and skips invalid summary/total rows at the end or within the sheet.
   */
  static async parseRawReport(file: File | Blob | ArrayBuffer | Uint8Array): Promise<QuickBooksParseResult> {
    let arrayBuffer: ArrayBuffer;
    if (file instanceof ArrayBuffer) {
      arrayBuffer = file;
    } else if (file instanceof Uint8Array) {
      arrayBuffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    } else if (typeof (file as any).arrayBuffer === 'function') {
      arrayBuffer = await file.arrayBuffer();
    } else {
      arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(file as Blob);
      });
    }

    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, { type: 'array' });
    
    if (workbook.SheetNames.length === 0) {
      throw new Error("Excel file is empty.");
    }
    
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    // Read as a 2D array to easily scan for the header row and metadata
    const rawJson: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    let headerRowIndex = -1;
    let headers: string[] = [];
    let extractedDateRange: ExtractedHeaderDateRange | undefined = undefined;

    // 1. Scan the first 30 rows for header metadata (e.g. "Date: 01/08/2026 07:00:00 to 15/08/2026 23:59:00")
    for (let i = 0; i < Math.min(rawJson.length, 30); i++) {
      const row = rawJson[i];
      if (!row || row.length === 0) continue;

      const lineStr = row.map((cell: any) => String(cell || '')).join(' ').trim();
      const lineLower = lineStr.toLowerCase();

      if (
        lineLower.includes('date') || 
        lineLower.includes('période') || 
        lineLower.includes('period') || 
        lineLower.includes('du ') || 
        lineLower.includes('from ')
      ) {
        const dateRegex = /(\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/g;
        const matches = lineStr.match(dateRegex);
        if (matches && matches.length > 0) {
          const parsedIsoDates: string[] = [];
          for (const m of matches) {
            const iso = QuickBooksParserService.parseDateToISO(m);
            if (iso) parsedIsoDates.push(iso);
          }

          if (parsedIsoDates.length >= 2) {
            extractedDateRange = {
              startDate: parsedIsoDates[0],
              endDate: parsedIsoDates[1],
              rawText: lineStr
            };
            break;
          } else if (parsedIsoDates.length === 1 && !extractedDateRange) {
            extractedDateRange = {
              startDate: parsedIsoDates[0],
              endDate: parsedIsoDates[0],
              rawText: lineStr
            };
          }
        }
      }
    }
    
    // 2. Scan the first 30 rows to find the actual table headers
    for (let i = 0; i < Math.min(rawJson.length, 30); i++) {
      const row = rawJson[i];
      if (!row || row.length < 2) continue;
      
      const rowStr = JSON.stringify(row).toLowerCase();
      const hasKeyHeader = 
        rowStr.includes('ext price') || 
        rowStr.includes('qty sold') ||
        rowStr.includes('item name') ||
        rowStr.includes('item #') ||
        rowStr.includes('associate') ||
        rowStr.includes('vendeur') ||
        rowStr.includes('rep') ||
        rowStr.includes('department') ||
        rowStr.includes('département') ||
        (rowStr.includes('montant') && (rowStr.includes('article') || rowStr.includes('produit')));

      if (hasKeyHeader) {
        headerRowIndex = i;
        headers = row.map((cell: any) => String(cell || '').trim().toLowerCase());
        break;
      }
    }
          
          if (headerRowIndex === -1) {
            // Fallback: use first non-empty row as header if no explicit keyword found
            if (rawJson.length > 0) {
              headerRowIndex = 0;
              headers = (rawJson[0] || []).map((cell: any) => String(cell || '').trim().toLowerCase());
            } else {
              throw new Error("Could not find report headers. Make sure the file is a valid QuickBooks report.");
            }
          }
          
          // Robust column index resolution: Check exact matches first across all candidates,
          // then check partial matches with negative keyword filtering to avoid matching 'Item Description' as 'Item Name'.
          const findColIndex = (exactCandidates: string[], partialCandidates: string[], excludeWords: string[] = []): number => {
            // 1. Try exact matches first
            for (const name of exactCandidates) {
              const target = String(name || '').toLowerCase().trim();
              const idx = headers.findIndex(h => String(h || '').trim() === target);
              if (idx !== -1) return idx;
            }
            // 2. Try partial includes with negative exclusions
            for (const name of partialCandidates) {
              const target = String(name || '').toLowerCase().trim();
              const idx = headers.findIndex(h => {
                const trimmed = String(h || '').trim();
                if (!trimmed.includes(target)) return false;
                for (const exc of excludeWords) {
                  if (trimmed.includes(String(exc || '').toLowerCase())) return false;
                }
                return true;
              });
              if (idx !== -1) return idx;
            }
            return -1;
          };

          const colDept = findColIndex(
            ['department', 'département', 'dept', 'service', 'rayon'],
            ['department', 'département', 'dept', 'rayon'],
            ['total']
          );

          // Dedicated Item Name column - explicitly exclude description and number columns
          const colItemName = findColIndex(
            ['item name', 'items name', 'item_name', 'item-name', 'nom de l\'article', 'nom article', 'nom du produit', 'nom produit', 'article name', 'product name', 'item title', 'nom', 'article', 'produit', 'item / service'],
            ['item name', 'items name', 'nom article', 'nom produit', 'nom de l\'article', 'article', 'produit'],
            ['description', 'desc', '#', 'num', 'number', 'no.', 'no', 'code', 'sku', 'ref', 'détail', 'libellé', 'qty', 'quantité', 'price', 'prix', 'montant', 'ext']
          );

          // Dedicated Item Description column
          const colDesc = findColIndex(
            ['item description', 'items description', 'item desc', 'item_description', 'description', 'desc', 'description article', 'description de l\'article', 'libellé', 'memo', 'détail', 'details', 'comment', 'commentaire'],
            ['description', 'desc', 'libellé', 'détail', 'memo'],
            ['department', 'département', 'qty', 'quantité', 'price', 'prix', 'total']
          );

          // Dedicated Item Number / SKU column
          const colItemNum = findColIndex(
            ['item #', 'item no', 'item no.', 'item number', 'item num', 'item_number', 'item_#', 'code article', 'code produit', 'sku', 'ref', 'reference', 'référence'],
            ['item #', 'item no', 'sku', 'ref', 'code article', 'code produit'],
            ['description', 'desc', 'name', 'nom']
          );

          const colAttribute = findColIndex(
            ['attribute', 'attribut', 'taille', 'size'],
            ['attribute', 'attribut'],
            []
          );

          const colAssociate = findColIndex(
            ['associate', 'associé', 'rep', 'sales rep', 'vendeur', 'représentant', 'employee', 'employé', 'nom employé', 'salarié', 'staff', 'caissier', 'cashier'],
            ['associate', 'associé', 'vendeur', 'représentant', 'rep', 'employé', 'employee', 'caissier', 'staff'],
            ['department', 'département', 'item', 'description', 'desc', 'price', 'prix', 'total', 'amount', 'montant']
          );

          const colQty = findColIndex(
            ['qty sold', 'qty', 'quantité', 'qte', 'quantity', 'units sold', 'units'],
            ['qty', 'quantité', 'qte', 'quantity', 'units'],
            []
          );

          const colExtPrice = findColIndex(
            ['ext price', 'extended price', 'amount', 'montant', 'total amount', 'chiffre d\'affaires', 'total price', 'prix total', 'prix', 'valeur', 'total'],
            ['ext price', 'amount', 'montant', 'prix', 'price'],
            []
          );
          
          const parsedRows: ParsedQuickBooksRow[] = [];
          const associateSet = new Set<string>();
          let skippedSummaryRowsCount = 0;
          
          // Process data rows
          for (let i = headerRowIndex + 1; i < rawJson.length; i++) {
            const row = rawJson[i];
            if (!row || row.length === 0) continue;
            
            const extPriceRaw = colExtPrice !== -1 ? row[colExtPrice] : (row[row.length - 1] || 0);
            const extPrice = Math.abs(parseFloat(String(extPriceRaw).replace(/[^0-9.-]+/g, "")));
            
            // Filter rule: Only rows with Ext Price > 0
            if (isNaN(extPrice) || extPrice <= 0) continue;

            const deptRaw = colDept !== -1 && row[colDept] !== undefined && row[colDept] !== null
              ? String(row[colDept]).trim()
              : '';
            const itemNameRaw = colItemName !== -1 && row[colItemName] !== undefined && row[colItemName] !== null
              ? String(row[colItemName]).trim()
              : '';
            const itemDescRaw = colDesc !== -1 && row[colDesc] !== undefined && row[colDesc] !== null
              ? String(row[colDesc]).trim()
              : '';
            const itemNumRaw = colItemNum !== -1 && row[colItemNum] !== undefined && row[colItemNum] !== null
              ? String(row[colItemNum]).trim()
              : '';
            
            // Primary lookup: Attribute column. Secondary fallback: Associate/Rep column
            const attrVal = colAttribute !== -1 && row[colAttribute] !== undefined && row[colAttribute] !== null
              ? String(row[colAttribute]).trim()
              : '';
            const assocVal = colAssociate !== -1 && row[colAssociate] !== undefined && row[colAssociate] !== null
              ? String(row[colAssociate]).trim()
              : '';
            
            let associateRaw = attrVal || assocVal;
            if (!associateRaw) {
              associateRaw = "Non Assigné";
            }

            // Also check first and second columns of raw row
            const firstCol = row[0] !== undefined && row[0] !== null ? String(row[0]).trim() : '';
            const secondCol = row[1] !== undefined && row[1] !== null ? String(row[1]).trim() : '';

            // Check for summary/total keywords across all columns in the row
            const rowValues = row.map((cell: any) => String(cell || '').trim().toLowerCase());
            const hasTotalKeyword = rowValues.some((val: string) =>
              val === 'total' ||
              val === 'grand total' ||
              val === 'total général' ||
              val === 'somme' ||
              val === 'subtotal' ||
              val === 'sous-total' ||
              val.startsWith('total ') ||
              val.endsWith(' total') ||
              val.startsWith('grand total')
            );

            // Also check if text info is completely absent (only orphan amount row)
            const hasNoTextInfo = !deptRaw && !itemNameRaw && !itemDescRaw && (!attrVal && !assocVal);

            if (hasTotalKeyword || hasNoTextInfo) {
              skippedSummaryRowsCount++;
              continue;
            }

            const effectiveDept = deptRaw || firstCol || 'Général';
            
            // Priority: Explicit Item Name -> fallback to second column -> fallback to description -> default
            let effectiveItem = itemNameRaw;
            if (!effectiveItem) {
              if (secondCol && secondCol !== deptRaw && secondCol !== assocVal && secondCol !== itemDescRaw) {
                effectiveItem = secondCol;
              } else if (itemDescRaw) {
                effectiveItem = itemDescRaw;
              } else if (itemNumRaw) {
                effectiveItem = `Article #${itemNumRaw}`;
              } else {
                effectiveItem = 'Article Divers';
              }
            }
            
            const parsedRow: ParsedQuickBooksRow = {
              department: effectiveDept,
              itemName: effectiveItem || 'Vente Divers',
              associate: associateRaw,
              qtySold: colQty !== -1 && row[colQty] ? parseInt(String(row[colQty]).replace(/[^0-9-]+/g, ""), 10) || 1 : 1,
              extPrice: extPrice,
              itemNumber: itemNumRaw,
              itemDescription: itemDescRaw
            };
            
            parsedRows.push(parsedRow);
            associateSet.add(associateRaw);
          }
          
          return {
            rows: parsedRows,
            uniqueAssociates: Array.from(associateSet),
            extractedDateRange,
            skippedSummaryRowsCount
          };
  }
}
