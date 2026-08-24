import { requireChild } from "@/lib/data/dal";
import { getMathPool, getMasteryForChild } from "@/lib/data/practice";
import { MathPractice } from "@/components/kid/math-practice";

export default async function MathPracticePage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const child = await requireChild(childId);
  const [pool, mastery] = await Promise.all([getMathPool(childId), getMasteryForChild(childId)]);

  return (
    <MathPractice
      childId={child.id}
      childName={child.name}
      childGrade={child.grade}
      pool={pool}
      mastery={mastery.filter((m) => m.subject === "math").map((m) => ({ domain: m.domain, level: m.level }))}
      backHref={`/kid/${child.id}`}
    />
  );
}
