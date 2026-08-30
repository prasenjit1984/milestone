"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Sparkles, Check, X, Loader2, ListChecks, RefreshCw } from "lucide-react";
import { generateDraftsFromTopics, reviewContentDraft } from "@/lib/actions/content-drafts";
import { extractTopicsForDocument } from "@/lib/actions/source-topics";
import type { SourceDocumentSummary } from "@/components/parent/pdf-import-panel";

export interface SourceTopicSummary {
  id: string;
  sourceDocumentId: string;
  label: string;
  description: string;
  pageRanges: string[];
}

export interface ContentDraftSummary {
  id: string;
  kind: string; // 'math_item' | 'reading_passage'
  payload: Record<string, unknown>;
  status: string;
  citedPages: string[];
  sourceTitle: string | null;
  createdAt: string;
}

/**
 * Stage 3 of the PDF pipeline (docs/architecture/rag-content-pipeline.md):
 * a parent picks an imported PDF, finds (or re-finds) its extracted "table
 * of contents" — the distinct topics/scenarios it actually covers, via
 * extractTopicsForDocument — selects one or more, and generates draft
 * questions grounded specifically in those topics' own pages. Below that,
 * the review queue: approve copies a draft into the family's live math/
 * reading bank, discard throws it away. Nothing generated here is ever
 * visible to a kid until a parent explicitly approves it.
 */
export function DraftReviewPanel({
  documents,
  topics,
  drafts,
}: {
  documents: SourceDocumentSummary[];
  topics: SourceTopicSummary[];
  drafts: ContentDraftSummary[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [extractPending, startExtractTransition] = useTransition();
  const eligibleDocs = documents.filter((d) => d.chunkCount > 0);
  const [sourceDocumentId, setSourceDocumentId] = useState(eligibleDocs[0]?.id ?? "");
  const [count, setCount] = useState("6");
  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(new Set());
  const [extractError, setExtractError] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [genMessage, setGenMessage] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const pending = drafts.filter((d) => d.status === "pending");
  const topicsForDoc = topics.filter((t) => t.sourceDocumentId === sourceDocumentId);

  // A different document's topic list has nothing to do with whatever was
  // selected before — drop the selection and any stale error right when the
  // source PDF changes (in the handler, not an effect — see the Select below).
  function selectDocument(id: string) {
    setSourceDocumentId(id);
    setSelectedTopicIds(new Set());
    setExtractError(null);
    setGenError(null);
    setGenMessage(null);
  }

  function toggleTopic(id: string) {
    setSelectedTopicIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function findTopics(force: boolean) {
    if (!sourceDocumentId) return;
    setExtractError(null);
    startExtractTransition(async () => {
      const result = await extractTopicsForDocument(sourceDocumentId, { force });
      if (result.error) {
        setExtractError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function generate() {
    setGenError(null);
    setGenMessage(null);
    if (!sourceDocumentId) {
      setGenError("Import a PDF first, then generate drafts from it.");
      return;
    }
    if (selectedTopicIds.size === 0) {
      setGenError("Pick at least one topic below to generate from.");
      return;
    }
    startTransition(async () => {
      const result = await generateDraftsFromTopics({ sourceDocumentId, topicIds: Array.from(selectedTopicIds), count: Number(count) });
      if (result.error) {
        setGenError(result.error);
        return;
      }
      setGenMessage(`Generated ${result.created} draft${result.created === 1 ? "" : "s"} — review ${result.created === 1 ? "it" : "them"} below.`);
      router.refresh();
    });
  }

  function review(id: string, action: "approve" | "discard") {
    setReviewingId(id);
    setReviewError(null);
    startTransition(async () => {
      try {
        const result = await reviewContentDraft(id, action);
        if (result.error) {
          setReviewError(result.error);
          return;
        }
        router.refresh();
      } finally {
        setReviewingId(null);
      }
    });
  }

  const perTopicHint =
    selectedTopicIds.size > 0 ? `~${Math.max(1, Math.round(Number(count) / selectedTopicIds.size))} per topic` : null;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h3 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold">
          <Sparkles className="h-4 w-4 text-amber" />
          Generate draft questions
        </h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Pick an imported PDF, find the topics it covers, and Claude will draft new questions grounded in those specific pages — nothing reaches your
          kids until you approve it below.
        </p>
        {eligibleDocs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Import a PDF above first — generation needs at least one chunked document.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Label className="text-xs">Source PDF</Label>
                <Select value={sourceDocumentId} onValueChange={selectDocument}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleDocs.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.title} · Grade {d.grade} · {d.subject === "math" ? "Math" : "Reading"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Total questions</Label>
                <Select value={count} onValueChange={setCount}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[3, 6, 10, 20].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {perTopicHint && <p className="mt-1 text-xs text-muted-foreground">{perTopicHint}</p>}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label className="flex items-center gap-1.5 text-xs">
                  <ListChecks className="h-3.5 w-3.5" />
                  Topics in this PDF
                </Label>
                {topicsForDoc.length > 0 && (
                  <button
                    type="button"
                    onClick={() => findTopics(true)}
                    disabled={extractPending}
                    className="flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3 w-3 ${extractPending ? "animate-spin" : ""}`} />
                    Re-scan
                  </button>
                )}
              </div>

              {topicsForDoc.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-4 text-center">
                  {extractError && <p className="mb-2 text-sm text-destructive">{extractError}</p>}
                  <p className="mb-3 text-sm text-muted-foreground">
                    Scan this PDF once to list the scenarios it covers — like a table of contents — so you can generate from a specific one instead of
                    the whole document.
                  </p>
                  <Button size="sm" variant="outline" onClick={() => findTopics(false)} disabled={extractPending} className="gap-2">
                    {extractPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListChecks className="h-3.5 w-3.5" />}
                    {extractPending ? "Finding topics…" : "Find topics in this PDF"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {extractError && <p className="text-sm text-destructive">{extractError}</p>}
                  {topicsForDoc.map((t) => {
                    const selected = selectedTopicIds.has(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleTopic(t.id)}
                        className={`flex w-full items-start gap-2 rounded-xl border px-3 py-2 text-left text-sm transition ${
                          selected ? "border-amber bg-amber-soft" : "border-border bg-card hover:bg-secondary"
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            selected ? "border-amber bg-amber text-white" : "border-border"
                          }`}
                        >
                          {selected && <Check className="h-3 w-3" />}
                        </span>
                        <span>
                          <span className="font-medium">{t.label}</span>
                          <span className="block text-xs text-muted-foreground">
                            {t.description}
                            {t.pageRanges.length > 0 ? ` — page${t.pageRanges.length === 1 ? "" : "s"} ${t.pageRanges.join(", ")}` : ""}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {genError && <p className="text-sm text-destructive">{genError}</p>}
            {genMessage && <p className="text-sm text-emerald-600 dark:text-emerald-400">{genMessage}</p>}
            <Button onClick={generate} disabled={isPending || topicsForDoc.length === 0} className="gap-2">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {isPending ? "Generating…" : "Generate drafts"}
            </Button>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 font-display text-lg font-semibold">Review AI-generated content{pending.length > 0 ? ` (${pending.length})` : ""}</h3>
        {reviewError && <p className="mb-3 text-sm text-destructive">{reviewError}</p>}
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">No drafts waiting for review.</p>
        ) : (
          <div className="space-y-3">
            {pending.map((d) => (
              <DraftCard key={d.id} draft={d} busy={isPending && reviewingId === d.id} onReview={(action) => review(d.id, action)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DraftCard({ draft, busy, onReview }: { draft: ContentDraftSummary; busy: boolean; onReview: (action: "approve" | "discard") => void }) {
  const p = draft.payload;
  const choices = Array.isArray(p.choices) ? (p.choices as string[]) : [];
  const mc = Array.isArray(p.mc) ? (p.mc as unknown[]) : [];
  const writing = Array.isArray(p.writing) ? (p.writing as unknown[]) : [];

  return (
    <div className="rounded-xl border border-border bg-card p-4 text-sm shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{draft.kind === "math_item" ? "Math" : "Reading"}</Badge>
        {draft.sourceTitle && (
          <span className="text-xs text-muted-foreground">
            from &quot;{draft.sourceTitle}&quot; — page{draft.citedPages.length === 1 ? "" : "s"} {draft.citedPages.join(", ")}
          </span>
        )}
      </div>

      {draft.kind === "math_item" ? (
        <div>
          <p className="font-medium">{String(p.prompt ?? "")}</p>
          <ul className="mt-2 space-y-1">
            {choices.map((c, i) => (
              <li
                key={i}
                className={`rounded-md px-2 py-1 ${
                  i === p.answerIndex ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"
                }`}
              >
                {i === p.answerIndex ? "✓ " : ""}
                {c}
              </li>
            ))}
          </ul>
          {p.explanation ? <p className="mt-2 text-xs text-muted-foreground">{String(p.explanation)}</p> : null}
          <p className="mt-2 text-xs text-muted-foreground">
            Grade {String(p.grade)} · {String(p.domain)} · {String(p.topic)} · Difficulty {String(p.difficulty)}
          </p>
        </div>
      ) : (
        <div>
          <p className="font-medium">{String(p.title ?? "")}</p>
          <p className="mt-1 line-clamp-3 text-muted-foreground">{String(p.body ?? "")}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Grade {String(p.grade)} · {String(p.kind)} · {mc.length} comprehension question{mc.length === 1 ? "" : "s"} · {writing.length} writing prompt
            {writing.length === 1 ? "" : "s"}
          </p>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={() => onReview("approve")} disabled={busy} className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600/90">
          <Check className="h-3.5 w-3.5" /> Approve
        </Button>
        <Button size="sm" variant="outline" onClick={() => onReview("discard")} disabled={busy} className="gap-1">
          <X className="h-3.5 w-3.5" /> Discard
        </Button>
      </div>
    </div>
  );
}
