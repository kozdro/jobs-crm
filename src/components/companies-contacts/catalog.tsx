"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type {
  CatalogProfile,
  ProfileType,
} from "@/modules/companies-contacts/domain/catalog";
import { buttonStyles } from "@/components/ui/styles";
import { profileHref } from "./client";
import { useCatalogRead } from "./hooks";
import { ProfileForm } from "./profile-form";
import { AuditPanel, PageControls, ReadFeedback } from "./common";
import { RelationsPanel } from "./relations";

export function CatalogList({
  userId,
  type,
}: {
  userId: string;
  type: ProfileType;
}) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const read = useCatalogRead<{
    profiles: CatalogProfile[];
    hasMore: boolean;
    page: number;
  }>(userId, { type, page });
  const label = type === "organization" ? "firmę" : "kontakt";
  return (
    <div className="space-y-5">
      <button
        ref={trigger}
        type="button"
        className={buttonStyles.primary}
        aria-expanded={adding}
        onClick={() => {
          setAdding(true);
          requestAnimationFrame(() => heading.current?.focus());
        }}
      >
        Dodaj {label}
      </button>
      {adding && (
        <section className="ui-panel space-y-4 p-5 sm:p-6">
          <h2
            ref={heading}
            tabIndex={-1}
            className="text-lg font-semibold outline-none"
          >
            {type === "organization" ? "Nowa firma" : "Nowy kontakt"}
          </h2>
          <ProfileForm
            userId={userId}
            type={type}
            onSaved={(profile) => router.push(profileHref(profile))}
            onCancel={() => {
              setAdding(false);
              requestAnimationFrame(() => trigger.current?.focus());
            }}
          />
        </section>
      )}
      <section
        className="ui-panel p-5 sm:p-6"
        aria-label={type === "organization" ? "Lista firm" : "Lista kontaktów"}
      >
        <ReadFeedback {...read} />
        {read.data && (
          <>
            {read.data.profiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {page === 1
                  ? type === "organization"
                    ? "Nie masz jeszcze firm. Dodaj pierwszy profil."
                    : "Nie masz jeszcze kontaktów. Kontakt może istnieć bez sprawy."
                  : "Brak profili na tej stronie."}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {read.data.profiles.map((profile) => (
                  <li key={profile.id} className="min-w-0 py-3">
                    <Link
                      href={profileHref(profile)}
                      className="ui-link inline-flex min-h-11 max-w-full items-center break-all text-base font-medium"
                    >
                      {profile.name}
                    </Link>
                    {profile.email && (
                      <p className="break-all text-sm text-muted-foreground">
                        {profile.email}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <PageControls
              page={page}
              hasMore={read.data.hasMore}
              onPage={setPage}
              label={
                type === "organization"
                  ? "Strony listy firm"
                  : "Strony listy kontaktów"
              }
            />
          </>
        )}
      </section>
    </div>
  );
}
export function CatalogProfileScreen({
  userId,
  id,
  type,
}: {
  userId: string;
  id: string;
  type: ProfileType;
}) {
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const editTrigger = useRef<HTMLButtonElement>(null);
  const read = useCatalogRead<{ profile: CatalogProfile | null }>(
    userId,
    { id },
    revision,
    true,
  );
  const profile = read.data?.profile;
  return (
    <div className="space-y-5">
      <Link
        href={type === "organization" ? "/companies" : "/contacts"}
        className="ui-link inline-flex min-h-11 items-center text-sm"
      >
        {type === "organization"
          ? "Wróć do listy firm"
          : "Wróć do listy kontaktów"}
      </Link>
      <ReadFeedback {...read} />
      {read.error && profile && (
        <p className="text-sm text-muted-foreground">
          Pokazujemy ostatnio potwierdzone dane profilu. Odczyt nie został
          odświeżony.
        </p>
      )}
      {read.data && (!profile || profile.type !== type) ? (
        <p role="alert">Nie znaleziono dostępnego profilu.</p>
      ) : (
        profile && (
          <>
            <section
              className="ui-panel min-w-0 space-y-4 p-5 sm:p-6"
              aria-label="Dane profilu"
            >
              <h2 className="break-all text-xl font-semibold">
                {profile.name}
              </h2>
              {profile.type === "contact" && (
                <p className="break-all text-sm">
                  {profile.email ?? "Nie podano adresu e-mail."}
                </p>
              )}
              <button
                ref={editTrigger}
                type="button"
                className={buttonStyles.secondary}
                aria-expanded={editing}
                disabled={read.loading || read.error}
                onClick={() => {
                  setEditing(true);
                  requestAnimationFrame(() => heading.current?.focus());
                }}
              >
                Edytuj profil
              </button>
              {editing && (
                <div className="space-y-4 border-t border-border pt-4">
                  <h3
                    ref={heading}
                    tabIndex={-1}
                    className="font-semibold outline-none"
                  >
                    Edycja profilu
                  </h3>
                  <ProfileForm
                    key={`${profile.id}:${profile.revision}`}
                    userId={userId}
                    type={type}
                    profile={profile}
                    onSaved={() => {
                      setEditing(false);
                      setRevision((value) => value + 1);
                      requestAnimationFrame(() => editTrigger.current?.focus());
                    }}
                    onCancel={() => {
                      setEditing(false);
                      requestAnimationFrame(() => editTrigger.current?.focus());
                    }}
                    onReload={() => {
                      setEditing(false);
                      setRevision((value) => value + 1);
                    }}
                  />
                </div>
              )}
            </section>
            <RelationsPanel
              userId={userId}
              contextType={type}
              contextId={id}
              revision={revision}
            />
            <AuditPanel userId={userId} targetId={id} revision={revision} />
          </>
        )
      )}
    </div>
  );
}
