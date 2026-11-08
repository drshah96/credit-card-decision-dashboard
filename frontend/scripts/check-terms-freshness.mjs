// Prints whether the footer's TERMS_AS_OF month is too old, as GitHub Actions outputs.
// It never fails on age: a stale date opens an issue, and must not block a deploy.
import { pathToFileURL } from "node:url";
import { TERMS_AS_OF } from "../src/utils/routeMeta.js";

export const MAX_AGE_DAYS = 75;

export function termsAgeDays(termsAsOf, now = new Date()) {
  const parsed = new Date(`1 ${termsAsOf}`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`TERMS_AS_OF must be a month and year, got: ${termsAsOf}`);
  }
  return Math.floor((now.getTime() - parsed.getTime()) / 86_400_000);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const age = termsAgeDays(TERMS_AS_OF);
  console.log(`terms_as_of=${TERMS_AS_OF}`);
  console.log(`age_days=${age}`);
  console.log(`stale=${age >= MAX_AGE_DAYS}`);
}
