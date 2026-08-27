"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Sparkles, Check, X, Loader2 } from "lucide-react";
import { generateDraftsFromChunks, reviewContentDraft } from "@/lib/actions/content-drafts";
import type { SourceDocumentSummary } from "@/components/parent/pdf-import-panel";

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
 * a "Generate draft questions" trigger over an already-imported PDF, plus
 * the review queue that follows — approve copies a draft into the family's
 * live math/reading bank, discard throws it away. Nothing generated here is
 * ever visible to a kid until a parent explicitly approves it.
 */
export function DraftReviewPanel({ documents, drafts }: { documents: SourceDocumentSummary[]; drafts: ContentDraftSummary[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const eligibleDocs = documents.filter((d) => d.chunkCount > 0);
  const [sourceDocumentId, setSourceDocumentId] = useState(eligibleDocs[0]?.id ?? "");
  const [count, setCount] = useState("5");
  const [topic, setTopic] = useState("");
  const [genError, setGenError] = useState<string | null>(null);
  const [genMessage, setGenMessage] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const pending = drafts.filter((d) => d.status === "pending");
  const currentDoc = eligibleDocs.find((d) => d.id === sourceDocumentId) ?? eligibleDocs[0];

  function generate() {
    setGenError(null);
    setGenMessage(null);
    if (!sourceDocumentId) {
      setGenError("Import a PDF first, then generate drafts from it.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await generateDraftsFromChunks({ sourceDocumentId, count: Number(count), topic: topic.trim() || undefined });
        setGenMessage(`Generated ${result.created} draft${result.created === 1 ? "" : "s"} — review ${result.created === 1 ? "it" : "them"} below.`);
        router.refresh();
      } catch (err) {
        setGenError(err instanceof Error ? err.message : "Couldn't generate drafts — please try again.");
      }
    });
  }

  function review(id: string, action: "approve" | "discard") {
    setReviewingId(id);
    startTransition(async () => {
      try {
        await reviewContentDraft(id, action);
        router.refresh();
      } finally {
        setReviewingId(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h3 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold">
          <Sparkles className="h-4 w-4 text-amber" />
          Generate draft questions
        </h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Pick an imported PDF and Claude will draft new questions grounded in its content — nothing reaches your kids until you approve it below.
        </p>
        {eligibleDocs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Import a PDF above first — generation needs at least one chunked document.</p>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Label className="text-xs">Source PDF</Label>
                <Select value={sourceDocumentId} onValueChange={setSourceDocumentId}>
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
                <Label className="text-xs">How many</Label>
                <Select value={count} onValueChange={setCount}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[3, 5, 10].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Focus on a topic (optional)</Label>
              <Input className="mt-1" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. fractions word problems" />
              {currentDoc && currentDoc.embeddedChunkCount === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  This PDF isn&apos;t embedded yet, so a topic here won&apos;t narrow anything — generation will still use the document&apos;s first few pages.
                </p>
              )}
            </div>
            {genError && <p className="text-sm text-destructive">{genError}</p>}
            {genMessage && <p className="text-sm text-emerald-600 dark:text-emerald-400">{genMessage}</p>}
            <Button onClick={generate} disabled={isPending} className="gap-2">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {isPending ? "Generating…" : "Generate drafts"}
            </Button>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 font-display text-lg font-semibold">Review AI-generated content{pending.length > 0 ? ` (${pending.length})` : ""}</h3>
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
