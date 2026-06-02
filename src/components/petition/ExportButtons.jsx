import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileText, Loader2, Printer } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export default function ExportButtons({ petition, petitionConfig }) {
  const [exporting, setExporting] = useState(null);

  // ── helpers ──────────────────────────────────────────────────────────
  const cfg = petitionConfig || {};
  const headerText = cfg.cabecalho_texto || [
    cfg.escritorio,
    cfg.advogado_principal ? `${cfg.advogado_principal} — OAB/${cfg.uf_oab || ""} ${cfg.oab || ""}` : "",
  ].filter(Boolean).join("\n");
  const footerText = cfg.rodape_texto || "";

  // ── IMPRESSÃO ────────────────────────────────────────────────────────
  const handlePrint = () => {
    const content = petition.generated_content || "";
    const logoHtml = cfg.logo_url
      ? `<img src="${cfg.logo_url}" style="max-height:80px;display:block;margin:0 auto 10px;" />`
      : "";
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <title>${petition.title || "Petição"}</title>
  <style>
    @page { margin: 25mm 20mm; }
    body { font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.6; color: #000; }
    .header { text-align:center; border-bottom:1px solid #ccc; padding-bottom:14px; margin-bottom:20px; }
    .header p { margin:2px 0; font-size:10pt; color:#444; white-space:pre-line; }
    .content { white-space:pre-wrap; text-align:justify; }
    .footer { position:running(footer); text-align:center; font-size:9pt; color:#555; border-top:1px solid #ccc; padding-top:8px; white-space:pre-line; }
    @page { @bottom-center { content: element(footer); } }
  </style>
</head>
<body>
  <div class="header">
    ${logoHtml}
    <p>${headerText}</p>
  </div>
  <div class="footer">${footerText}</div>
  <div class="content">${content.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
</body>
</html>`;
    const w = window.open("", "_blank");
    if (!w) { toast.error("Pop-up bloqueado. Permita pop-ups para imprimir."); return; }
    w.document.write(html);
    w.document.close();
    w.onload = () => { w.focus(); w.print(); };
    toast.success("Janela de impressão aberta!");
  };

  // ── PDF (jsPDF) ──────────────────────────────────────────────────────
  const handleExportPDF = async () => {
    setExporting("pdf");
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const PW = 210;
      const ML = 25, MR = 25, MT = 20;
      const maxW = PW - ML - MR;
      let y = MT;

      const addPageIfNeeded = (needed = 7) => {
        if (y + needed > 272) { doc.addPage(); y = MT; return true; }
        return false;
      };

      // ── cabeçalho ──
      if (cfg.logo_url) {
        try {
          // Carrega imagem via canvas para obter dataUrl
          const img = await new Promise((res, rej) => {
            const i = new Image();
            i.crossOrigin = "anonymous";
            i.onload = () => res(i);
            i.onerror = rej;
            i.src = cfg.logo_url;
          });
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          canvas.getContext("2d").drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL("image/png");
          const ratio = img.width / img.height;
          const imgH = 18;
          const imgW = imgH * ratio;
          doc.addImage(dataUrl, "PNG", (PW - imgW) / 2, y, imgW, imgH);
          y += imgH + 3;
        } catch (_) {
          // Logo falhou — continua sem imagem
        }
      }

      if (headerText) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        const hLines = doc.splitTextToSize(headerText, maxW);
        hLines.forEach((l) => {
          doc.text(l, PW / 2, y, { align: "center" });
          y += 5;
        });
      }

      // Linha separadora
      y += 2;
      doc.setDrawColor(180, 150, 80);
      doc.line(ML, y, PW - MR, y);
      y += 6;

      // ── conteúdo ──
      const content = petition.generated_content || "";
      const lines = content.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) { y += 5; addPageIfNeeded(); continue; }
        const isHeading = trimmed === trimmed.toUpperCase() && trimmed.length > 3 && !trimmed.startsWith("*");
        const isBold = trimmed.startsWith("**") || isHeading;
        const cleanText = trimmed.replace(/\*\*/g, "").replace(/#{1,6}\s/g, "");
        doc.setFont("helvetica", isBold ? "bold" : "normal");
        doc.setFontSize(isHeading ? 12 : 11);
        const splitLines = doc.splitTextToSize(cleanText, maxW);
        for (const sl of splitLines) {
          addPageIfNeeded();
          doc.text(sl, ML, y);
          y += isHeading ? 7 : 6;
        }
        if (isHeading) y += 2;
      }

      // ── rodapé em todas as páginas ──
      if (footerText) {
        const totalPages = doc.getNumberOfPages();
        for (let pg = 1; pg <= totalPages; pg++) {
          doc.setPage(pg);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setDrawColor(180, 150, 80);
          doc.line(ML, 282, PW - MR, 282);
          const fLines = doc.splitTextToSize(footerText, maxW);
          let fy = 285;
          fLines.forEach((fl) => {
            doc.text(fl, PW / 2, fy, { align: "center" });
            fy += 4;
          });
        }
      }

      doc.save(`${petition.title || "peticao"}.pdf`);
      toast.success("PDF exportado com timbre!");
    } catch (err) {
      toast.error("Erro ao exportar PDF: " + err.message);
    } finally {
      setExporting(null);
    }
  };

  // ── DOCX ─────────────────────────────────────────────────────────────
  const handleExportDOCX = async () => {
    setExporting("docx");
    try {
      const { Document, Paragraph, TextRun, Packer, AlignmentType, Header, Footer, ImageRun } = await import("docx");
      const content = petition.generated_content || "";
      const lines = content.split("\n");

      const bodyParagraphs = lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return new Paragraph({ text: "" });
        const cleanText = trimmed.replace(/\*\*/g, "").replace(/#{1,6}\s/g, "");
        const isHeading = trimmed === trimmed.toUpperCase() && trimmed.length > 3 && !trimmed.startsWith("*");
        const isBold = trimmed.startsWith("**") || isHeading;
        return new Paragraph({
          children: [new TextRun({ text: cleanText, bold: isBold, size: isHeading ? 26 : 24 })],
          alignment: isHeading ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
          spacing: { before: isHeading ? 240 : 0, after: 120 },
          indent: isHeading ? undefined : { firstLine: 720 },
        });
      });

      // Cabeçalho DOCX
      const headerChildren = [];
      if (headerText) {
        headerText.split("\n").forEach((l) => {
          if (l.trim()) {
            headerChildren.push(new Paragraph({
              children: [new TextRun({ text: l.trim(), size: 20, bold: headerChildren.length === 0 })],
              alignment: AlignmentType.CENTER,
              spacing: { after: 60 },
            }));
          }
        });
      }

      // Rodapé DOCX
      const footerChildren = footerText
        ? footerText.split("\n").map((l) => new Paragraph({
            children: [new TextRun({ text: l, size: 18 })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 },
          }))
        : [];

      const doc = new Document({
        sections: [{
          properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
          headers: headerChildren.length ? { default: new Header({ children: headerChildren }) } : undefined,
          footers: footerChildren.length ? { default: new Footer({ children: footerChildren }) } : undefined,
          children: bodyParagraphs,
        }],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${petition.title || "peticao"}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("DOCX exportado com timbre!");
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
          {exporting ? "Exportando..." : "Baixar / Imprimir"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handlePrint} className="gap-2 cursor-pointer">
          <Printer className="w-4 h-4 text-muted-foreground" /> Imprimir / Salvar PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportPDF} className="gap-2 cursor-pointer">
          <FileText className="w-4 h-4 text-red-500" /> Exportar PDF (jsPDF)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportDOCX} className="gap-2 cursor-pointer">
          <FileText className="w-4 h-4 text-blue-500" /> Exportar DOCX
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}