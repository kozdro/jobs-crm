export const documentsChangedEvent = "jobs-crm:documents-changed";

export function notifyDocumentsChanged(owner: string, pending = false) {
  window.dispatchEvent(
    new CustomEvent(documentsChangedEvent, { detail: { owner, pending } }),
  );
}

export function isDocumentsChangeFor(event: Event, owner: string): boolean {
  return (event as CustomEvent<{ owner?: unknown }>).detail?.owner === owner;
}

export function isDocumentsChangePending(event: Event): boolean {
  return (event as CustomEvent<{ pending?: unknown }>).detail?.pending === true;
}
