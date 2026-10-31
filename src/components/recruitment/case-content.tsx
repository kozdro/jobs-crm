import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { RecruitmentCase } from "@/modules/recruitment/domain/recruitment-case";

export function CaseStatus({ status }: { status: RecruitmentCase["status"] }) {
  return (
    <span className="inline-flex w-fit rounded-sm bg-accent px-2 py-1 text-xs font-semibold text-primary">
      {status}
    </span>
  );
}
export function CaseCreatedTime({ value }: { value: string }) {
  return (
    <time dateTime={value}>
      {new Intl.DateTimeFormat("pl-PL", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Warsaw",
      }).format(new Date(value))}
    </time>
  );
}
function sourceHostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
export function CaseListItem({ item }: { item: RecruitmentCase }) {
  return (
    <li className="grid min-w-0 gap-3 border-b border-border px-5 py-5 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_180px_150px] lg:gap-5 md:px-6">
      <div className="min-w-0">
        <h2 className="text-[15px] leading-6 font-semibold [overflow-wrap:anywhere]">
          <Link
            href={`/recruitments/${item.id}`}
            className="hover:text-primary hover:underline underline-offset-4"
          >
            {item.title}
          </Link>
        </h2>
        {item.description && (
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
            {item.description}
          </p>
        )}
        {item.source_url && (
          <a
            href={item.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex min-h-8 max-w-full items-center gap-1.5 text-[13px] text-primary underline underline-offset-4"
          >
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {sourceHostname(item.source_url)}
            </span>
            <ExternalLink aria-hidden="true" size={13} className="shrink-0" />
            <span className="sr-only"> (otwiera nową kartę)</span>
          </a>
        )}
      </div>
      <div className="min-w-0 space-y-2">
        <div>
          <span className="sr-only">Status: </span>
          <CaseStatus status={item.status} />
        </div>
        {item.current_stage && (
          <p className="text-[13px] leading-5 [overflow-wrap:anywhere]">
            <span className="text-muted-foreground">Etap: </span>
            {item.current_stage}
          </p>
        )}
      </div>
      <div className="text-[13px] leading-5 text-muted-foreground">
        <span className="mr-2 lg:block">Dodano do CRM</span>
        <CaseCreatedTime value={item.created_at} />
      </div>
    </li>
  );
}
export function CaseContent({ item }: { item: RecruitmentCase }) {
  return (
    <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_270px]">
      <section
        className="ui-panel p-5 sm:p-6 lg:col-start-2 lg:row-start-1"
        aria-labelledby="case-metadata-heading"
      >
        <h2 id="case-metadata-heading" className="mb-5 text-lg font-semibold">
          Szczegóły sprawy
        </h2>
        <dl className="space-y-5 text-sm">
          <div>
            <dt className="mb-2 text-[13px] text-muted-foreground">Status</dt>
            <dd>
              <CaseStatus status={item.status} />
            </dd>
          </div>
          <div>
            <dt className="mb-1 text-[13px] text-muted-foreground">
              Bieżący etap
            </dt>
            <dd className="[overflow-wrap:anywhere]">
              {item.current_stage ?? "Nie ustawiono etapu"}
            </dd>
          </div>
          <div>
            <dt className="mb-1 text-[13px] text-muted-foreground">
              Dodano do CRM
            </dt>
            <dd className="text-[13px]">
              <CaseCreatedTime value={item.created_at} />
            </dd>
          </div>
        </dl>
      </section>
      <section
        className="ui-panel p-5 sm:p-6 lg:col-start-1 lg:row-start-1"
        aria-labelledby="case-context-heading"
      >
        <h2 id="case-context-heading" className="mb-5 text-lg font-semibold">
          Kontekst sprawy
        </h2>
        {!item.description && !item.source_url && (
          <p className="text-sm leading-6 text-muted-foreground">
            Nie dodano dodatkowego opisu ani adresu źródłowego.
          </p>
        )}
        <dl className="min-w-0 space-y-6 text-sm">
          {item.description && (
            <div>
              <dt className="mb-2 font-medium text-muted-foreground">Opis</dt>
              <dd className="whitespace-pre-wrap leading-7 [overflow-wrap:anywhere]">
                {item.description}
              </dd>
            </div>
          )}
          {item.source_url && (
            <div>
              <dt className="font-medium text-muted-foreground">
                URL źródłowy
              </dt>
              <dd className="min-w-0">
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ui-link inline-block min-h-11 max-w-full py-2 leading-6 [overflow-wrap:anywhere]"
                >
                  {item.source_url}
                  <span className="sr-only"> (otwiera nową kartę)</span>
                </a>
              </dd>
            </div>
          )}
        </dl>
      </section>
    </div>
  );
}
