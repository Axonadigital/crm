/**
 * Collapses concurrent calls into one in-flight execution.
 *
 * This exists for the refresh-token fallback path: Fortnox invalidates the old
 * refresh token every time it is used, so two parallel refreshes mean the
 * second one sends an already-dead token and gets `invalid_grant` — killing
 * requests on a connection that is otherwise perfectly healthy.
 *
 * Scope is one isolate. That is enough, because the realistic concurrency here
 * is a single edge function fanning out (Promise.all over invoices), not two
 * separate invocations racing.
 */
export function createSingleFlight<T>(): (
  task: () => Promise<T>,
) => Promise<T> {
  let inFlight: Promise<T> | null = null;

  return (task: () => Promise<T>): Promise<T> => {
    if (inFlight) return inFlight;

    const run = task();
    inFlight = run;

    // Clear on settle so the next caller starts a fresh run — including after
    // a failure, otherwise one network blip would poison every later call.
    void run
      .catch(() => undefined)
      .finally(() => {
        if (inFlight === run) inFlight = null;
      });

    return run;
  };
}
