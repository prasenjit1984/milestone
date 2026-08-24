"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createChild, updateChild } from "@/lib/actions/children";
import { ANIMAL_AVATARS } from "@/lib/avatars";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Pencil, Plus, Check } from "lucide-react";

export interface ProfileChild {
  id: string;
  name: string;
  grade: number;
  emoji: string;
}

const SUPPORTED_GRADES = [2, 4];

type FormState = { mode: "new" } | { mode: "edit"; childId: string };

export function ProfilesTab({ childList }: { childList: ProfileChild[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState | null>(null);
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("2");
  const [emoji, setEmoji] = useState(ANIMAL_AVATARS[0]);
  const [error, setError] = useState<string | null>(null);

  function openNew() {
    setForm({ mode: "new" });
    setName("");
    setGrade("2");
    setEmoji(ANIMAL_AVATARS[0]);
    setError(null);
  }

  function openEdit(child: ProfileChild) {
    setForm({ mode: "edit", childId: child.id });
    setName(child.name);
    setGrade(String(child.grade));
    setEmoji(child.emoji);
    setError(null);
  }

  function close() {
    setForm(null);
    setError(null);
  }

  function save() {
    setError(null);
    if (!name.trim()) {
      setError("Give this profile a name.");
      return;
    }
    const payload = { name: name.trim(), grade: Number(grade) as 2 | 4, emoji };
    startTransition(async () => {
      try {
        if (form?.mode === "edit") {
          await updateChild({ ...payload, childId: form.childId });
        } else {
          await createChild(payload);
        }
        close();
        router.refresh();
      } catch {
        setError("Couldn't save that profile — please try again.");
      }
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
      <div>
        <h3 className="mb-4 font-display text-lg font-semibold">Kid profiles</h3>
        <div className="space-y-3">
          {childList.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-2xl">{c.emoji}</span>
                <div>
                  <p className="font-display text-base font-semibold">{c.name}</p>
                  <p className="text-xs text-muted-foreground">Grade {c.grade}</p>
                </div>
              </div>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openEdit(c)}>
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            </div>
          ))}
          {childList.length === 0 && <p className="text-sm text-muted-foreground">No kid profiles yet.</p>}
        </div>

        <Button variant="outline" className="mt-4 w-full gap-2" onClick={openNew}>
          <Plus className="h-4 w-4" />
          Add a child
        </Button>
      </div>

      {form && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="mb-4 font-display text-lg font-semibold">{form.mode === "edit" ? "Edit profile" : "New profile"}</h3>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Display name</Label>
              <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Zoe" maxLength={40} />
            </div>

            <div>
              <Label className="text-xs">Grade</Label>
              <Select value={grade} onValueChange={setGrade}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_GRADES.map((g) => (
                    <SelectItem key={g} value={String(g)}>
                      Grade {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">Practice content is only available for grades 2 and 4 today.</p>
            </div>

            <div>
              <Label className="text-xs">Profile picture</Label>
              <div className="mt-2 grid grid-cols-6 gap-2">
                {ANIMAL_AVATARS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setEmoji(a)}
                    className={`relative flex h-11 w-11 items-center justify-center rounded-full border text-xl transition ${
                      emoji === a ? "border-math bg-math-soft" : "border-border bg-background hover:bg-secondary"
                    }`}
                    aria-label={`Choose ${a} avatar`}
                  >
                    {a}
                    {emoji === a && (
                      <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-math text-white">
                        <Check className="h-2.5 w-2.5" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2 pt-2">
              <Button className="flex-1 bg-math text-white hover:bg-math/90" disabled={isPending} onClick={save}>
                {isPending ? "Saving…" : "Save"}
              </Button>
              <Button variant="ghost" disabled={isPending} onClick={close}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
