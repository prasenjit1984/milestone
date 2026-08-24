// No "server-only" here on purpose — this is imported from client components
// (to render the kid-facing headline) as well as server code.

export type WritingTone = "on-target" | "getting-there" | "nice-try" | "pending";

/** Kid-facing (short, upbeat) version of the tone — never shows the full parent-facing critique. */
export function kidFacingLine(tone: WritingTone): { headline: string; note: string } {
  switch (tone) {
    case "on-target":
      return { headline: "Right on target! 🎯", note: "You used real details from what you read." };
    case "getting-there":
      return { headline: "Getting there! 🌱", note: "Good start — a little more detail next time." };
    case "nice-try":
      return { headline: "Nice try! 💪", note: "Try adding a bit more — what happened, and why?" };
    case "pending":
      return { headline: "Answer saved! 📝", note: "A grown-up will be able to see this in Parent Mode." };
  }
}
