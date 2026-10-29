import {
  startTarget,
  stopTarget,
  migrateTarget,
  snapshot,
  preflight,
} from "./f2.ts";
const [action, id] = process.argv.slice(2);
if (!id)
  throw new Error(
    "Usage: node scripts/db/cli.ts start|stop|migrate|snapshot|preflight <synthetic-id> [--remove]",
  );
if (action === "start") {
  const t = await startTarget(id);
  console.log(
    JSON.stringify({
      id: t.id,
      projectId: t.projectId,
      apiUrl: t.apiUrl,
      ports: t.ports,
    }),
  );
} else if (action === "stop")
  await stopTarget(id, { remove: process.argv.includes("--remove") });
else if (action === "migrate")
  console.log(JSON.stringify(await migrateTarget(id)));
else if (action === "snapshot")
  console.log(JSON.stringify(await snapshot(id), null, 2));
else if (action === "preflight")
  console.log(JSON.stringify(await preflight(id), null, 2));
else throw new Error("Unsupported local F2 operation");
