import { aiService } from "./ai.js";

export interface ParsedDocument {
  text: string;
  method: "text" | "pdf" | "docx" | "vision-ocr";
  pageCount?: number;
  wordCount: number;
}

export async function parseDocument(
  buffer: Buffer,
  mimeType: string,
  originalName: string,
): Promise<ParsedDocument> {
  const name = originalName.toLowerCase();

  // ── Plain text / RTF ──────────────────────────────────────────────────────
  if (
    mimeType === "text/plain" ||
    mimeType === "text/rtf" ||
    name.endsWith(".txt") ||
    name.endsWith(".rtf")
  ) {
    const text = buffer.toString("utf-8");
    return { text, method: "text", wordCount: wordCount(text) };
  }

  // ── PDF ───────────────────────────────────────────────────────────────────
  if (mimeType === "application/pdf" || name.endsWith(".pdf")) {
    try {
      // pdf-parse uses CJS internals; the lib/ path avoids the test file issue
      const pdfParse = (await import("pdf-parse/lib/pdf-parse.js" as string)).default as
        (buf: Buffer) => Promise<{ text: string; numpages: number }>;
      const data = await pdfParse(buffer);
      return { text: data.text, method: "pdf", pageCount: data.numpages, wordCount: wordCount(data.text) };
    } catch (err) {
      throw new Error(`PDF extraction failed: ${(err as Error).message}`);
    }
  }

  // ── DOCX / DOC ────────────────────────────────────────────────────────────
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword" ||
    name.endsWith(".docx") ||
    name.endsWith(".doc")
  ) {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return { text: result.value, method: "docx", wordCount: wordCount(result.value) };
    } catch (err) {
      throw new Error(`DOCX extraction failed: ${(err as Error).message}`);
    }
  }

  // ── Images (OCR via Claude Vision) ───────────────────────────────────────
  if (
    mimeType.startsWith("image/") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".png") ||
    name.endsWith(".heic") ||
    name.endsWith(".webp")
  ) {
    if (!aiService.isConfigured()) {
      throw new Error(
        "Claude API key required to extract text from images. Connect Claude in your profile settings.",
      );
    }
    // HEIC can't be sent directly to Claude — surface a clear message
    if (name.endsWith(".heic")) {
      throw new Error(
        "HEIC images must be converted to JPEG or PNG before upload. Use your phone's share → save as JPEG option.",
      );
    }
    const { data: text } = await aiService.ocrImage(buffer, mimeType);
    return { text, method: "vision-ocr", wordCount: wordCount(text) };
  }

  throw new Error(
    `Unsupported file type: ${mimeType}. Supported formats: PDF, DOCX, TXT, RTF, JPG, PNG.`,
  );
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
