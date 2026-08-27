"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { sourceDocuments, sourceChunks } from "@/db/schema";
import { withParentContext } from "@/db";
import { requireParentModeUnlocked } from "@/lib/data/dal";
import { extractDigitalText, looksScanned, transcribeScannedPdf } from "@/lib/rag/pdf-extract";
import { embedTexts } from "@/lib/rag/embeddings";
import { MAX_UPLOAD_BYTES } from "@/lib/rag/limits";

const DocumentMetaSchema = z.object({
  title: z.string().trim().min(1).max(200),
  grade: z.union([z.literal(2), z.literal(4)]),
  subject: z.enum(["math", "reading"]),
  domain: z.string().trim().max(64).optional(),
});

export interface ImportSourceDocumentResult {
  id: string;
  pageCount: number;
  chunkCount: number;
  embeddedChunkCount: number;
  usedOcrFallback: boolean;
}

/**
 * Shared second half of the pipeline (docs/architecture/rag-content-pipeline.md,
 * Stage 2) once we have raw PDF bytes in hand, regardless of where they came
 * from: extracts per-page text (falling back to Claude transcription for
 * scanned PDFs), embeds each page via Voyage, and stores it all as a new
 * source_documents + source_chunks row set. Does NOT generate any
 * math_items/reading_passages content itself — that's Stage 3.
 */
async function storePdfAsSourceDocument(
  parentId: string,
  bytes: Uint8Array,
  meta: z.infer<typeof DocumentMetaSchema> & { driveFileId: string | null; source: "drive" | "upload" }
): Promise<ImportSourceDocumentResult> {
  let pages = await extractDigitalText(bytes);
  let usedOcrFallback = false;
  if (looksScanned(pages)) {
    pages = await transcribeScannedPdf(bytes, pages.length);
    usedOcrFallback = true;
  }

  // Drop genuinely blank pages (cover pages, section dividers) rather than
  // storing empty chunks that would just be embedding + retrieval noise.
  const nonEmptyPages = pages.filter((p) => p.text.length > 0);

  const embeddings = await embedTexts(nonEmptyPages.map((p) => p.text));

  const result = await withParentContext(parentId, async (tx) => {
    const [doc] = await tx
      .insert(sourceDocuments)
      .values({
        parentId,
        driveFileId: meta.driveFileId,
        source: meta.source,
        title: meta.title,
        grade: meta.grade,
        subject: meta.subject,
        domain: meta.domain || null,
        pageCount: pages.length,
      })
      .returning({ id: sourceDocuments.id });

    if (nonEmptyPages.length > 0) {
      await tx.insert(sourceChunks).values(
        nonEmptyPages.map((p, i) => ({
          sourceDocumentId: doc.id,
          pageRange: String(p.page),
          text: p.text,
          embedding: embeddings[i],
        }))
      );
    }

    return doc;
  });

  return {
    id: result.id,
    pageCount: pages.length,
    chunkCount: nonEmptyPages.length,
    embeddedChunkCount: embeddings.filter((e) => e !== null).length,
    usedOcrFallback,
  };
}

const ImportSourceDocumentSchema = DocumentMetaSchema.extend({
  driveFileId: z.string().trim().min(1),
  // The Google Drive access token from the client-side Picker/token-client
  // flow (drive.file scope — see docs/architecture/rag-content-pipeline.md).
  // Used once, synchronously, to download this one file, then discarded —
  // never stored, and short-lived by design (Google issues these for ~1hr).
  accessToken: z.string().trim().min(1),
});

export type ImportSourceDocumentInput = z.infer<typeof ImportSourceDocumentSchema>;

/** Downloads one Drive-picked PDF, then hands off to the shared pipeline above. */
export async function importSourceDocument(input: ImportSourceDocumentInput): Promise<ImportSourceDocumentResult> {
  const parentId = await requireParentModeUnlocked();
  const parsed = ImportSourceDocumentSchema.parse(input);

  const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(parsed.driveFileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${parsed.accessToken}` },
  });
  if (!driveRes.ok) {
    const body = await driveRes.text().catch(() => "");
    throw new Error(`Couldn't download that file from Drive (${driveRes.status}). ${body.slice(0, 300)}`);
  }
  const bytes = new Uint8Array(await driveRes.arrayBuffer());

  return storePdfAsSourceDocument(parentId, bytes, {
    title: parsed.title,
    grade: parsed.grade,
    subject: parsed.subject,
    domain: parsed.domain,
    driveFileId: parsed.driveFileId,
    source: "drive",
  });
}

/**
 * Imports a PDF uploaded straight from the parent's own computer (drag-and-
 * drop or a file/folder browse — see pdf-import-panel.tsx), rather than
 * picked from Google Drive. One call per file; the panel loops over however
 * many files a drop or folder selection produced.
 */
export async function importUploadedSourceDocument(formData: FormData): Promise<ImportSourceDocumentResult> {
  const parentId = await requireParentModeUnlocked();

  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("No file received.");
  }
  if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error(`"${file.name}" isn't a PDF.`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)}MB — uploads are limited to 4MB each.`);
  }

  const parsed = DocumentMetaSchema.parse({
    title: (formData.get("title") as string | null)?.trim() || file.name.replace(/\.pdf$/i, ""),
    grade: Number(formData.get("grade")),
    subject: formData.get("subject"),
    domain: (formData.get("domain") as string | null) ?? undefined,
  });

  const bytes = new Uint8Array(await file.arrayBuffer());

  return storePdfAsSourceDocument(parentId, bytes, {
    ...parsed,
    driveFileId: null,
    source: "upload",
  });
}

/** Removes an imported PDF and all its chunks (cascade). Never touches math_items/reading_passages. */
export async function deleteSourceDocument(id: string): Promise<void> {
  const parentId = await requireParentModeUnlocked();
  await withParentContext(parentId, (tx) => tx.delete(sourceDocuments).where(eq(sourceDocuments.id, id)));
}
