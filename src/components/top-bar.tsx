import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Shared header for kid-facing practice screens — title/subtitle, optional
 * right-side slot (timer, progress), and a back control that's either a
 * real link (backHref — for page-to-page navigation) or a same-page state
 * transition (onBack — for stepping back within a client-side session
 * without losing React state). Provide exactly one.
 */
export function TopBar({
  title,
  subtitle,
  backHref,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur sm:px-6">
      {backHref ? (
        <Link
          href={backHref}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
      ) : (
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-base font-semibold sm:text-lg">{title}</p>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
