/**
 * FinOps PDF Generator Engine
 * For Badge and Document layout rendering directly to PDF binary.
 */
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';

export async function generateBadgePdf(badgeElement: HTMLElement, fileName: string = "badge.pdf"): Promise<void> {
  if (!badgeElement) {
    throw new Error('Badge element is required for PDF generation.');
  }
  
  try {
    const dataUrl = await toPng(badgeElement, {
      quality: 1,
      pixelRatio: 3,
      backgroundColor: '#ffffff'
    });
    
    // We can assume CR80 ID card size usually 85.6mm x 54mm (or reverse for portrait)
    // Here we're saving portrait as default 54 x 85.6
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [54, 85.6],
    });
    
    pdf.addImage(dataUrl, 'PNG', 0, 0, 54, 85.6);
    pdf.save(fileName);
  } catch (error) {
    console.error("PDF generation failed:", error);
    throw error;
  }
}
