import { requireChild } from "@/lib/data/dal";
import { getReadingPassages } from "@/lib/data/practice";
import { ReadingPractice } from "@/components/kid/reading-practice";

export default async function ReadingPracticePage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const child = await requireChild(childId);
  const passages = await getReadingPassages(childId);

  return (
    <ReadingPractice
      childId={child.id}
      childName={child.name}
      childGrade={child.grade}
      passages={passages}
      backHref={`/kid/${child.id}`}
    />
  );
}
