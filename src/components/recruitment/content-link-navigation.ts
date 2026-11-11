export type LinkIdentity = { id: string; source: string };
type Row = LinkIdentity & { voided: boolean };
export async function findActiveLinkPage(
  loadPage: (page: number) => Promise<{ links: Row[]; hasMoreLinks: boolean }>,
  target: LinkIdentity,
): Promise<number | null> {
  let page = 1;
  for (;;) {
    const data = await loadPage(page);
    if (
      data.links.some(
        (row) =>
          row.id === target.id && row.source === target.source && !row.voided,
      )
    )
      return page;
    if (!data.hasMoreLinks) return null;
    page += 1;
  }
}
