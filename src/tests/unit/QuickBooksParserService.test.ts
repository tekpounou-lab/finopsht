import { describe, it, expect } from "vitest";
import { QuickBooksParserService } from "../../domains/ledger/services/QuickBooksParserService";
import * as XLSX from "xlsx";

describe("QuickBooksParserService Unit Tests", () => {
  it("skips total/summary rows and correctly parses valid transactions", async () => {
    // Generate a mock Excel workbook
    const wsData = [
      ["Date: 01/08/2026 07:00:00 to 15/08/2026 23:59:00"],
      ["Some Company Name - Sales Report"],
      [],
      ["Department", "Item Name", "Associate", "Qty Sold", "Ext Price", "Item #", "Description"],
      ["BAR", "Prestige Beer", "Jean Dupont", 10, "1500.00", "BEER01", "Bière Prestige 33cl"],
      ["KITCHEN", "Griot Plate", "Marie Claire", 5, "3500.00", "GRIOT01", "Assiette Griot Banane"],
      // Summary / Total Rows that MUST be skipped
      ["Total BAR", "Total", "", "", "1500.00", "", ""],
      ["", "", "Grand Total", "", "5000.00", "", ""],
      ["Grand Total", "", "", "", "5000.00", "", ""],
      ["", "", "", "", "5000.00", "", ""],
      ["BOUTIQUE", "T-Shirt FinOps", "Jean Dupont", 2, "1200.00", "TSHIRT01", "T-Shirt Coton"]
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales");
    const wbBuffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });

    const result = await QuickBooksParserService.parseRawReport(wbBuffer);

    // Should only have the 3 genuine transaction rows
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0].department).toBe("BAR");
    expect(result.rows[0].itemName).toBe("Prestige Beer");
    expect(result.rows[0].associate).toBe("Jean Dupont");
    expect(result.rows[0].extPrice).toBe(1500);

    expect(result.rows[1].department).toBe("KITCHEN");
    expect(result.rows[1].itemName).toBe("Griot Plate");

    expect(result.rows[2].department).toBe("BOUTIQUE");
    expect(result.rows[2].itemName).toBe("T-Shirt FinOps");

    // Skipped summary rows count should be 4
    expect(result.skippedSummaryRowsCount).toBe(4);

    // Unique associates
    expect(result.uniqueAssociates).toContain("Jean Dupont");
    expect(result.uniqueAssociates).toContain("Marie Claire");

    // Extracted date range
    expect(result.extractedDateRange).toBeDefined();
    expect(result.extractedDateRange?.startDate).toBe("2026-08-01");
    expect(result.extractedDateRange?.endDate).toBe("2026-08-15");
  });

  it("correctly distinguishes Item Name from Item Description when Description appears before Item Name", async () => {
    const wsData = [
      ["Department", "Item #", "Item Description", "Item Name", "Attribute", "Qty Sold", "Ext Price"],
      ["ELECTRONICS", "LAP001", "High Performance 16GB RAM 512GB SSD", "Dell XPS 15", "Alexandre Pierre", 1, "125000.00"],
      ["AUDIO", "SPK002", "Wireless Bluetooth Waterproof Speaker", "JBL Flip 6", "Alexandre Pierre", 2, "18000.00"]
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales");
    const wbBuffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });

    const result = await QuickBooksParserService.parseRawReport(wbBuffer);

    expect(result.rows).toHaveLength(2);
    // Item Name MUST be "Dell XPS 15", NOT the description "High Performance 16GB RAM 512GB SSD"
    expect(result.rows[0].itemName).toBe("Dell XPS 15");
    expect(result.rows[0].itemDescription).toBe("High Performance 16GB RAM 512GB SSD");
    expect(result.rows[0].itemNumber).toBe("LAP001");
    expect(result.rows[0].associate).toBe("Alexandre Pierre");

    expect(result.rows[1].itemName).toBe("JBL Flip 6");
    expect(result.rows[1].itemDescription).toBe("Wireless Bluetooth Waterproof Speaker");
    expect(result.rows[1].itemNumber).toBe("SPK002");
  });

  it("handles French QuickBooks reports with Nom de l'article and Description de l'article", async () => {
    const wsData = [
      ["Département", "Code Article", "Nom de l'article", "Description de l'article", "Vendeur", "Quantité", "Montant Total"],
      ["BAR", "RUM01", "Rhum Barbancourt 5 Étoiles", "Bouteille 750ml 8 Ans d'Âge", "Jean Baptiste", 3, "7500.00"]
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ventes");
    const wbBuffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });

    const result = await QuickBooksParserService.parseRawReport(wbBuffer);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].itemName).toBe("Rhum Barbancourt 5 Étoiles");
    expect(result.rows[0].itemDescription).toBe("Bouteille 750ml 8 Ans d'Âge");
    expect(result.rows[0].itemNumber).toBe("RUM01");
    expect(result.rows[0].associate).toBe("Jean Baptiste");
    expect(result.rows[0].extPrice).toBe(7500);
  });
});
