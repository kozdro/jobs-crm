import { mkdir, lstat } from "node:fs/promises";
export async function privateControlDirectory(path: string, create = false) {
  if (create)
    await mkdir(path, { mode: 0o700 }).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    });
  let stat;
  try {
    stat = await lstat(path);
  } catch (error) {
    if (!create && (error as NodeJS.ErrnoException).code === "ENOENT")
      return false;
    throw error;
  }
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 0o777) !== 0o700
  )
    throw new Error("Local DEV control directory identity/permissions refused");
  return true;
}
export async function assertControlSocket(path: string) {
  let stat;
  try {
    stat = await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  if (
    !stat.isSocket() ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 0o777) !== 0o600
  )
    throw new Error("Local DEV control socket identity/permissions refused");
  return true;
}
