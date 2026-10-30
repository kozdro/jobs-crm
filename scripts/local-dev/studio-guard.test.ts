import { test } from "node:test";
import assert from "node:assert/strict";
import { guardCreate } from "../db/docker-guard.ts";
const projectId = "jobs-crm-dev-0123456789ab",
  workdir = "/synthetic/checkout/.local-dev";
const scope = {
  projectId,
  workdir,
  networkId: `network-${projectId}`,
  publishedPorts: { "3000/tcp": "56723" },
  studioSnippetsVolume: `supabase_snippets_${projectId}`,
};
const source = `${workdir}/supabase/snippets`;
function body(bind: string) {
  return {
    Image: "public.ecr.aws/supabase/studio:2026.10.19-sha-b375769",
    Labels: { "com.supabase.cli.project": projectId },
    HostConfig: {
      NetworkMode: scope.networkId,
      Binds: [bind],
      PortBindings: { "3000/tcp": [{ HostPort: "56723" }] },
    },
    NetworkingConfig: { EndpointsConfig: { [scope.networkId]: {} } },
  };
}
test("pinned Studio snippets bind becomes an owned persistent volume without host access", () => {
  const result = guardCreate(
    body(`${source}:${source}:rw`),
    `supabase_studio_${projectId}`,
    scope,
  );
  assert.deepEqual((result.HostConfig as { Binds: string[] }).Binds, [
    `${scope.studioSnippetsVolume}:${source}:rw`,
  ]);
});
test("Studio mapping refuses other host paths, modes, destinations, images and services", () => {
  for (const bind of [
    `/var/run/docker.sock:${source}:rw`,
    `${source}:/host:rw`,
    `${source}:${source}:ro`,
    `${source}/../private:${source}:rw`,
  ])
    assert.throws(() =>
      guardCreate(body(bind), `supabase_studio_${projectId}`, scope),
    );
  assert.throws(() =>
    guardCreate(
      { ...body(`${source}:${source}:rw`), Image: "supabase/studio:latest" },
      `supabase_studio_${projectId}`,
      scope,
    ),
  );
  assert.throws(() =>
    guardCreate(
      body(`${source}:${source}:rw`),
      `supabase_auth_${projectId}`,
      scope,
    ),
  );
  assert.throws(() =>
    guardCreate(
      body(`${source}:${source}:rw`),
      `supabase_studio_${projectId}`,
      { ...scope, studioSnippetsVolume: "foreign" },
    ),
  );
  assert.throws(() =>
    guardCreate(
      body(`${source}:${source}:rw`),
      `supabase_studio_${projectId}`,
      { ...scope, studioSnippetsVolume: undefined },
    ),
  );
});
