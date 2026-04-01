import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileText, Loader2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export default function ExportButtons({ petition }) {
  const [exporting, setExporting] = useState(null);

  const handleExportPDF = async () => {
    setExporting("pdf");
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const content = petition.generated_content || "";
      const lines = content.split("\n");
      const pageWidth = 210;
      const marginLeft = 30;
      const maxWidth = pageWidth - marginLeft - 20;
      let y = 30;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) { y += 6; if (y > 275) { doc.addPage(); y = 25; } continue; }
        const isHeading = trimmed === trimmed.toUpperCase() && trimmed.length > 3 && !trimmed.startsWith("*");
        const isBold = trimmed.startsWith("**") || isHeading;
        const cleanText = trimmed.replace(/\*\*/g, "").replace(/#{1,6}\s/g, "");
        doc.setFont("helvetica", isBold || isHeading ? "bold" : "normal");
        doc.setFontSize(12);
        const splitLines = doc.splitTextToSize(cleanText, maxWidth);
        for (const sl of splitLines) {
          if (y > 275) { doc.addPage(); y = 25; }
          doc.text(sl, marginLeft, y);
          y += 7;
        }
      }
      doc.save(`${petition.title || "peticao"}.pdf`);
      toast.success("PDF exportado!");
    } catch (err) {
      toast.error("Erro ao exportar PDF");
    } finally {
      setExporting(null);
    }
  };

  const handleExportDOCX = async () => {
    setExporting("docx");
    try {
      const { Document, Paragraph, TextRun, HeadingLevel, Packer, AlignmentType } = await import("docx");
      const content = petition.generated_content || "";
      const lines = content.split("\n");

      const paragraphs = lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return new Paragraph({ text: "" });

        const cleanText = trimmed.replace(/\*\*/g, "").replace(/#{1,6}\s/g, "");
        const isHeading = trimmed === trimmed.toUpperCase() && trimmed.length > 3 && !trimmed.startsWith("*");
        const isBold = trimmed.startsWith("**");

        if (isHeading) {
          return new Paragraph({
            children: [new TextRun({ text: cleanText, bold: true, size: 26 })],
            spacing: { before: 240, after: 120 },
          });
        }
        return new Paragraph({
          children: [new TextRun({ text: cleanText, bold: isBold, size: 24 })],
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 120 },
          indent: { firstLine: 720 },
        });
      });

      const doc = new Document({
        sections: [{
          properties: {},
          children: paragraphs,
        }],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${petition.title || "peticao"}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("DOCX exportado!");
    } catch (err) {
      toast.error("Erro ao exportar DOCX: " + err.message);
    } finally {
      setExporting(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90" disabled={!!exporting}>
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {exporting ? "Exportando..." : "Baixar"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleExportPDF} className="gap-2 cursor-pointer">
          <FileText className="w-4 h-4 text-red-500" /> Exportar PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportDOCX} className="gap-2 cursor-pointer">
          <FileText className="w-4 h-4 text-blue-500" /> Exportar DOCX
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}