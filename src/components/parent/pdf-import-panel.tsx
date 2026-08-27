"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { importSourceDocument, deleteSourceDocument } from "@/lib/actions/source-content";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { FileUp, Trash2, FileText, Sparkles } from "lucide-react";

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
  pageCount: number;
  chunkCount: number;
  embeddedChunkCount: number;
  createdAt: string;
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
  const tokenClientRef = useRef<{ requestAccessToken: () => void } | null>(null);
  const pendingPickRef = useRef<{ grade: 2 | 4; subject: "math" | "reading"; domain: string } | null>(null);

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

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <FileUp className="h-5 w-5 text-math" />
        <h3 className="font-display text-lg font-semibold">Import practice material from a PDF</h3>
      </div>

      {!configured ? (
        <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          PDF import isn&apos;t configured yet. Set <code className="rounded bg-secondary px-1 py-0.5 text-xs">NEXT_PUBLIC_GOOGLE_API_KEY</code> and{" "}
          <code className="rounded bg-secondary px-1 py-0.5 text-xs">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> (a Google Cloud OAuth Client ID scoped to{" "}
          <code className="rounded bg-secondary px-1 py-0.5 text-xs">drive.file</code>) to enable it — see the README for the walkthrough.
        </div>
      ) : (
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
              Tag the PDF by grade and {subject === "math" ? "domain" : "topic"} first, then pick the file — this only builds a searchable source-material
              library for now; it doesn&apos;t generate questions yet (that&apos;s next).
            </p>

            <Button onClick={choosePdf} disabled={!canChoose || status.kind === "importing"} className="w-full gap-2 bg-math text-white hover:bg-math/90">
              <FileUp className="h-4 w-4" />
              {status.kind === "importing" ? "Importing…" : "Choose PDF from Drive"}
            </Button>

            {status.kind === "done" && <p className="text-sm text-emerald-600 dark:text-emerald-400">{status.message}</p>}
            {status.kind === "error" && <p className="text-sm text-destructive">{status.message}</p>}
          </div>
        </>
      )}

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
                      {d.domain ? ` · ${d.domain}` : ""} · {d.pageCount} pages · {d.chunkCount} chunks
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
