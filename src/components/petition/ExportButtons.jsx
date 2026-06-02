import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileText, Loader2, Printer } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { getPetitionFormat } from "@/hooks/usePetitionFormat.js";

export default function ExportButtons({ petition, petitionConfig }) {
  const [exporting, setExporting] = useState(null);

  const fmt = getPetitionFormat(petitionConfig);

  const cm2mm   = (v) => v * 10;
  const cm2twip = (v) => Math.round(v * 567);

  // Carrega uma imagem e retorna { dataUrl, width, height } em pixels
  const loadImage = (url) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext("2d").drawImage(img, 0, 0);
        resolve({ dataUrl: canvas.toDataURL("image/png"), width: img.width, height: img.height });
      };
      img.onerror = reject;
      img.src = url;
    });

  // ── IMPRESSÃO HTML ──────────────────────────────────────────────────────
  const handlePrint = () => {
    const content = petition.generated_content || "";

    const logoHtml = fmt.logoUrl
      ? `<img src="${fmt.logoUrl}" style="max-height:90px;display:block;margin:0 auto;" crossorigin="anonymous"/>`
      : "";

    // Rodapé: imagem de largura total ou texto
    const footerHtml = fmt.footerImageUrl
      ? `<img src="${fmt.footerImageUrl}" style="width:100%;display:block;" crossorigin="anonymous"/>`
      : fmt.footerText
      ? `<p style="white-space:pre-line;margin:0;font-size:${Math.max(fmt.fontSize - 2, 8)}pt;">${fmt.footerText.replace(/</g, "&lt;")}</p>`
      : "";

    const bodyHtml = content
      .split("\n")
      .map((line) => {
        const t = line.trim();
        if (!t) return "<br/>";
        const clean = t.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/#{1,6}\s/g, "");
        const isHeading = t === t.toUpperCase() && t.length > 3 && !t.startsWith("*");
        if (isHeading)
          return `<p style="text-align:center;font-weight:bold;text-transform:uppercase;margin:1em 0 0.4em;">${clean}</p>`;
        return `<p style="text-indent:1.25cm;margin:0 0 0.3em;text-align:justify;">${clean}</p>`;
      })
      .join("");

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <title>${(petition.title || "Petição").replace(/</g, "&lt;")}</title>
  <style>
    @page {
      size: A4;
      margin: ${fmt.marginTop}cm ${fmt.marginRight}cm ${fmt.marginBottom}cm ${fmt.marginLeft}cm;
    }
    * { box-sizing: border-box; }
    body {
      font-family: "${fmt.font}", Arial, sans-serif;
      font-size: ${fmt.fontSize}pt;
      line-height: ${fmt.lineHeight};
      color: #000;
      margin: 0;
    }
    .header { text-align:center; border-bottom:1px solid #ccc; padding-bottom:10px; margin-bottom:16px; }
    .footer {
      position: fixed; bottom: 0; left: 0; right: 0;
      text-align: center;
    }
  </style>
</head>
<body>
  ${logoHtml ? `<div class="header">${logoHtml}</div>` : ""}
  ${footerHtml ? `<div class="footer">${footerHtml}</div>` : ""}
  <div>${bodyHtml}</div>
</body>
</html>`;

    const w = window.open("", "_blank");
    if (!w) { toast.error("Pop-up bloqueado. Permita pop-ups para imprimir."); return; }
    w.document.write(html);
    w.document.close();
    w.onload = () => { w.focus(); w.print(); };
    toast.success("Janela de impressão aberta!");
  };

  // ── PDF (jsPDF) ─────────────────────────────────────────────────────────
  const handleExportPDF = async () => {
    setExporting("pdf");
    try {
      const { jsPDF } = await import("jspdf");

      const PW = 210;
      const PH = 297;
      const ML = cm2mm(fmt.marginLeft);
      const MR = cm2mm(fmt.marginRight);
      const MT = cm2mm(fmt.marginTop);
      const MB = cm2mm(fmt.marginBottom);
      const maxW = PW - ML - MR;

      // jsPDF só suporta helvetica/times/courier nativamente
      const jsPdfFont = fmt.font.toLowerCase().includes("times")   ? "times"
                      : fmt.font.toLowerCase().includes("courier") ? "courier"
                      : "helvetica";

      // Pré-carrega imagens
      let logoImg = null;
      let footerImg = null;

      if (fmt.logoUrl) {
        try { logoImg = await loadImage(fmt.logoUrl); } catch (_) {}
      }
      if (fmt.footerImageUrl) {
        try { footerImg = await loadImage(fmt.footerImageUrl); } catch (_) {}
      }

      // Altura do rodapé em mm
      const footerImgH = footerImg
        ? Math.min((footerImg.height / footerImg.width) * (PW - ML - MR), 25) // máx 25mm
        : 0;
      const footerTextH = !footerImg && fmt.footerText ? 14 : 0;
      const footerReserve = footerImgH || footerTextH;
      const bodyBottom = PH - MB - footerReserve;

      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const fs = fmt.fontSize;
      const lineH = fs * 0.352778 * fmt.lineHeight;

      let y = MT;

      const drawFooter = () => {
        const footerY = PH - MB - footerReserve;
        if (footerImg) {
          const imgW = PW - ML - MR;
          doc.addImage(footerImg.dataUrl, "PNG", ML, footerY, imgW, footerImgH);
        } else if (fmt.footerText) {
          doc.setDrawColor(150, 150, 150);
          doc.line(ML, footerY, PW - MR, footerY);
          doc.setFont(jsPdfFont, "normal");
          doc.setFontSize(Math.max(fs - 2, 8));
          const fLines = doc.splitTextToSize(fmt.footerText, maxW);
          let fy = footerY + 4;
          fLines.forEach((fl) => {
            doc.text(fl, PW / 2, fy, { align: "center" });
            fy += 4;
          });
        }
      };

      const drawHeader = (withLogo) => {
        let hy = MT;
        if (withLogo && logoImg) {
          const ratio = logoImg.width / logoImg.height;
          const imgH = 18;
          const imgW = imgH * ratio;
          doc.addImage(logoImg.dataUrl, "PNG", (PW - imgW) / 2, hy, imgW, imgH);
          hy += imgH + 3;
        }
        hy += 2;
        doc.setDrawColor(150, 150, 150);
        doc.line(ML, hy, PW - MR, hy);
        y = hy + 6;
      };

      const newPage = () => {
        doc.addPage();
        y = MT;
        drawFooter();
        drawHeader(false);
      };

      const checkPage = (needed) => {
        if (y + needed > bodyBottom) { newPage(); return true; }
        return false;
      };

      // Página 1
      drawHeader(true);
      drawFooter();

      // Conteúdo
      const content = petition.generated_content || "";
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) {
          y += lineH * 0.5;
          checkPage(0);
          continue;
        }
        const isHeading = trimmed === trimmed.toUpperCase() && trimmed.length > 3 && !trimmed.startsWith("*");
        const isBold = trimmed.startsWith("**") || isHeading;
        const clean = trimmed.replace(/\*\*/g, "").replace(/#{1,6}\s/g, "");
        doc.setFont(jsPdfFont, isBold ? "bold" : "normal");
        doc.setFontSize(fs);
        const splitLines = doc.splitTextToSize(clean, isHeading ? maxW : maxW - 12.5);
        for (let i = 0; i < splitLines.length; i++) {
          checkPage(lineH);
          if (isHeading) {
            doc.text(splitLines[i], PW / 2, y, { align: "center" });
          } else {
            const x = i === 0 ? ML + 12.5 : ML;
            doc.text(splitLines[i], x, y);
          }
          y += lineH;
        }
        if (isHeading) y += lineH * 0.4;
      }

      doc.save(`${petition.title || "peticao"}.pdf`);
      toast.success("PDF exportado!");
    } catch (err) {
      toast.error("Erro ao exportar PDF: " + err.message);
    } finally {
      setExporting(null);
    }
  };

  // ── DOCX ────────────────────────────────────────────────────────────────
  const handleExportDOCX = async () => {
    setExporting("docx");
    try {
      const { Document, Paragraph, TextRun, Packer, AlignmentType, Header, Footer, ImageRun } = await import("docx");

      const halfPt = fmt.fontSize * 2;
      const lineSpacingTwip = Math.round(240 * fmt.lineHeight);
      const indentTwip = cm2twip(1.25);

      const content = petition.generated_content || "";
      const bodyParagraphs = content.split("\n").map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return new Paragraph({ text: "", spacing: { line: lineSpacingTwip, after: 0 } });
        const clean = trimmed.replace(/\*\*/g, "").replace(/#{1,6}\s/g, "");
        const isHeading = trimmed === trimmed.toUpperCase() && trimmed.length > 3 && !trimmed.startsWith("*");
        const isBold = trimmed.startsWith("**") || isHeading;
        return new Paragraph({
          children: [new TextRun({ text: clean, bold: isBold, size: halfPt, font: fmt.font })],
          alignment: isHeading ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
          spacing: { line: lineSpacingTwip, before: isHeading ? 240 : 0, after: isHeading ? 120 : 60 },
          indent: isHeading ? undefined : { firstLine: indentTwip },
        });
      });

      // Cabeçalho DOCX — só logo como imagem
      let headerChildren = [];
      if (fmt.logoUrl) {
        try {
          const logoData = await loadImage(fmt.logoUrl);
          const resp = await fetch(fmt.logoUrl);
          const buf = await resp.arrayBuffer();
          const maxLogoW = cm2twip(8); // máx 8cm
          const ratio = logoData.width / logoData.height;
          const logoH = Math.round(maxLogoW / ratio);
          headerChildren = [
            new Paragraph({
              children: [
                new ImageRun({
                  data: buf,
                  transformation: { width: maxLogoW / 914400 * 12700 * 72, height: logoH / 914400 * 12700 * 72 },
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
          ];
        } catch (_) {}
      }

      // Rodapé DOCX — imagem de largura total ou texto
      let footerChildren = [];
      if (fmt.footerImageUrl) {
        try {
          const resp = await fetch(fmt.footerImageUrl);
          const buf = await resp.arrayBuffer();
          const footerImgData = await loadImage(fmt.footerImageUrl);
          const pageW = cm2twip(21 - fmt.marginLeft - fmt.marginRight);
          const ratio = footerImgData.width / footerImgData.height;
          // Converte twip → EMU (1 twip = 635 EMU, 1 pt = 12700 EMU)
          const wEmu = Math.round(pageW * 635);
          const hEmu = Math.round(wEmu / ratio);
          footerChildren = [
            new Paragraph({
              children: [
                new ImageRun({
                  data: buf,
                  transformation: { width: Math.round(wEmu / 9144), height: Math.round(hEmu / 9144) },
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
          ];
        } catch (_) {
          // fallback texto
          if (fmt.footerText) {
            footerChildren = fmt.footerText.split("\n").map((l) =>
              new Paragraph({
                children: [new TextRun({ text: l, size: Math.max(halfPt - 4, 16), font: fmt.font })],
                alignment: AlignmentType.CENTER,
              })
            );
          }
        }
      } else if (fmt.footerText) {
        footerChildren = fmt.footerText.split("\n").map((l) =>
          new Paragraph({
            children: [new TextRun({ text: l, size: Math.max(halfPt - 4, 16), font: fmt.font })],
            alignment: AlignmentType.CENTER,
          })
        );
      }

      const doc = new Document({
        sections: [{
          properties: {
            page: {
              margin: {
                top:    cm2twip(fmt.marginTop),
                bottom: cm2twip(fmt.marginBottom),
                left:   cm2twip(fmt.marginLeft),
                right:  cm2twip(fmt.marginRight),
              },
              size: { width: cm2twip(21), height: cm2twip(29.7) },
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