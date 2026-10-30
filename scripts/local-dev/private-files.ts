/** Local diagnostic files must never follow a developer-created symlink. */
import { open } from "node:fs/promises";
import { constants } from "node:fs";
export async function writePrivateFile(
  path: string,
  data: string | Buffer,
  append = false,
) {
  const file = await open(
    path,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_NOFOLLOW |
      (append ? constants.O_APPEND : constants.O_TRUNC),
    0o600,
  );
  try {
    if (!(await file.stat()).isFile())
      throw new Error("Local DEV private output must be a regular file");
    await file.chmod(0o600);
    await file.writeFile(data);
  } finally {
    await file.close();
  }
}
