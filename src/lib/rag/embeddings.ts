import "server-only";

// voyage-4-lite's output dimension — must match the `vector(1024)` column in
// src/db/schema.ts (sourceChunks.embedding) and migrations/0007_source_content.sql.
const DIMENSIONS = 1024;
const MODEL = "voyage-4-lite";

interface VoyageEmbeddingResponse {
  data: { embedding: number[]; index: number }[];
}

/**
 * Embeds a batch of chunk texts via Voyage AI (voyage-4-lite — see
 * docs/architecture/rag-content-pipeline.md for why Voyage over an
 * Anthropic-only stack: Claude doesn't offer an embeddings endpoint).
 *
 * Returns one entry per input text, in the same order, or `null` entries
 * across the board if VOYAGE_API_KEY isn't configured — this is a
 * deliberate graceful-degradation path, not an error: source_chunks.embedding
 * is nullable specifically so import can still succeed (tag-filtered
 * retrieval keeps working) before a Voyage key is ever set up, matching how
 * ANTHROPIC_API_KEY degrades in src/lib/ai/evaluate.ts.
 */
export async function embedTexts(texts: string[], inputType: "document" | "query" = "document"): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];

  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    console.warn("[rag/embeddings] VOYAGE_API_KEY not set — importing without embeddings (tag-filtered retrieval only until this is configured).");
    return texts.map(() => null);
  }

  try {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: texts,
        model: MODEL,
        input_type: inputType,
        output_dimension: DIMENSIONS,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Voyage API responded ${res.status}: ${body.slice(0, 500)}`);
    }

    const json = (await res.json()) as VoyageEmbeddingResponse;
    if (!Array.isArray(json.data)) {
      throw new Error("Unexpected Voyage API response shape (no data[] array)");
    }

    // Response entries carry their own `index` — sort back into request
    // order rather than assuming the array is already aligned.
    const byIndex = new Map(json.data.map((d) => [d.index, d.embedding]));
    return texts.map((_, i) => byIndex.get(i) ?? null);
  } catch (err) {
    console.error("[rag/embeddings] Voyage embedding call failed — continuing without embeddings for this import:", err);
    return texts.map(() => null);
  }
}

/**
 * Embeds one search string with Voyage's "query" input_type — Voyage
 * recommends the asymmetric document/query pair for retrieval rather than
 * embedding both sides the same way (see embedTexts, used on the storage
 * side). Used by generateDraftsFromChunks to rank a document's chunks by
 * relevance to a parent-typed topic. Null under the same degradation
 * conditions as embedTexts (no key configured, or the call fails).
 */
export async function embedQuery(text: string): Promise<number[] | null> {
  const [result] = await embedTexts([text], "query");
  return result ?? null;
}
