export function unavailableSelections(
  selected: string[],
  available: readonly { id: string }[],
): string[] {
  const ids = new Set(available.map((item) => item.id));
  return selected.filter((id) => !ids.has(id));
}

export function createRequestGeneration() {
  let generation = 0;
  return {
    next: () => ++generation,
    invalidate: () => {
      generation += 1;
    },
    isCurrent: (request: number) => request === generation,
  };
}
