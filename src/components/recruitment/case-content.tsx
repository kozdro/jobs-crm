import type { RecruitmentCase } from "@/modules/recruitment/domain/recruitment-case";

export function CaseContent({ item }: { item: RecruitmentCase }) {
  return (
    <dl className="grid min-w-0 gap-5 text-sm">
      <div>
        <dt className="text-muted-foreground">Status</dt>
        <dd className="mt-1 font-medium">{item.status}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Dodano do CRM</dt>
        <dd className="mt-1">
          <time dateTime={item.created_at}>
            {new Intl.DateTimeFormat("pl-PL", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Europe/Warsaw",
            }).format(new Date(item.created_at))}
          </time>
        </dd>
      </div>
      {item.description && (
        <div>
          <dt className="text-muted-foreground">Opis</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
            {item.description}
          </dd>
        </div>
      )}
      {item.source_url && (
        <div>
          <dt className="text-muted-foreground">URL źródłowy</dt>
          <dd className="mt-1 min-w-0">
            <a
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block min-h-11 max-w-full break-all py-2 underline underline-offset-4"
            >
              {item.source_url}
              <span className="sr-only"> (otwiera nową kartę)</span>
            </a>
          </dd>
        </div>
      )}
    </dl>
  );
}
