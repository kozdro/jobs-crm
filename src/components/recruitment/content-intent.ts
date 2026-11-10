type IntentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Claim a content intent without persisting its private payload. */
export function claimContentIntent(
  storage: IntentStorage,
  key: string,
  id: string,
) {
  const previous = storage.getItem(key);
  if (previous && previous !== id) return false;
  storage.setItem(key, id);
  return storage.getItem(key) === id;
}

/** Never clear a newer or unverifiable request when a response arrives late. */
export function clearContentIntent(
  storage: IntentStorage,
  key: string,
  id: string,
) {
  if (storage.getItem(key) !== id) return false;
  storage.removeItem(key);
  return storage.getItem(key) === null;
}

/** A different editor/page may replace an editor only after explicit discard. */
export function canDiscardContentDraft(
  dirty: boolean,
  confirmDiscard: () => boolean,
) {
  return !dirty || confirmDiscard();
}

/** A live frozen payload must remain mounted; unknown storage alone blocks
 * Notes/Links writes but must not swallow unrelated existing interactions. */
export function contentRecoveryGuards(status: string, hasFrozen: boolean) {
  return {
    blockUnrelated: hasFrozen,
    blockContentWrites: status !== "idle" || hasFrozen,
  };
}

/** A reviewed conflict cannot clear a newer attempt or another conflict. */
export function canClearContentConflict(
  requestId: string,
  currentConflict: string | undefined,
  status: string,
  hasFrozen: boolean,
  marker: string | null,
) {
  return (
    status === "idle" &&
    currentConflict === requestId &&
    !hasFrozen &&
    marker === null
  );
}
