export const TEMPLATE_COLUMNS = [
  "date",
  "type",
  "category",
  "description",
  "amount_htg",
  "employee_email",
  "branch_code",
  "department_code",
  "payment_method",
  "reference",
  "notes"
];

export const TEMPLATE_SAMPLE_ROWS = [
  ["2026-05-01", "INCOME", "Haircut", "Coupe Premium", "2500", "djeenhaiti509@gmail.com", "DELMAS", "BARBER", "CASH", "TXN-001", "Client Walk-in"],
  ["2026-05-01", "ADVANCE", "Salary Advance", "Avance Employé", "5000", "djeenhaiti509@gmail.com", "DELMAS", "BARBER", "CASH", "ADV-001", "Emergency"],
  ["2026-05-01", "EXPENSE", "Electricity", "Facture EDH", "12000", "", "DELMAS", "ADMIN", "BANK", "EXP-002", "Monthly utilities"]
];

export function generateCsvTemplate(): string {
  const header = TEMPLATE_COLUMNS.join(",");
  const rows = TEMPLATE_SAMPLE_ROWS.map(row => row.join(","));
  const csvContent = [header, ...rows].join("\n");
  return csvContent;
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function downloadCsvTemplate() {
  const csvString = generateCsvTemplate();
  downloadFile(csvString, "finops_transactions_template.csv", "text/csv;charset=utf-8;");
}

export function downloadExcelTemplateSimulated() {
  // In a real app we would use XLSX Library, but for AI Studio preview:
  // we download CSV with an excel friendly Mime type, or simply use .csv as Excel supports it.
  const csvString = "\uFEFF" + generateCsvTemplate(); // Adds BOM for Excel UTF-8 reading
  downloadFile(csvString, "finops_transactions_template.csv", "text/csv;charset=utf-8;");
}
