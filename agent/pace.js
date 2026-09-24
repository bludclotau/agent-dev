// A few seconds of jitter before a page fetch, and again between page steps.
export function paceMs(random = Math.random) {
  const min = Number(process.env.WENDY_PACE_MIN_MS || 3000);
  const max = Number(process.env.WENDY_PACE_MAX_MS || 7000);
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return low + random() * (high - low);
}

export async function pace(deps = {}) {
  if (deps.pace) return deps.pace();
  const wait = paceMs(deps.random || Math.random);
  const sleep = deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  await sleep(wait);
  return wait;
}
