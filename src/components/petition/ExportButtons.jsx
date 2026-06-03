import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileText, Loader2, Printer } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { getPetitionFormat } from "@/hooks/usePetitionFormat.js";

/**
 * Classifica uma linha do texto da petição no padrão FAV:
 *  - "heading"   : tudo maiúsculo, sem *, > 3 chars → caixa alta + negrito + sublinhado
 *  - "ementa"    : começa com ">" → bloco recuado 4cm, sem itálico, negrito na ênfase
 *  - "pedido"    : começa com aluno) ou letra) ou número. → minúsculas, negrito
 *  - "fecho"     : contém "Nestes termos" ou "Pede deferimento" → centralizado
 *  - "body"      : parágrafo normal → justificado, recuo 3cm na 1ª linha
 */
function classifyLine(line) {
  const t = line.trim();
  if (!t) return { type: "empty" };
  if (t.startsWith(">")) return { type: "ementa", text: t.slice(1).trim() };
  if (/^(nestes termos|pede deferimento|e\.e\.d\.|termos em que|a\.e\.d\.)/i.test(t))
    return { type: "fecho", text: t };
  // heading: tudo maiúsculo (sem asteriscos, mínimo 4 chars, sem pontuação terminal dominante)
  const noMd = t.replace(/\*\*/g, "").replace(/^#{1,6}\s/, "");
  if (noMd === noMd.toUpperCase() && noMd.length > 3 && !/^[a-z]/.test(noMd))
    return { type: "heading", text: noMd };
  // pedido: linha que começa com letra/número seguido de ) ou .
  if (/^[a-z]\)|^\d+\.\s|^[ivxlc]+\)/i.test(t.replace(/\*\*/g, "")))
    return { type: "pedido", text: noMd };
  const clean = t.replace(/\*\*(.*?)\*\*/g, "$1").replace(/^#{1,6}\s/, "");
  return { type: "body", text: clean, raw: t };
}

export default function ExportButtons({ petition, petitionConfig }) {
  const [exporting, setExporting] = useState(null);

  const fmt = getPetitionFormat(petitionConfig);

  const cm2mm   = (v) => v * 10;
  const cm2twip = (v) => Math.round(v * 567);

  const loadImage = (url) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width; canvas.height = img.height;
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

    const footerHtml = fmt.footerImageUrl
      ? `<img src="${fmt.footerImageUrl}" style="width:100%;display:block;" crossorigin="anonymous"/>`
      : fmt.footerText
      ? `<p style="white-space:pre-line;margin:0;font-size:10pt;">${fmt.footerText.replace(/</g, "&lt;")}</p>`
      : "";

    const bodyHtml = content.split("\n").map((line) => {
      const cl = classifyLine(line);
      if (cl.type === "empty") return "<br/>";

      if (cl.type === "heading") {
        const txt = cl.text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
        return `<p class="heading">${txt}</p>`;
      }
      if (cl.type === "ementa") {
        const txt = cl.text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
        return `<p class="ementa">${txt}</p>`;
      }
      if (cl.type === "pedido") {
        const txt = cl.text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").toLowerCase();
        return `<p class="pedido"><strong>${txt}</strong></p>`;
      }
      if (cl.type === "fecho") {
        return `<p class="fecho">${cl.text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</p>`;
      }
      // body
      const txt = (cl.raw || cl.text).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/^#{1,6}\s/, "");
      return `<p class="body">${txt}</p>`;
    }).join("");

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
      font-family: Arial, sans-serif;
      font-size: 12pt;
      line-height: 1.5;
      color: #000;
      margin: 0;
    }
    .header { text-align:center; border-bottom:1px solid #ccc; padding-bottom:10px; margin-bottom:16px; }
    .footer { position:fixed; bottom:0; left:0; right:0; text-align:center; }
    p { margin: 0 0 0.3em; }
    .heading {
      text-align: center;
      font-weight: bold;
      text-transform: uppercase;
      text-decoration: underline;
      margin: 1em 0 0.4em;
    }
    .ementa {
      margin-left: 4cm;
      text-align: justify;
      font-style: normal;
    }
    .pedido {
      text-align: justify;
      text-indent: ${fmt.firstIndent}cm;
    }
    .fecho {
      text-align: center;
      margin-top: 1em;
    }
    .body {
      text-align: justify;
      text-indent: ${fmt.firstIndent}cm;
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

      const PW = 210, PH = 297;
      const ML = cm2mm(fmt.marginLeft);
      const MR = cm2mm(fmt.marginRight);
      const MT = cm2mm(fmt.marginTop);
      const MB = cm2mm(fmt.marginBottom);
      const maxW = PW - ML - MR;
      const indentMm = cm2mm(fmt.firstIndent);
      const ementaIndentMm = 40; // 4cm

      // jsPDF só suporta helvetica/times/courier nativamente; Arial → helvetica
      const jsPdfFont = "helvetica";
      const fs = fmt.fontSize;
      const lineH = fs * 0.352778 * fmt.lineHeight;

      let logoImg = null, footerImg = null;
      if (fmt.logoUrl) { try { logoImg = await loadImage(fmt.logoUrl); } catch (_) {} }
      if (fmt.footerImageUrl) { try { footerImg = await loadImage(fmt.footerImageUrl); } catch (_) {} }

      const footerImgH = footerImg
        ? Math.min((footerImg.height / footerImg.width) * maxW, 25) : 0;
      const footerTextH = !footerImg && fmt.footerText ? 14 : 0;
      const footerReserve = footerImgH || footerTextH;
      const bodyBottom = PH - MB - footerReserve;

      const doc = new jsPDF({ unit: "mm", format: "a4" });
      let y = MT;

      const drawFooter = () => {
        const fy = PH - MB - footerReserve;
        if (footerImg) {
          doc.addImage(footerImg.dataUrl, "PNG", ML, fy, maxW, footerImgH);
        } else if (fmt.footerText) {
          doc.setDrawColor(150, 150, 150);
          doc.line(ML, fy, PW - MR, fy);
          doc.setFont(jsPdfFont, "normal");
          doc.setFontSize(10);
          const fLines = doc.splitTextToSize(fmt.footerText, maxW);
          let fcy = fy + 4;
          fLines.forEach(fl => { doc.text(fl, PW / 2, fcy, { align: "center" }); fcy += 4; });
        }
      };

      const drawHeader = (withLogo) => {
        let hy = MT;
        if (withLogo && logoImg) {
          const ratio = logoImg.width / logoImg.height;
          const imgH = 18, imgW = imgH * ratio;
          doc.addImage(logoImg.dataUrl, "PNG", (PW - imgW) / 2, hy, imgW, imgH);
          hy += imgH + 3;
        }
        hy += 2;
        doc.setDrawColor(150, 150, 150);
        doc.line(ML, hy, PW - MR, hy);
        y = hy + 6;
      };

      const newPage = () => {
        doc.addPage(); y = MT;
        drawFooter(); drawHeader(false);
      };

      const checkPage = (needed) => { if (y + needed > bodyBottom) { newPage(); return true; } return false; };

      drawHeader(true);
      drawFooter();

      const content = petition.generated_content || "";
      for (const line of content.split("\n")) {
        const cl = classifyLine(line);
        if (cl.type === "empty") { y += lineH * 0.5; checkPage(0); continue; }

        const cleanText = cl.text.replace(/\*\*/g, "");

        if (cl.type === "heading") {
          doc.setFont(jsPdfFont, "bold");
          doc.setFontSize(fs);
          const split = doc.splitTextToSize(cleanText.toUpperCase(), maxW);
          y += lineH * 0.3;
          for (const sl of split) {
            checkPage(lineH);
            // underline manual: draw line under text
            const tw = doc.getTextWidth(sl);
            doc.text(sl, PW / 2, y, { align: "center" });
            doc.setDrawColor(0);
            doc.line((PW - tw) / 2, y + 0.5, (PW + tw) / 2, y + 0.5);
            y += lineH;
          }
          y += lineH * 0.3;
          continue;
        }

        if (cl.type === "ementa") {
          doc.setFont(jsPdfFont, "normal");
          doc.setFontSize(fs);
          const ew = maxW - ementaIndentMm;
          const split = doc.splitTextToSize(cleanText, ew);
          for (const sl of split) {
            checkPage(lineH);
            doc.text(sl, ML + ementaIndentMm, y);
            y += lineH;
          }
          continue;
        }

        if (cl.type === "pedido") {
          doc.setFont(jsPdfFont, "bold");
          doc.setFontSize(fs);
          const pText = cleanText.toLowerCase();
          const split = doc.splitTextToSize(pText, maxW - indentMm);
          for (let i = 0; i < split.length; i++) {
            checkPage(lineH);
            doc.text(split[i], i === 0 ? ML + indentMm : ML, y);
            y += lineH;
          }
          continue;
        }

        if (cl.type === "fecho") {
          doc.setFont(jsPdfFont, "normal");
          doc.setFontSize(fs);
          const split = doc.splitTextToSize(cleanText, maxW);
          y += lineH * 0.5;
          for (const sl of split) {
            checkPage(lineH);
            doc.text(sl, PW / 2, y, { align: "center" });
            y += lineH;
          }
          continue;
        }

        // body
        const isBold = line.trim().startsWith("**");
        doc.setFont(jsPdfFont, isBold ? "bold" : "normal");
        doc.setFontSize(fs);
        const split = doc.splitTextToSize(cleanText, maxW - indentMm);
        for (let i = 0; i < split.length; i++) {
          checkPage(lineH);
          doc.text(split[i], i === 0 ? ML + indentMm : ML, y);
          y += lineH;
        }
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
      const {
        Document, Paragraph, TextRun, Packer,
        AlignmentType, Header, Footer, ImageRun, UnderlineType,
      } = await import("docx");

      const halfPt = 24; // 12pt × 2
      const lineSpacingTwip = Math.round(240 * 1.5); // 360
      const indentTwip = cm2twip(fmt.firstIndent);   // 3cm
      const ementaIndentTwip = cm2twip(4.0);          // 4cm

      const content = petition.generated_content || "";

      const bodyParagraphs = content.split("\n").map((line) => {
        const cl = classifyLine(line);
        const cleanText = cl.text ? cl.text.replace(/\*\*/g, "") : "";

        if (cl.type === "empty") {
          return new Paragraph({ text: "", spacing: { line: lineSpacingTwip, after: 0 } });
        }

        if (cl.type === "heading") {
          return new Paragraph({
            children: [new TextRun({
              text: cleanText.toUpperCase(),
              bold: true,
              underline: { type: UnderlineType.SINGLE },
              size: halfPt,
              font: "Arial",
            })],
            alignment: AlignmentType.CENTER,
            spacing: { line: lineSpacingTwip, before: 240, after: 120 },
          });
        }

        if (cl.type === "ementa") {
          return new Paragraph({
            children: [new TextRun({ text: cleanText, size: halfPt, font: "Arial" })],
            alignment: AlignmentType.JUSTIFIED,
            indent: { left: ementaIndentTwip },
            spacing: { line: lineSpacingTwip, after: 60 },
          });
        }

        if (cl.type === "pedido") {
          return new Paragraph({
            children: [new TextRun({
              text: cleanText.toLowerCase(),
              bold: true, size: halfPt, font: "Arial",
            })],
            alignment: AlignmentType.JUSTIFIED,
            indent: { firstLine: indentTwip },
            spacing: { line: lineSpacingTwip, after: 60 },
          });
        }

        if (cl.type === "fecho") {
          return new Paragraph({
            children: [new TextRun({ text: cleanText, size: halfPt, font: "Arial" })],
            alignment: AlignmentType.CENTER,
            spacing: { line: lineSpacingTwip, before: 240, after: 60 },
          });
        }

        // body — detecta trechos **negrito**
        const rawLine = line.trim();
        const parts = rawLine.replace(/^#{1,6}\s/, "").split(/(\*\*.*?\*\*)/g);
        const runs = parts.map(p => {
          if (p.startsWith("**") && p.endsWith("**")) {
            return new TextRun({ text: p.slice(2, -2), bold: true, size: halfPt, font: "Arial" });
          }
          return new TextRun({ text: p, size: halfPt, font: "Arial" });
        });

        return new Paragraph({
          children: runs,
          alignment: AlignmentType.JUSTIFIED,
          indent: { firstLine: indentTwip },
          spacing: { line: lineSpacingTwip, after: 60 },
        });
      });

      // Cabeçalho DOCX
      let headerChildren = [];
      if (fmt.logoUrl) {
        try {
          const logoData = await loadImage(fmt.logoUrl);
          const resp = await fetch(fmt.logoUrl);
          const buf = await resp.arrayBuffer();
          const maxLogoW = cm2twip(8);
          const ratio = logoData.width / logoData.height;
          const logoH = Math.round(maxLogoW / ratio);
          headerChildren = [new Paragraph({
            children: [new ImageRun({
              data: buf,
              transformation: {
                width: Math.round(maxLogoW / 914400 * 12700 * 72),
                height: Math.round(logoH / 914400 * 12700 * 72),
              },
            })],
            alignment: AlignmentType.CENTER,
          })];
        } catch (_) {}
      }

      // Rodapé DOCX
      let footerChildren = [];
      if (fmt.footerImageUrl) {
        try {
          const resp = await fetch(fmt.footerImageUrl);
          const buf = await resp.arrayBuffer();
          const footerImgData = await loadImage(fmt.footerImageUrl);
          const pageW = cm2twip(21 - fmt.marginLeft - fmt.marginRight);
          const ratio = footerImgData.width / footerImgData.height;
          const wEmu = Math.round(pageW * 635);
          const hEmu = Math.round(wEmu / ratio);
          footerChildren = [new Paragraph({
            children: [new ImageRun({
              data: buf,
              transformation: { width: Math.round(wEmu / 9144), height: Math.round(hEmu / 9144) },
            })],
            alignment: AlignmentType.CENTER,
          })];
        } catch (_) {
          if (fmt.footerText) {
            footerChildren = fmt.footerText.split("\n").map(l =>
              new Paragraph({ children: [new TextRun({ text: l, size: 20, font: "Arial" })], alignment: AlignmentType.CENTER })
            );
          }
        }
      } else if (fmt.footerText) {
        footerChildren = fmt.footerText.split("\n").map(l =>
          new Paragraph({ children: [new TextRun({ text: l, size: 20, font: "Arial" })], alignment: AlignmentType.CENTER })
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