import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileText, Loader2, Printer } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { getPetitionFormat } from "@/hooks/usePetitionFormat.js";

export default function ExportButtons({ petition, petitionConfig }) {
  const [exporting, setExporting] = useState(null);

  const cfg = petitionConfig || {};
  const fmt = getPetitionFormat(cfg);

  // cm → mm
  const cm2mm = (v) => v * 10;

  const headerText = cfg.cabecalho_texto || [
    cfg.escritorio,
    cfg.advogado_principal ? `${cfg.advogado_principal} — OAB/${cfg.uf_oab || ""} ${cfg.oab || ""}` : "",
  ].filter(Boolean).join("\n");
  const footerText = cfg.rodape_texto || "";

  // ── IMPRESSÃO (janela HTML) ──────────────────────────────────────────
  const handlePrint = () => {
    const content = petition.generated_content || "";
    const logoHtml = cfg.logo_url
      ? `<img src="${cfg.logo_url}" style="max-height:72px;display:block;margin:0 auto 8px;" crossorigin="anonymous" />`
      : "";

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <title>${petition.title || "Petição"}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Roboto&display=swap');
    @page {
      size: A4;
      margin: ${fmt.marginTop}cm ${fmt.marginRight}cm ${fmt.marginBottom}cm ${fmt.marginLeft}cm;
    }
    * { box-sizing: border-box; }
    body {
      font-family: "${fmt.font}", "Times New Roman", serif;
      font-size: ${fmt.fontSize}pt;
      line-height: ${fmt.lineHeight};
      color: #000;
      margin: 0;
    }
    .header {
      text-align: center;
      border-bottom: 1px solid #ccc;
      padding-bottom: 10px;
      margin-bottom: 18px;
    }
    .header p { margin: 2px 0; font-size: 10pt; white-space: pre-line; }
    .content { white-space: pre-wrap; text-align: justify; }
    .content p { text-indent: 1.25cm; margin-bottom: 0; }
    .footer {
      position: fixed;
      bottom: 0;
      left: 0; right: 0;
      text-align: center;
      font-size: 9pt;
      color: #555;
      border-top: 1px solid #ccc;
      padding-top: 6px;
      white-space: pre-line;
    }
  </style>
</head>
<body>
  <div class="header">
    ${logoHtml}
    <p>${headerText.replace(/</g, "&lt;")}</p>
  </div>
  ${footerText ? `<div class="footer">${footerText.replace(/</g, "&lt;")}</div>` : ""}
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

      const PW = 210; // A4 width mm
      const PH = 297; // A4 height mm
      const ML = cm2mm(fmt.marginLeft);
      const MR = cm2mm(fmt.marginRight);
      const MT = cm2mm(fmt.marginTop);
      const MB = cm2mm(fmt.marginBottom);
      const maxW = PW - ML - MR;
      const bodyBottom = PH - MB - 12; // reserva para rodapé

      const doc = new jsPDF({ unit: "mm", format: "a4" });

      // Mapeamento de fonte (jsPDF só suporta helvetica/times/courier nativamente)
      const jsPdfFont = fmt.font.toLowerCase().includes("times") ? "times" :
        fmt.font.toLowerCase().includes("courier") ? "courier" : "helvetica";

      const lineSpacingFactor = fmt.lineHeight;
      const fs = fmt.fontSize;

      let y = MT;

      const newPage = () => {
        doc.addPage();
        y = MT;
        renderFooter();
        renderHeader(false); // sem logo em páginas seguintes, só texto
      };

      const needNewPage = (needed) => {
        if (y + needed > bodyBottom) { newPage(); return true; }
        return false;
      };

      // ── rodapé em todas as páginas ──
      const renderFooter = () => {
        if (!footerText) return;
        doc.setFont(jsPdfFont, "normal");
        doc.setFontSize(8);
        doc.setDrawColor(180, 150, 80);
        doc.line(ML, PH - MB, PW - MR, PH - MB);
        const fLines = doc.splitTextToSize(footerText, maxW);
        let fy = PH - MB + 4;
        fLines.forEach((fl) => {
          doc.text(fl, PW / 2, fy, { align: "center" });
          fy += 4;
        });
      };

      const renderHeader = async (withLogo) => {
        let hy = MT;
        if (withLogo && cfg.logo_url) {
          try {
            const img = await new Promise((res, rej) => {
              const i = new Image();
              i.crossOrigin = "anonymous";
              i.onload = () => res(i);
              i.onerror = rej;
              i.src = cfg.logo_url;
            });
            const canvas = document.createElement("canvas");
            canvas.width = img.width; canvas.height = img.height;
            canvas.getContext("2d").drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL("image/png");
            const ratio = img.width / img.height;
            const imgH = 18; const imgW = imgH * ratio;
            doc.addImage(dataUrl, "PNG", (PW - imgW) / 2, hy, imgW, imgH);
            hy += imgH + 3;
          } catch (_) {}
        }
        if (headerText) {
          doc.setFont(jsPdfFont, "normal");
          doc.setFontSize(9);
          const hLines = doc.splitTextToSize(headerText, maxW);
          hLines.forEach((l) => {
            doc.text(l, PW / 2, hy, { align: "center" });
            hy += 5;
          });
        }
        // Linha separadora dourada
        hy += 2;
        doc.setDrawColor(180, 150, 80);
        doc.line(ML, hy, PW - MR, hy);
        y = hy + 6;
        return hy;
      };

      // Página 1
      await renderHeader(true);
      renderFooter();

      // ── conteúdo ──
      const lineH = fs * 0.352778 * lineSpacingFactor; // pt → mm * factor
      const indentMm = 12.5; // 1.25cm

      const content = petition.generated_content || "";
      const lines = content.split("\n");

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) { y += lineH * 0.5; if (y > bodyBottom) newPage(); continue; }
        const isHeading = trimmed === trimmed.toUpperCase() && trimmed.length > 3 && !trimmed.startsWith("*");
        const isBold = trimmed.startsWith("**") || isHeading;
        const cleanText = trimmed.replace(/\*\*/g, "").replace(/#{1,6}\s/g, "");
        doc.setFont(jsPdfFont, isBold ? "bold" : "normal");
        doc.setFontSize(isHeading ? fs + 0.5 : fs);
        const splitLines = doc.splitTextToSize(cleanText, maxW - (isHeading ? 0 : indentMm));
        for (let i = 0; i < splitLines.length; i++) {
          needNewPage(lineH);
          const x = isHeading ? PW / 2 : (i === 0 ? ML + indentMm : ML);
          const align = isHeading ? "center" : "left";
          doc.text(splitLines[i], x, y, { align });
          y += lineH;
        }
        if (isHeading) y += lineH * 0.3;
      }

      doc.save(`${petition.title || "peticao"}.pdf`);
      toast.success("PDF exportado com formatação processual!");
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
      const { Document, Paragraph, TextRun, Packer, AlignmentType, Header, Footer, convertInchesToTwip } = await import("docx");

      const cm2twip = (cm) => Math.round(cm * 567); // 1cm = 567 twip

      const content = petition.generated_content || "";
      const lines = content.split("\n");

      // Tamanho de fonte em half-points (docx usa half-points)
      const halfPt = fmt.fontSize * 2;
      // Line spacing em twip (240 twip = single, 360 = 1.5, 480 = double)
      const lineSpacingTwip = Math.round(240 * fmt.lineHeight);

      const bodyParagraphs = lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return new Paragraph({ text: "", spacing: { line: lineSpacingTwip } });
        const cleanText = trimmed.replace(/\*\*/g, "").replace(/#{1,6}\s/g, "");
        const isHeading = trimmed === trimmed.toUpperCase() && trimmed.length > 3 && !trimmed.startsWith("*");
        const isBold = trimmed.startsWith("**") || isHeading;
        return new Paragraph({
          children: [new TextRun({
            text: cleanText,
            bold: isBold,
            size: halfPt,
            font: fmt.font,
          })],
          alignment: isHeading ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
          spacing: { line: lineSpacingTwip, before: isHeading ? 240 : 0, after: isHeading ? 120 : 80 },
          indent: isHeading ? undefined : { firstLine: cm2twip(1.25) },
        });
      });

      // Cabeçalho
      const headerChildren = [];
      headerText.split("\n").forEach((l, i) => {
        if (!l.trim()) return;
        headerChildren.push(new Paragraph({
          children: [new TextRun({ text: l.trim(), size: 20, bold: i === 0, font: fmt.font })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
        }));
      });

      // Rodapé
      const footerChildren = footerText
        ? footerText.split("\n").map((l) => new Paragraph({
            children: [new TextRun({ text: l, size: 18, font: fmt.font })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 },
          }))
        : [];

      const doc = new Document({
        sections: [{
          properties: {
            page: {
              margin: {
                top: cm2twip(fmt.marginTop),
                bottom: cm2twip(fmt.marginBottom),
                left: cm2twip(fmt.marginLeft),
                right: cm2twip(fmt.marginRight),
              },
              size: { width: cm2twip(21), height: cm2twip(29.7) }, // A4
            },
          },
          headers: headerChildren.length ? { default: new Header({ children: headerChildren }) } : undefined,
          footers: footerChildren.length ? { default: new Footer({ children: footerChildren }) } : undefined,
          children: bodyParagraphs,
        }],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${petition.title || "peticao"}.docx`;
      a.click(); URL.revokeObjectURL(url);
      toast.success("DOCX exportado com formatação processual!");
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