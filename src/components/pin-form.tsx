"use client";

import { useActionState } from "react";
import { unlockParentModeAction, type PinState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PinForm() {
  const [state, action, pending] = useActionState<PinState, FormData>(unlockParentModeAction, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pin">Parent PIN</Label>
        <Input
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          required
          minLength={4}
          maxLength={8}
          placeholder="••••"
          autoFocus
        />
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Checking…" : "Unlock Parent Mode"}
      </Button>
    </form>
  );
}
