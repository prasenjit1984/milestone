"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { domainLabels, topicLabels, topicsFor } from "@/lib/domains";
import { addMathQuestion } from "@/lib/actions/content";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PlusCircle, Check, Upload, Sparkles, PencilLine } from "lucide-react";
import { PdfImportPanel, type SourceDocumentSummary } from "@/components/parent/pdf-import-panel";
import { DraftReviewPanel, type ContentDraftSummary } from "@/components/parent/draft-review-panel";

export interface OwnMathItem {
  id: string;
  grade: number;
  domain: string;
  topic: string;
  code: string;
  difficulty: number;
  prompt: string;
  createdAt: string;
}

type MathDomain = "NR" | "PAR" | "MDR" | "GSR";
const DOMAINS: MathDomain[] = ["NR", "PAR", "MDR", "GSR"];
const NEW_TOPIC = "__new__";

export function ContentTab({
  ownMathItems,
  sourceDocuments,
  contentDrafts,
  nonce,
}: {
  ownMathItems: OwnMathItem[];
  sourceDocuments: SourceDocumentSummary[];
  contentDrafts: ContentDraftSummary[];
  nonce?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [grade, setGrade] = useState("2");
  const [domain, setDomain] = useState<MathDomain>("NR");
  const [difficulty, setDifficulty] = useState("3");
  const [prompt, setPrompt] = useState("");
  const [choices, setChoices] = useState(["", "", "", ""]);
  const [answerIndex, setAnswerIndex] = useState("0");
  const [explanation, setExplanation] = useState("");
  const [justAdded, setJustAdded] = useState(false);
  const [topicChoice, setTopicChoice] = useState<string>("");
  const [newTopicName, setNewTopicName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const availableTopics = useMemo(
    () => topicsFor(ownMathItems as unknown as Parameters<typeof topicsFor>[0], Number(grade), domain),
    [ownMathItems, grade, domain]
  );
  const effectiveTopicChoice = topicChoice || availableTopics[0]?.id || NEW_TOPIC;

  function reset() {
    setPrompt("");
    setChoices(["", "", "", ""]);
    setAnswerIndex("0");
    setExplanation("");
    setTopicChoice("");
    setNewTopicName("");
  }

  function submit() {
    setError(null);
    const topic = effectiveTopicChoice === NEW_TOPIC ? newTopicName.trim() : effectiveTopicChoice;
    if (!prompt.trim() || choices.some((c) => !c.trim()) || !topic) {
      setError("Fill in the question, all four choices, and a topic before adding.");
      return;
    }
    startTransition(async () => {
      try {
        await addMathQuestion({
          grade: Number(grade) as 2 | 4,
          domain,
          topic,
          difficulty: Number(difficulty),
          prompt: prompt.trim(),
          choices: choices.map((c) => c.trim()),
          answerIndex: Number(answerIndex),
          explanation: explanation.trim() || undefined,
        });
        reset();
        setJustAdded(true);
        setTimeout(() => setJustAdded(false), 2500);
        router.refresh();
      } catch {
        setError("Couldn't add that question — please try again.");
      }
    });
  }

  const bankForDomain = ownMathItems.filter((i) => i.domain === domain && i.grade === Number(grade));

  return (
    <Tabs defaultValue="import" className="w-full">
      <TabsList className="mb-6 inline-flex w-auto justify-start gap-1 bg-secondary/60 p-1">
        <TabsTrigger value="import" className="gap-1.5">
          <Upload className="h-3.5 w-3.5" />
          Import
        </TabsTrigger>
        <TabsTrigger value="generate" className="gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          Generate questions
        </TabsTrigger>
        <TabsTrigger value="manual" className="gap-1.5">
          <PencilLine className="h-3.5 w-3.5" />
          Add manually
        </TabsTrigger>
      </TabsList>

      <TabsContent value="import">
        <PdfImportPanel documents={sourceDocuments} nonce={nonce} />
      </TabsContent>

      <TabsContent value="generate">
        <DraftReviewPanel documents={sourceDocuments} drafts={contentDrafts} />
      </TabsContent>

      <TabsContent value="manual" className="space-y-8">
      <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="mb-4 font-display text-lg font-semibold">Add a question manually</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Grade</Label>
              <Select
                value={grade}
                onValueChange={(v) => {
                  setGrade(v);
                  setTopicChoice("");
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">Grade 2</SelectItem>
                  <SelectItem value="4">Grade 4</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Domain</Label>
              <Select
                value={domain}
                onValueChange={(v) => {
                  setDomain(v as MathDomain);
                  setTopicChoice("");
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOMAINS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Difficulty</Label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Topic</Label>
              <Select value={effectiveTopicChoice} onValueChange={setTopicChoice}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableTopics.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                    </SelectItem>
                  ))}
                  <SelectItem value={NEW_TOPIC}>+ New topic…</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {effectiveTopicChoice === NEW_TOPIC && (
              <div>
                <Label className="text-xs">New topic name</Label>
                <Input className="mt-1" value={newTopicName} onChange={(e) => setNewTopicName(e.target.value)} placeholder="e.g. Skip counting" />
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs">Question</Label>
            <Textarea className="mt-1" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} placeholder="e.g. What is 6 × 7?" />
          </div>

          <div>
            <Label className="text-xs">Answer choices — mark the correct one</Label>
            <div className="mt-1 space-y-2">
              {choices.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAnswerIndex(String(i))}
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm ${
                      Number(answerIndex) === i ? "border-math bg-math text-white" : "border-border text-muted-foreground"
                    }`}
                    aria-label={`Mark choice ${i + 1} correct`}
                  >
                    {Number(answerIndex) === i ? <Check className="h-4 w-4" /> : i + 1}
                  </button>
                  <Input
                    value={c}
                    onChange={(e) => setChoices((prev) => prev.map((x, idx) => (idx === i ? e.target.value : x)))}
                    placeholder={`Choice ${i + 1}`}
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs">Explanation (optional)</Label>
            <Textarea className="mt-1" value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={2} placeholder="Shown after the kid answers" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button onClick={submit} disabled={isPending} className="w-full gap-2 bg-math text-white hover:bg-math/90">
            <PlusCircle className="h-4 w-4" />
            {justAdded ? "Added!" : isPending ? "Adding…" : "Add question"}
          </Button>
        </div>
      </div>

      <div>
        <h3 className="mb-4 font-display text-lg font-semibold">
          Your question bank — Grade {grade}, {domainLabels[domain]}
        </h3>
        <div className="space-y-2">
          {bankForDomain.map((item) => (
            <div key={item.id} className="rounded-xl border border-border bg-card p-3 text-sm shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono-num text-xs text-muted-foreground">{item.code}</span>
                <span className="font-mono-num text-xs text-muted-foreground">Difficulty {item.difficulty}</span>
              </div>
              <p className="mt-1">{item.prompt}</p>
              <p className="mt-1 text-xs text-muted-foreground">{topicLabels[item.topic] ?? item.topic}</p>
            </div>
          ))}
          {bankForDomain.length === 0 && <p className="text-sm text-muted-foreground">No custom questions in this domain yet — the shared question bank is still used for practice.</p>}
        </div>
      </div>
      </div>
      </TabsContent>
    </Tabs>
  );
}
