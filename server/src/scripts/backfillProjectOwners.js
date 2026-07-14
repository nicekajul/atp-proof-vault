/**
 * One-time migration: sets Projects.createdBy on rows created before that
 * column existed, using each project's "project_created" ActivityLog entry
 * as the source of truth for who actually made it. Falls back to the first
 * TEAM_ALLOWLIST entry if no such log entry exists (very old rows).
 *
 * Run once after redeploying apps-script/Code.gs with the createdBy column:
 *   node src/scripts/backfillProjectOwners.js
 */
import { getRows, updateRow } from '../lib/sheetsDb.js';
import { config } from '../config.js';

async function main() {
  const [projects, activity] = await Promise.all([getRows('Projects'), getRows('ActivityLog')]);
  const fallback = config.teamAllowlist[0] || '';

  let updated = 0;
  for (const p of projects) {
    if (p.createdBy) continue;
    const createdEvent = activity
      .filter((a) => a.projectId === p.id && a.type === 'project_created')
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];
    const owner = createdEvent?.actor || fallback;
    if (!owner) {
      console.warn(`No creator found for "${p.title}" (${p.id}) and no fallback configured — skipped.`);
      continue;
    }
    await updateRow('Projects', 'id', p.id, { createdBy: owner });
    console.log(`"${p.title}" -> ${owner}`);
    updated++;
  }
  console.log(`Done. Backfilled ${updated} of ${projects.length} project(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
