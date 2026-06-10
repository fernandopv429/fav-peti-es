/**
 * Montagem do DOCX no padrão FAV — idêntico para Vigilante e todos os demais modelos.
 * Usado por ExportButtons. Recebe o texto bruto (com marcadores __LOGO__ e __RODAPE_IMG__)
 * e o fmt (getPetitionFormat) e devolve um Blob DOCX pronto para download.
 */

const cm2twip = (v) => Math.round(v * 567);

/**
 * Classifica uma linha no padrão FAV (idêntico ao ExportButtons).
 */
function classifyLine(line) {
  const t = line.trim();
  if (!t) return { type: "empty" };
  if (t.startsWith("__LOGO__:")) return { type: "logo_marker", url: t.slice(9).trim() };
  if (t.startsWith("__RODAPE_IMG__:")) return { type: "rodape_img_marker", url: t.slice(15).trim() };
  if (t.startsWith("__CABECALHO__:")) return { type: "cabecalho_text", text: t.slice(14).trim() };
  if (t.startsWith(">")) return { type: "ementa", text: t.slice(1).trim() };
  if (/^(nestes termos|pede deferimento|e\.e\.d\.|termos em que|a\.e\.d\.)/i.test(t))
    return { type: "fecho", text: t };
  const noMd = t.replace(/\*\*/g, "").replace(/^#{1,6}\s/, "");
  if (noMd === noMd.toUpperCase() && noMd.length > 3 && !/^[a-z]/.test(noMd))
    return { type: "heading", text: noMd };
  if (/^[a-z]\)|^\d+\.\s|^[ivxlc]+\)/i.test(t.replace(/\*\*/g, "")))
    return { type: "pedido", text: noMd };
  const clean = t.replace(/\*\*(.*?)\*\*/g, "$1").replace(/^#{1,6}\s/, "");
  return { type: "body", text: clean, raw: t };
}

async function loadImageData(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!url.startsWith("data:")) img.crossOrigin = "anonymous";
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
}

async function urlToBuffer(url) {
  if (url.startsWith("data:")) {
    const b64 = url.split(",")[1];
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }
  const r = await fetch(url);
  return r.arrayBuffer();
}

/**
 * Monta e retorna o Blob do DOCX FAV.
 * @param {string} content — texto bruto da petição (com marcadores __LOGO__, __RODAPE_IMG__)
 * @param {object} fmt — retorno de getPetitionFormat(petitionConfig)
 * @param {string} title — título da petição (para nome do arquivo)
 */
export async function buildDocxFAV(content, fmt) {
  const {
    Document, Paragraph, TextRun, Packer,
    AlignmentType, Header, Footer, ImageRun, UnderlineType,
  } = await import("docx");

  const halfPt = 24; // 12pt × 2 (docx usa half-points)
  const lineSpacingTwip = Math.round(240 * 1.5); // entrelinhas 1,5
  const indentTwip = cm2twip(fmt.firstIndent ?? 3.0);
  const ementaIndentTwip = cm2twip(4.0);

  // ── Resolve logo e rodapé (URL ou marcador inline) ─────────────────────
  // Prioridade: fmt.logoUrl (do PetitionConfig) → marcador __LOGO__ no texto
  let resolvedLogoUrl = fmt.logoUrl || "";
  let resolvedFooterImgUrl = fmt.footerImageUrl || "";

  if (!resolvedLogoUrl || !resolvedFooterImgUrl) {
    for (const line of content.split("\n")) {
      const t = line.trim();
      if (!resolvedLogoUrl && t.startsWith("__LOGO__:")) resolvedLogoUrl = t.slice(9).trim();
      if (!resolvedFooterImgUrl && t.startsWith("__RODAPE_IMG__:")) resolvedFooterImgUrl = t.slice(15).trim();
    }
  }

  // ── Carrega imagens ────────────────────────────────────────────────────
  let logoData = null, logoBuffer = null;
  if (resolvedLogoUrl) {
    try {
      logoData = await loadImageData(resolvedLogoUrl);
      logoBuffer = await urlToBuffer(resolvedLogoUrl);
    } catch (_) {}
  }

  let footerImgData = null, footerImgBuffer = null;
  if (resolvedFooterImgUrl) {
    try {
      footerImgData = await loadImageData(resolvedFooterImgUrl);
      footerImgBuffer = await urlToBuffer(resolvedFooterImgUrl);
    } catch (_) {}
  }

  // ── Monta Header DOCX (logo + texto de cabeçalho) ─────────────────────
  const headerChildren = [];

  if (logoData && logoBuffer) {
    // Logo centralizado — largura máxima 8cm
    const maxLogoWEmu = cm2twip(8) * 635; // EMU
    const ratio = logoData.width / logoData.height;
    const logoWPx = Math.round(maxLogoWEmu / 914400 * 12700 * 72);
    const logoHPx = Math.round(logoWPx / ratio);
    headerChildren.push(new Paragraph({
      children: [new ImageRun({
        data: logoBuffer,
        transformation: { width: logoWPx, height: logoHPx },
      })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
    }));
  }

  // Texto de cabeçalho (cabecalho_texto do PetitionConfig) — centralizado, 10pt
  if (fmt.headerText) {
    for (const linha of fmt.headerText.split("\n")) {
      headerChildren.push(new Paragraph({
        children: [new TextRun({ text: linha, size: 20, font: "Arial" })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 0 },
      }));
    }
  }

  // Linha separadora após cabeçalho
  if (headerChildren.length > 0) {
    headerChildren.push(new Paragraph({
      border: { bottom: { style: "single", size: 6, color: "999999", space: 4 } },
      text: "",
      spacing: { after: 120 },
    }));
  }

  // ── Monta Footer DOCX ─────────────────────────────────────────────────
  const footerChildren = [];

  if (footerImgData && footerImgBuffer) {
    const pageW = cm2twip(21 - (fmt.marginLeft ?? 3) - (fmt.marginRight ?? 3));
    const ratio = footerImgData.width / footerImgData.height;
    const wEmu = Math.round(pageW * 635);
    const hEmu = Math.round(wEmu / ratio);
    footerChildren.push(new Paragraph({
      children: [new ImageRun({
        data: footerImgBuffer,
        transformation: { width: Math.round(wEmu / 9144), height: Math.round(hEmu / 9144) },
      })],
      alignment: AlignmentType.CENTER,
    }));
  } else if (fmt.footerText) {
    for (const l of fmt.footerText.split("\n")) {
      footerChildren.push(new Paragraph({
        children: [new TextRun({ text: l, size: 20, font: "Arial" })],
        alignment: AlignmentType.CENTER,
      }));
    }
  }

  // ── Monta parágrafos do corpo ──────────────────────────────────────────
  const bodyParagraphs = [];

  for (const line of content.split("\n")) {
    const cl = classifyLine(line);

    // Marcadores de imagem: já tratados via header/footer — pular no body
    if (cl.type === "logo_marker" || cl.type === "rodape_img_marker" || cl.type === "cabecalho_text") {
      continue;
    }

    if (cl.type === "empty") {
      bodyParagraphs.push(new Paragraph({
        text: "",
        spacing: { line: lineSpacingTwip, after: 0 },
      }));
      continue;
    }

    const cleanText = (cl.text || "").replace(/\*\*/g, "");

    if (cl.type === "heading") {
      bodyParagraphs.push(new Paragraph({
        children: [new TextRun({
          text: cleanText.toUpperCase(),
          bold: true,
          underline: { type: UnderlineType.SINGLE },
          size: halfPt,
          font: "Arial",
        })],
        alignment: AlignmentType.CENTER,
        spacing: { line: lineSpacingTwip, before: 240, after: 120 },
      }));
      continue;
    }

    if (cl.type === "ementa") {
      bodyParagraphs.push(new Paragraph({
        children: [new TextRun({ text: cleanText, size: halfPt, font: "Arial" })],
        alignment: AlignmentType.JUSTIFIED,
        indent: { left: ementaIndentTwip },
        spacing: { line: lineSpacingTwip, after: 60 },
      }));
      continue;
    }

    if (cl.type === "pedido") {
      bodyParagraphs.push(new Paragraph({
        children: [new TextRun({
          text: cleanText.toLowerCase(),
          bold: true,
          size: halfPt,
          font: "Arial",
        })],
        alignment: AlignmentType.JUSTIFIED,
        indent: { firstLine: indentTwip },
        spacing: { line: lineSpacingTwip, after: 60 },
      }));
      continue;
    }

    if (cl.type === "fecho") {
      bodyParagraphs.push(new Paragraph({
        children: [new TextRun({ text: cleanText, size: halfPt, font: "Arial" })],
        alignment: AlignmentType.CENTER,
        spacing: { line: lineSpacingTwip, before: 240, after: 60 },
      }));
      continue;
    }

    // body — preserva trechos **negrito**
    const rawLine = line.trim().replace(/^#{1,6}\s/, "");
    const parts = rawLine.split(/(\*\*.*?\*\*)/g);
    const runs = parts.map(p => {
      if (p.startsWith("**") && p.endsWith("**")) {
        return new TextRun({ text: p.slice(2, -2), bold: true, size: halfPt, font: "Arial" });
      }
      return new TextRun({ text: p, size: halfPt, font: "Arial" });
    });

    bodyParagraphs.push(new Paragraph({
      children: runs,
      alignment: AlignmentType.JUSTIFIED,
      indent: { firstLine: indentTwip },
      spacing: { line: lineSpacingTwip, after: 60 },
    }));
  }

  // ── Monta o Document ──────────────────────────────────────────────────
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top:    cm2twip(fmt.marginTop    ?? 3.5),
            bottom: cm2twip(fmt.marginBottom ?? 1.8),
            left:   cm2twip(fmt.marginLeft   ?? 3.0),
            right:  cm2twip(fmt.marginRight  ?? 3.0),
            header: cm2twip(1.25),
            footer: cm2twip(1.25),
          },
          size: { width: cm2twip(21), height: cm2twip(29.7) },
        },
      },
      headers: headerChildren.length ? { default: new Header({ children: headerChildren }) } : undefined,
      footers: footerChildren.length ? { default: new Footer({ children: footerChildren }) } : undefined,
      children: bodyParagraphs,
    }],
  });

  return Packer.toBlob(doc);
}