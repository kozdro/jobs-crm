export async function loadLatestAuditPage<T>(
  generation: { current: number },
  read: () => Promise<T>,
  success: (result: T) => void,
  failure: () => void,
): Promise<void> {
  const request = ++generation.current;
  try {
    const result = await read();
    if (generation.current === request) success(result);
  } catch {
    if (generation.current === request) failure();
  }
}
