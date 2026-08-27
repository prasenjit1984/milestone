"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { importSourceDocument, importUploadedSourceDocument, deleteSourceDocument } from "@/lib/actions/source-content";
import { MAX_UPLOAD_BYTES } from "@/lib/rag/limits";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { FileUp, Trash2, FileText, Sparkles, UploadCloud, FolderOpen, CheckCircle2, XCircle, Loader2 } from "lucide-react";

// Minimal ambient typing for the two Google browser globals this panel
// needs (gapi's Picker loader, and Google Identity Services' OAuth token
// client). Deliberately loose (`any`) rather than pulling in a full
// @google typings package for a handful of calls.
declare global {
  interface Window {
    gapi?: { load: (api: string, cb: () => void) => void };
    google?: {
      accounts: { oauth2: { initTokenClient: (config: Record<string, unknown>) => { requestAccessToken: () => void } } };
      picker: {
        PickerBuilder: new () => GooglePickerBuilder;
        DocsView: new () => GoogleDocsView;
        Action: { PICKED: string };
        Response: { DOCUMENTS: string };
        Document: { ID: string; NAME: string };
      };
    };
  }
}
interface GoogleDocsView {
  setMimeTypes: (types: string) => GoogleDocsView;
}
interface GooglePickerBuilder {
  setDeveloperKey: (key: string) => GooglePickerBuilder;
  setAppId: (appId: string) => GooglePickerBuilder;
  setOAuthToken: (token: string) => GooglePickerBuilder;
  addView: (view: GoogleDocsView) => GooglePickerBuilder;
  setCallback: (cb: (data: Record<string, unknown>) => void) => GooglePickerBuilder;
  build: () => { setVisible: (v: boolean) => void };
}

const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

const READING_TOPIC_OPTIONS = [
  { id: "fiction", label: "Fiction" },
  { id: "science", label: "Science" },
  { id: "geography", label: "Geography" },
  { id: "history", label: "History" },
  { id: "social-studies", label: "Social Studies" },
];
const MATH_DOMAIN_OPTIONS = [
  { id: "NR", label: "Numerical Reasoning" },
  { id: "PAR", label: "Patterning & Algebraic Reasoning" },
  { id: "MDR", label: "Measurement & Data Reasoning" },
  { id: "GSR", label: "Geometric & Spatial Reasoning" },
];

export interface SourceDocumentSummary {
  id: string;
  title: string;
  grade: number;
  subject: string;
  domain: string | null;
  source: string; // 'drive' | 'upload'
  pageCount: number;
  chunkCount: number;
  embeddedChunkCount: number;
  createdAt: string;
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

/**
 * Flattens whatever was dropped — loose files, or one or more folders — into
 * a plain list of PDF Files, recursing into subfolders via the File and
 * Directory Entries API. Falls back to the flat (non-recursive) FileList a
 * browser without that API still gives us on drop.
 */
async function collectDroppedPdfs(dataTransfer: DataTransfer): Promise<{ files: File[]; skipped: number }> {
  const items = dataTransfer.items;
  if (!items || items.length === 0 || !items[0]?.webkitGetAsEntry) {
    const all = Array.from(dataTransfer.files);
    const files = all.filter(isPdfFile);
    return { files, skipped: all.length - files.length };
  }

  const entries: FileSystemEntry[] = [];
  for (let i = 0; i < items.length; i++) {
    const entry = items[i].webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }

  const files: File[] = [];
  let skipped = 0;

  async function walk(entry: FileSystemEntry): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      if (isPdfFile(file)) files.push(file);
      else skipped += 1;
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const readNextBatch = () => new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      // readEntries must be called repeatedly until it returns an empty
      // array — a single call isn't guaranteed to return everything.
      let batch = await readNextBatch();
      while (batch.length > 0) {
        for (const child of batch) await walk(child);
        batch = await readNextBatch();
      }
    }
  }

  await Promise.all(entries.map(walk));
  return { files, skipped };
}

interface BatchItem {
  id: string;
  name: string;
  status: "importing" | "done" | "error";
  message?: string;
}

export function PdfImportPanel({ documents, nonce }: { documents: SourceDocumentSummary[]; nonce?: string }) {
  const router = useRouter();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const configured = Boolean(apiKey && clientId);

  const [scriptsReady, setScriptsReady] = useState({ gapi: false, gis: false });
  const [pickerReady, setPickerReady] = useState(false);
  const [grade, setGrade] = useState("2");
  const [subject, setSubject] = useState<"math" | "reading">("reading");
  const [domain, setDomain] = useState(READING_TOPIC_OPTIONS[0].id);
  const [status, setStatus] = useState<{ kind: "idle" | "importing" | "done" | "error"; message?: string }>({ kind: "idle" });
  const [batch, setBatch] = useState<BatchItem[]>([]);
  const [batchNote, setBatchNote] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const tokenClientRef = useRef<{ requestAccessToken: () => void } | null>(null);
  const pendingPickRef = useRef<{ grade: 2 | 4; subject: "math" | "reading"; domain: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const domainOptions = subject === "math" ? MATH_DOMAIN_OPTIONS : READING_TOPIC_OPTIONS;

  function selectSubject(next: "math" | "reading") {
    setSubject(next);
    setDomain((next === "math" ? MATH_DOMAIN_OPTIONS : READING_TOPIC_OPTIONS)[0].id);
  }

  const runImport = useCallback(
    (args: { driveFileId: string; accessToken: string; title: string; grade: 2 | 4; subject: "math" | "reading"; domain: string }) => {
      setStatus({ kind: "importing" });
      importSourceDocument(args)
        .then((result) => {
          setStatus({
            kind: "done",
            message: result.usedOcrFallback
              ? `Imported "${args.title}" — ${result.pageCount} pages transcribed (scanned PDF), ${result.chunkCount} chunks${result.embeddedChunkCount === 0 ? " (not yet embedded — set VOYAGE_API_KEY)" : ""}.`
              : `Imported "${args.title}" — ${result.pageCount} pages, ${result.chunkCount} chunks${result.embeddedChunkCount === 0 ? " (not yet embedded — set VOYAGE_API_KEY)" : ""}.`,
          });
          router.refresh();
        })
        .catch((err) => {
          setStatus({ kind: "error", message: err instanceof Error ? err.message : "Import failed — please try again." });
        });
    },
    [router]
  );

  const openPicker = useCallback(
    (accessToken: string, picked: { grade: 2 | 4; subject: "math" | "reading"; domain: string }) => {
      if (!window.google || !apiKey) return;
      // OAuth client IDs are minted as "<cloud-project-number>-<random>.apps.googleusercontent.com",
      // and setAppId wants that project number. Without it, the picker still
      // lets a parent browse and pick a file, but the drive.file scope grant
      // never actually attaches to that file — the later files.get download
      // 404s even though the token itself is valid.
      const appId = clientId?.split("-")[0];
      const view = new window.google.picker.DocsView().setMimeTypes("application/pdf");
      const picker = new window.google.picker.PickerBuilder()
        .setDeveloperKey(apiKey)
        .setAppId(appId ?? "")
        .setOAuthToken(accessToken)
        .addView(view)
        .setCallback((data) => {
          if (data.action !== window.google!.picker.Action.PICKED) return;
          const docs = data[window.google!.picker.Response.DOCUMENTS] as Record<string, string>[] | undefined;
          const file = docs?.[0];
          if (!file) return;
          const driveFileId = file[window.google!.picker.Document.ID];
          const title = file[window.google!.picker.Document.NAME];
          runImport({ driveFileId, accessToken, title, ...picked });
        })
        .build();
      picker.setVisible(true);
    },
    [apiKey, clientId, runImport]
  );

  useEffect(() => {
    if (!configured || !scriptsReady.gapi) return;
    window.gapi?.load("picker", () => setPickerReady(true));
  }, [configured, scriptsReady.gapi]);

  useEffect(() => {
    if (!configured || !scriptsReady.gis || !window.google) return;
    tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_FILE_SCOPE,
      callback: (response: { access_token?: string; error?: string }) => {
        const picked = pendingPickRef.current;
        pendingPickRef.current = null;
        if (response.error || !response.access_token || !picked) {
          setStatus({ kind: "error", message: "Google didn't grant access to Drive — try again." });
          return;
        }
        openPicker(response.access_token, picked);
      },
    });
  }, [configured, scriptsReady.gis, clientId, openPicker]);

  function choosePdf() {
    if (!pickerReady || !tokenClientRef.current) return;
    setStatus({ kind: "idle" });
    pendingPickRef.current = { grade: Number(grade) as 2 | 4, subject, domain };
    tokenClientRef.current.requestAccessToken();
  }

  // scriptsReady.gis true implies the effect above has already run and set
  // tokenClientRef.current synchronously — choosePdf() also re-checks the
  // ref itself as a runtime safety net, so this is just for the button's
  // disabled state, not the sole guard.
  const canChoose = configured && pickerReady && scriptsReady.gis;

  const runBatchImport = useCallback(
    async (files: File[], skipped: number) => {
      if (files.length === 0) {
        if (skipped > 0) setBatchNote(`Skipped ${skipped} file${skipped === 1 ? "" : "s"} — not a PDF.`);
        return;
      }
      setBatchNote(skipped > 0 ? `Skipped ${skipped} non-PDF file${skipped === 1 ? "" : "s"}.` : null);
      const picked = { grade: Number(grade) as 2 | 4, subject, domain };

      const oversized = files.filter((f) => f.size > MAX_UPLOAD_BYTES);
      const okFiles = files.filter((f) => f.size <= MAX_UPLOAD_BYTES);

      const initial: BatchItem[] = [
        ...okFiles.map((f) => ({ id: `${f.name}-${f.lastModified}-${f.size}`, name: f.name, status: "importing" as const })),
        ...oversized.map((f) => ({
          id: `${f.name}-${f.lastModified}-${f.size}`,
          name: f.name,
          status: "error" as const,
          message: `${(f.size / (1024 * 1024)).toFixed(1)}MB — over the 4MB limit.`,
        })),
      ];
      setBatch(initial);

      for (const file of okFiles) {
        const id = `${file.name}-${file.lastModified}-${file.size}`;
        const formData = new FormData();
        formData.set("file", file);
        formData.set("grade", String(picked.grade));
        formData.set("subject", picked.subject);
        formData.set("domain", picked.domain);
        try {
          const result = await importUploadedSourceDocument(formData);
          setBatch((prev) =>
            prev.map((b) =>
              b.id === id
                ? {
                    ...b,
                    status: "done",
                    message: result.usedOcrFallback
                      ? `${result.pageCount} pages transcribed (scanned), ${result.chunkCount} chunks`
                      : `${result.pageCount} pages, ${result.chunkCount} chunks`,
                  }
                : b
            )
          );
          router.refresh();
        } catch (err) {
          setBatch((prev) =>
            prev.map((b) => (b.id === id ? { ...b, status: "error", message: err instanceof Error ? err.message : "Import failed." } : b))
          );
        }
      }
    },
    [grade, subject, domain, router]
  );

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const all = Array.from(e.target.files ?? []);
    const files = all.filter(isPdfFile);
    runBatchImport(files, all.length - files.length);
    e.target.value = ""; // allow re-selecting the same file(s) later
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    collectDroppedPdfs(e.dataTransfer).then(({ files, skipped }) => runBatchImport(files, skipped));
  }

  const batchDone = batch.length > 0 && batch.every((b) => b.status !== "importing");

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <FileUp className="h-5 w-5 text-math" />
        <h3 className="font-display text-lg font-semibold">Import practice material from a PDF</h3>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Grade</Label>
            <Select value={grade} onValueChange={setGrade}>
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
            <Label className="text-xs">Subject</Label>
            <Select value={subject} onValueChange={(v) => selectSubject(v as "math" | "reading")}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reading">Reading</SelectItem>
                <SelectItem value="math">Math</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{subject === "math" ? "Domain" : "Topic"}</Label>
            <Select value={domain} onValueChange={setDomain}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {domainOptions.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Tag the PDF(s) by grade and {subject === "math" ? "domain" : "topic"} first — this only builds a searchable source-material library for now;
          it doesn&apos;t generate questions yet (that&apos;s next).
        </p>

        {configured && (
          <>
            {/* nonce is required here: our CSP's script-src relies on 'strict-dynamic',
                which ignores host allowlists and trusts only nonce-carrying (or
                already-trusted-script-injected) scripts — see proxy.ts. */}
            <Script
              src="https://apis.google.com/js/api.js"
              strategy="afterInteractive"
              nonce={nonce}
              onLoad={() => setScriptsReady((s) => ({ ...s, gapi: true }))}
            />
            <Script
              src="https://accounts.google.com/gsi/client"
              strategy="afterInteractive"
              nonce={nonce}
              onLoad={() => setScriptsReady((s) => ({ ...s, gis: true }))}
            />
            <Button onClick={choosePdf} disabled={!canChoose || status.kind === "importing"} className="w-full gap-2 bg-math text-white hover:bg-math/90">
              <FileUp className="h-4 w-4" />
              {status.kind === "importing" ? "Importing…" : "Choose PDF from Drive"}
            </Button>
            {status.kind === "done" && <p className="text-sm text-emerald-600 dark:text-emerald-400">{status.message}</p>}
            {status.kind === "error" && <p className="text-sm text-destructive">{status.message}</p>}
          </>
        )}

        <div className="relative">
          {configured && (
            <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              or from your computer
              <div className="h-px flex-1 bg-border" />
            </div>
          )}

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
              dragActive ? "border-math bg-math/5" : "border-border"
            }`}
          >
            <UploadCloud className={`h-6 w-6 ${dragActive ? "text-math" : "text-muted-foreground"}`} />
            <p className="text-sm text-muted-foreground">Drag and drop a PDF, or a whole folder of PDFs, here</p>
            <div className="mt-1 flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1.5">
                <FileUp className="h-3.5 w-3.5" />
                Browse files
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => folderInputRef.current?.click()} className="gap-1.5">
                <FolderOpen className="h-3.5 w-3.5" />
                Browse folder
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">PDFs up to 4MB each.</p>
            <input ref={fileInputRef} type="file" accept="application/pdf" multiple className="hidden" onChange={handleFileInputChange} />
            <input
              // webkitdirectory isn't in React's DOM typings (it's a
              // non-standard, non-spec attribute), so it's set imperatively
              // here rather than as a JSX prop.
              ref={(el) => {
                folderInputRef.current = el;
                el?.setAttribute("webkitdirectory", "");
              }}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileInputChange}
            />
          </div>
        </div>

        {batchNote && <p className="text-xs text-muted-foreground">{batchNote}</p>}

        {batch.length > 0 && (
          <div className="space-y-1.5 rounded-xl border border-border bg-secondary/30 p-3">
            {batch.map((b) => (
              <div key={b.id} className="flex items-center gap-2 text-sm">
                {b.status === "importing" && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
                {b.status === "done" && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />}
                {b.status === "error" && <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />}
                <span className="min-w-0 flex-1 truncate">{b.name}</span>
                {b.message && (
                  <span className={`shrink-0 text-xs ${b.status === "error" ? "text-destructive" : "text-muted-foreground"}`}>{b.message}</span>
                )}
              </div>
            ))}
            {batchDone && (
              <button type="button" onClick={() => setBatch([])} className="pt-1 text-xs text-muted-foreground underline-offset-2 hover:underline">
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-6">
        <h4 className="mb-2 text-sm font-medium text-muted-foreground">Imported so far</h4>
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No PDFs imported yet.</p>
        ) : (
          <ul className="space-y-2">
            {documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-sm shadow-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate">{d.title}</p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      Grade {d.grade} · {d.subject === "math" ? "Math" : "Reading"}
                      {d.domain ? ` · ${d.domain}` : ""} · {d.pageCount} pages · {d.chunkCount} chunks · {d.source === "upload" ? "uploaded" : "from Drive"}
                      {d.embeddedChunkCount > 0 && (
                        <span className="ml-1 inline-flex items-center gap-0.5 text-amber">
                          <Sparkles className="h-3 w-3" /> embedded
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => deleteSourceDocument(d.id).then(() => router.refresh())}
                  className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive"
                  aria-label={`Remove ${d.title}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
