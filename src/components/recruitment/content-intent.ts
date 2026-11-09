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
