import Link from "next/link";
export default function RecruitmentNotFound() {
  return (
    <main className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Sprawa niedostępna</h1>
      <p className="text-sm text-muted-foreground">
        Nie można otworzyć tej sprawy.
      </p>
      <Link
        href="/recruitments"
        className="inline-flex min-h-11 items-center underline underline-offset-4"
      >
        Wróć do listy spraw
      </Link>
    </main>
  );
}
