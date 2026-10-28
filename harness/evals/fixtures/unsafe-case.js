// SYNTHETIC EVAL FIXTURE. Not application code.
// No server, real account, credentials or personal data. Do not reuse in product.

export async function getCase(request, repository) {
  const query = new URL(request.url).searchParams;
  const caseId = query.get("caseId");
  const ownerId = query.get("ownerId");
  return repository.findCase({ id: caseId, ownerId });
}

export async function correctStatus(recruitmentCase, nextStatus, repository) {
  recruitmentCase.status = nextStatus;
  recruitmentCase.history.push({
    type: "sent_application",
    occurredAt: new Date().toISOString(),
  });
  return repository.save(recruitmentCase);
}
