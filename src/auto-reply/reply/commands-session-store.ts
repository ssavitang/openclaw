// Shared session-store helpers for command handlers that mutate sessions.
import type { SessionEntry } from "../../config/sessions.js";
import { patchSessionEntry } from "../../config/sessions/session-accessor.js";
import { applyAbortCutoffToSessionEntry, type AbortCutoff } from "./abort-cutoff.js";
import type { CommandHandler } from "./commands-types.js";

type CommandParams = Parameters<CommandHandler>[0];
type PersistSessionEntryParams = Pick<
  CommandParams,
  "sessionEntry" | "sessionStore" | "sessionKey" | "storePath"
>;

export async function persistSessionEntry(params: PersistSessionEntryParams): Promise<boolean> {
  if (!params.sessionEntry || !params.sessionStore || !params.sessionKey) {
    return false;
  }
  const sessionEntry = params.sessionEntry;
  sessionEntry.updatedAt = Date.now();
  params.sessionStore[params.sessionKey] = sessionEntry;
  if (params.storePath) {
    // Slash commands mutate one known session entry; skipping global session
    // maintenance avoids scanning the whole sessions directory for simple
    // command-only writes.
    await patchSessionEntry(
      { storePath: params.storePath, sessionKey: params.sessionKey },
      () => sessionEntry,
      {
        fallbackEntry: sessionEntry,
        replaceEntry: true,
        skipMaintenance: true,
      },
    );
  }
  return true;
}

export async function persistAbortTargetEntry(params: {
  entry?: SessionEntry;
  key?: string;
  sessionStore?: Record<string, SessionEntry>;
  storePath?: string;
  abortCutoff?: AbortCutoff;
}): Promise<boolean> {
  const { entry, key, sessionStore, storePath, abortCutoff } = params;
  if (!entry || !key || !sessionStore) {
    return false;
  }

  entry.abortedLastRun = true;
  applyAbortCutoffToSessionEntry(entry, abortCutoff);
  entry.updatedAt = Date.now();
  sessionStore[key] = entry;

  if (storePath) {
    await patchSessionEntry(
      { storePath, sessionKey: key },
      (nextEntry) => {
        nextEntry.abortedLastRun = true;
        applyAbortCutoffToSessionEntry(nextEntry, abortCutoff);
        nextEntry.updatedAt = Date.now();
        return nextEntry;
      },
      {
        fallbackEntry: entry,
        replaceEntry: true,
        skipMaintenance: true,
      },
    );
  }

  return true;
}
