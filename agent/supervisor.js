// Wendy's loop is supervised. A thrown crash starts a fresh attempt.
// A refused publish is not a crash; the planner returns confirmation denied.
export async function supervise(run, { restarts = 1, onCrash = () => {} } = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await run(attempt);
    } catch (err) {
      attempt += 1;
      onCrash(err, attempt);
      if (attempt > restarts) throw err;
    }
  }
}
