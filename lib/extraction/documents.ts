/**
 * Turning an uploaded file into content blocks for the model (brief §4b, step 2).
 *
 * A certificate arrives as one of three things: a PDF with a real text layer, a scanned
 * PDF, or a photograph of a printout. The first is read directly, which is fast, cheap,
 * and exact. The other two go to the model as the document or image itself — Claude reads
 * the pages with vision, which keeps a rasterizer and its native dependencies out of a
 * serverless deployment.
 */
import type Anthropic from '@anthropic-ai/sdk';

/** Anthropic caps a request at 32 MB; stay well under it and fail loudly if we can't. */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

/** Below this many characters a "text layer" is really just page furniture. */
const MIN_TEXT_LAYER_CHARS = 200;

export type DocumentKind = 'pdf_text_layer' | 'pdf_scanned' | 'image';

export interface PreparedDocument {
  readonly kind: DocumentKind;
  readonly blocks: Anthropic.ContentBlockParam[];
  /** Present when the text layer was used, for the audit trail. */
  readonly extractedText: string | null;
  readonly pageCount: number | null;
}

const IMAGE_MEDIA_TYPES: Readonly<Record<string, Anthropic.Base64ImageSource['media_type']>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

export function mediaTypeForFilename(
  filename: string,
): Anthropic.Base64ImageSource['media_type'] | 'application/pdf' | null {
  const extension = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase();
  if (extension === 'pdf') return 'application/pdf';
  return IMAGE_MEDIA_TYPES[extension] ?? null;
}

export async function prepareDocument(
  file: Uint8Array,
  filename: string,
): Promise<PreparedDocument> {
  if (file.byteLength > MAX_DOCUMENT_BYTES) {
    throw new Error(
      `${filename} is ${(file.byteLength / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB`,
    );
  }

  const mediaType = mediaTypeForFilename(filename);
  if (mediaType === null) {
    throw new Error(`${filename} is not a PDF or an image`);
  }

  const base64 = Buffer.from(file).toString('base64');

  if (mediaType !== 'application/pdf') {
    return {
      kind: 'image',
      blocks: [{ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } }],
      extractedText: null,
      pageCount: null,
    };
  }

  const layer = await readTextLayer(file);
  if (layer !== null && layer.text.trim().length >= MIN_TEXT_LAYER_CHARS) {
    return {
      kind: 'pdf_text_layer',
      blocks: [
        {
          type: 'text',
          text: `Certificate text extracted from ${filename}:\n\n${layer.text.trim()}`,
        },
      ],
      extractedText: layer.text.trim(),
      pageCount: layer.pageCount,
    };
  }

  return {
    kind: 'pdf_scanned',
    blocks: [
      {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: base64 },
      },
    ],
    extractedText: null,
    pageCount: layer?.pageCount ?? null,
  };
}

async function readTextLayer(
  file: Uint8Array,
): Promise<{ text: string; pageCount: number } | null> {
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: file });
    try {
      const result = await parser.getText();
      return { text: result.text ?? '', pageCount: result.pages?.length ?? 0 };
    } finally {
      await parser.destroy?.();
    }
  } catch {
    // A PDF we cannot open for text is still a PDF the model can look at.
    return null;
  }
}
