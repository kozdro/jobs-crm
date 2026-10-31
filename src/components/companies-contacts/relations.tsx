"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type {
  CatalogProfile,
  CatalogRelation,
  ProfileType,
} from "@/modules/companies-contacts/domain/catalog";
import { getBrowserClient } from "@/modules/identity/infrastructure/browser";
import { listRecruitmentCases } from "@/modules/recruitment/application/cases";
import { inputStyles } from "@/components/ui/styles";
import { catalogButtonStyles as buttonStyles } from "./styles";
import { catalogRead, entityHref } from "./client";
import { useCatalogRead, useCatalogMutation } from "./hooks";
import {
  AuditPanel,
  MutationFeedback,
  PageControls,
  ReadFeedback,
} from "./common";

type EntityType = "case" | ProfileType;
const entityLabels: Record<EntityType, string> = {
  case: "sprawą",
  organization: "firmą",
  contact: "kontaktem",
};
const roleLabels = { employer: "Pracodawca", agency: "Agencja" };
type Candidate = { id: string; name: string };
export function RelationsPanel({
  userId,
  contextType,
  contextId,
  revision = 0,
}: {
  userId: string;
  contextType: EntityType;
  contextId: string;
  revision?: number;
}) {
  const sectionHeading = useRef<HTMLHeadingElement>(null);
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [targetType, setTargetType] = useState<EntityType | null>(null);
  const [editingRelation, setEditingRelation] = useState<{
    relation: CatalogRelation;
    action: "detach" | "role";
  } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const read = useCatalogRead<{
    relations: CatalogRelation[];
    hasMore: boolean;
    page: number;
  }>(userId, { contextType, contextId, page }, revision + version);
  const targets: EntityType[] =
    contextType === "case"
      ? ["organization", "contact"]
      : contextType === "organization"
        ? ["case", "contact"]
        : ["case", "organization"];
  function refresh() {
    setVersion((value) => value + 1);
  }
  return (
    <section className="ui-panel space-y-4 p-5 sm:p-6" aria-label="Powiązania">
      <h2
        ref={sectionHeading}
        tabIndex={-1}
        className="text-lg font-semibold outline-none"
      >
        Powiązania
      </h2>
      <p className="text-sm leading-6 text-muted-foreground">
        Powiązanie osoby ze sprawą nie oznacza udziału w jej zdarzeniach.
        Powiązanie z firmą nie potwierdza zatrudnienia. Pracodawca może pozostać
        nieznany.
      </p>
      <div className="flex flex-wrap gap-3">
        {targets.map((type) => (
          <button
            key={type}
            type="button"
            className={buttonStyles.secondary}
            aria-expanded={targetType === type}
            disabled={targetType !== null || editingRelation !== null}
            onClick={(event) => {
              trigger.current = event.currentTarget;
              setTargetType(type);
              requestAnimationFrame(() => heading.current?.focus());
            }}
          >
            Powiąż z{type === "case" ? "e" : ""} {entityLabels[type]}
          </button>
        ))}
      </div>
      {targetType && (
        <div className="space-y-4 rounded-md border border-border p-4">
          <h3
            ref={heading}
            tabIndex={-1}
            className="font-semibold outline-none"
          >
            Nowe powiązanie
          </h3>
          <AttachForm
            key={`${contextId}:${targetType}`}
            userId={userId}
            contextId={contextId}
            contextType={contextType}
            targetType={targetType}
            onSaved={() => {
              setTargetType(null);
              refresh();
              requestAnimationFrame(() => trigger.current?.focus());
            }}
            onCancel={() => {
              setTargetType(null);
              requestAnimationFrame(() => trigger.current?.focus());
            }}
          />
        </div>
      )}
      {editingRelation && (
        <RelationEditor
          key={`${editingRelation.relation.id}:${editingRelation.relation.revision}:${editingRelation.action}`}
          userId={userId}
          relation={editingRelation.relation}
          action={editingRelation.action}
          onSaved={() => {
            setEditingRelation(null);
            refresh();
            requestAnimationFrame(() => sectionHeading.current?.focus());
          }}
          onCancel={() => {
            setEditingRelation(null);
            requestAnimationFrame(() => trigger.current?.focus());
          }}
          onReload={() => {
            setEditingRelation(null);
            refresh();
            requestAnimationFrame(() => sectionHeading.current?.focus());
          }}
        />
      )}
      <ReadFeedback {...read} />
      {read.data && (
        <>
          {read.data.relations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Brak powiązań na tej stronie.
            </p>
          ) : (
            <ul className="space-y-3" aria-label="Zapisane powiązania">
              {read.data.relations.map((relation) => (
                <RelationRow
                  key={`${relation.id}:${relation.revision}`}
                  userId={userId}
                  contextId={contextId}
                  relation={relation}
                  disabled={targetType !== null || editingRelation !== null}
                  onAction={(action, button) => {
                    trigger.current = button;
                    setEditingRelation({ relation, action });
                  }}
                />
              ))}
            </ul>
          )}
          <PageControls
            page={page}
            hasMore={read.data.hasMore}
            onPage={setPage}
            label="Strony powiązań"
            disabled={targetType !== null || editingRelation !== null}
          />
        </>
      )}
      {contextType === "case" && (
        <AuditPanel
          userId={userId}
          targetId={contextId}
          revision={revision + version}
        />
      )}
    </section>
  );
}
function useCandidates(userId: string, type: EntityType, page: number) {
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{
    items: Candidate[];
    hasMore: boolean;
    loading: boolean;
    error: boolean;
  }>({ items: [], hasMore: false, loading: true, error: false });
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      setState({ items: [], hasMore: false, loading: true, error: false });
      try {
        const result =
          type === "case"
            ? await listRecruitmentCases(getBrowserClient(), page)
            : await catalogRead<{
                profiles: CatalogProfile[];
                hasMore: boolean;
              }>(userId, { type, page }, controller.signal);
        if (controller.signal.aborted) return;
        const items =
          "cases" in result
            ? result.cases.map((item) => ({
                id: item.id,
                name: `${item.title} · ${item.status}`,
              }))
            : result.profiles.map((item) => ({ id: item.id, name: item.name }));
        setState({
          items,
          hasMore: result.hasMore,
          loading: false,
          error: false,
        });
      } catch {
        if (!controller.signal.aborted)
          setState({ items: [], hasMore: false, loading: false, error: true });
      }
    });
    return () => controller.abort();
  }, [userId, type, page, retry]);
  return { ...state, reload: () => setRetry((value) => value + 1) };
}
function AttachForm({
  userId,
  contextType,
  contextId,
  targetType,
  onSaved,
  onCancel,
}: {
  userId: string;
  contextType: EntityType;
  contextId: string;
  targetType: EntityType;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState("");
  const [role, setRole] = useState<"" | "employer" | "agency">("");
  const [error, setError] = useState(false);
  const feedback = useRef<HTMLParagraphElement>(null);
  const read = useCandidates(userId, targetType, page);
  const mutation = useCatalogMutation(userId, onSaved);
  const locked = mutation.pending || mutation.uncertain;
  const needsRole =
    (contextType === "case" && targetType === "organization") ||
    (contextType === "organization" && targetType === "case");
  const targetLabel =
    targetType === "case"
      ? "Wybierz sprawę"
      : targetType === "organization"
        ? "Wybierz firmę"
        : "Wybierz kontakt";
  function submit(event: FormEvent) {
    event.preventDefault();
    if (locked) return;
    if (!selected || (needsRole && !role)) {
      setError(true);
      requestAnimationFrame(() => feedback.current?.focus());
      return;
    }
    const caseLink = contextType === "case" || targetType === "case";
    const relationType = caseLink
      ? contextType === "organization" || targetType === "organization"
        ? "case-organization"
        : "case-contact"
      : "organization-contact";
    const contextIsLeft =
      contextType === "case" || (!caseLink && contextType === "organization");
    void mutation.send({
      requestId: crypto.randomUUID(),
      operation: "attach",
      relationType,
      leftId: contextIsLeft ? contextId : selected,
      rightId: contextIsLeft ? selected : contextId,
      role: needsRole && role ? role : null,
    });
  }
  return (
    <form
      onSubmit={submit}
      noValidate
      className="space-y-4"
      aria-label={`Powiązanie z ${entityLabels[targetType]}`}
      aria-busy={mutation.pending}
    >
      <ReadFeedback {...read} />
      <div className="space-y-2">
        <label htmlFor={`${id}-target`} className="block text-sm font-medium">
          {targetLabel}
        </label>
        <select
          id={`${id}-target`}
          disabled={locked || read.loading || read.error}
          value={selected}
          required
          aria-invalid={error && !selected}
          className={inputStyles}
          onChange={(event) => {
            setSelected(event.target.value);
            setError(false);
            mutation.clearDraftFeedback();
          }}
        >
          <option value="">Wybierz zapisany profil</option>
          {read.items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        {!read.loading && !read.error && read.items.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Brak rekordów na tej stronie. Najpierw dodaj profil w odpowiednim
            module.
          </p>
        )}
        <PageControls
          page={page}
          hasMore={read.hasMore}
          label="Strony wyboru powiązania"
          onPage={(next) => {
            if (locked) return;
            setSelected("");
            setPage(next);
          }}
        />
      </div>
      {needsRole && (
        <div className="space-y-2">
          <label htmlFor={`${id}-role`} className="block text-sm font-medium">
            Rola firmy w sprawie
          </label>
          <select
            id={`${id}-role`}
            required
            disabled={locked}
            value={role}
            onChange={(event) => {
              setRole(event.target.value as typeof role);
              setError(false);
              mutation.clearDraftFeedback();
            }}
            className={inputStyles}
            aria-invalid={error && !role}
          >
            <option value="">Wybierz rolę</option>
            <option value="employer">Pracodawca</option>
            <option value="agency">Agencja</option>
          </select>
        </div>
      )}
      {error && (
        <p
          ref={feedback}
          role="alert"
          tabIndex={-1}
          className="text-sm text-destructive outline-none focus:ring-2 focus:ring-ring"
        >
          Wybierz rekord i, jeśli dotyczy, rolę firmy.
        </p>
      )}
      <MutationFeedback mutation={mutation} />
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          className={buttonStyles.primary}
          disabled={locked || read.loading || read.error}
        >
          {mutation.pending ? "Zapisywanie…" : "Zapisz powiązanie"}
        </button>
        <button
          type="button"
          className={buttonStyles.secondary}
          disabled={locked}
          onClick={onCancel}
        >
          Anuluj
        </button>
      </div>
    </form>
  );
}
function RelationRow({
  userId,
  contextId,
  relation,
  disabled,
  onAction,
}: {
  userId: string;
  contextId: string;
  relation: CatalogRelation;
  disabled: boolean;
  onAction: (action: "detach" | "role", button: HTMLButtonElement) => void;
}) {
  const other =
    contextId === relation.left_id
      ? {
          id: relation.right_id,
          type: relation.rightType,
          name: relation.rightLabel,
        }
      : {
          id: relation.left_id,
          type: relation.leftType,
          name: relation.leftLabel,
        };
  return (
    <li className="min-w-0 space-y-3 rounded-md border border-border p-4">
      <Link
        href={entityHref(other.type, other.id)}
        className="ui-link inline-flex min-h-11 max-w-full items-center break-all font-medium"
      >
        {other.name}
      </Link>
      {relation.role && (
        <p className="text-sm">Rola firmy: {roleLabels[relation.role]}</p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={buttonStyles.secondary}
          disabled={disabled}
          aria-label={`Odłącz ${other.name}`}
          onClick={(event) => onAction("detach", event.currentTarget)}
        >
          Odłącz
        </button>
        {relation.type === "case-organization" && (
          <button
            type="button"
            className={buttonStyles.secondary}
            disabled={disabled}
            onClick={(event) => onAction("role", event.currentTarget)}
          >
            Zmień rolę firmy
          </button>
        )}
      </div>
      <AuditPanel userId={userId} targetId={relation.id} />
    </li>
  );
}
function RelationEditor({
  userId,
  relation,
  action,
  onSaved,
  onCancel,
  onReload,
}: {
  userId: string;
  relation: CatalogRelation;
  action: "detach" | "role";
  onSaved: () => void;
  onCancel: () => void;
  onReload: () => void;
}) {
  const [role, setRole] = useState<"employer" | "agency">(
    relation.role ?? "employer",
  );
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const mutation = useCatalogMutation(userId, onSaved);
  const locked = mutation.pending || mutation.uncertain;
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <div
      className="space-y-3 rounded-md border border-border p-4"
      aria-label="Zmiana powiązania"
    >
      <h3
        ref={heading}
        tabIndex={-1}
        className="text-sm font-semibold outline-none"
      >
        {action === "detach" ? "Potwierdź odłączenie" : "Korekta roli firmy"}
      </h3>
      <p className="break-all text-sm font-medium">
        {relation.leftLabel} · {relation.rightLabel}
      </p>
      <p className="text-sm text-muted-foreground">
        Zmiana dotyczy bieżącego powiązania. Nie zmienia zdarzeń, statusu ani
        zakończeń sprawy.
      </p>
      {action === "role" && (
        <div className="space-y-2">
          <label htmlFor={`${id}-role`} className="block text-sm font-medium">
            Nowa rola firmy
          </label>
          <select
            id={`${id}-role`}
            value={role}
            disabled={locked}
            className={inputStyles}
            onChange={(event) => {
              setRole(event.target.value as typeof role);
              mutation.clearDraftFeedback();
            }}
          >
            <option value="employer">Pracodawca</option>
            <option value="agency">Agencja</option>
          </select>
        </div>
      )}
      <MutationFeedback mutation={mutation} />
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={buttonStyles.primary}
          disabled={locked || (action === "role" && role === relation.role)}
          onClick={() =>
            void mutation.send({
              requestId: crypto.randomUUID(),
              operation: action === "detach" ? "detach" : "change-role",
              relationId: relation.id,
              expectedRevision: relation.revision,
              ...(action === "role" ? { role } : {}),
            })
          }
        >
          {mutation.pending
            ? "Zapisywanie…"
            : action === "detach"
              ? "Potwierdź odłączenie"
              : "Potwierdź zmianę roli"}
        </button>
        <button
          type="button"
          disabled={locked}
          className={buttonStyles.secondary}
          onClick={onCancel}
        >
          Anuluj
        </button>
        <button
          type="button"
          disabled={locked}
          className={buttonStyles.ghost}
          onClick={onReload}
        >
          Odśwież powiązania
        </button>
      </div>
    </div>
  );
}
