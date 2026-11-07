// Derive presentation indexes without changing source costs or rescoring history.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildCaseIndex, rankSection, RANKING_RULE } from '../case-rankings.js';
const root = new URL('../', import.meta.url);
const bytes = await readFile(new URL('data/algorithm-baseline.json', root));
const baseline = JSON.parse(bytes);
const hash = createHash('sha256').update(bytes).digest('hex');
const history = JSON.parse(await readFile(new URL('data/cost-history.json', root)));
if (hash !== history.baselineSha256) throw new Error('Baseline hash mismatch; restore original source data.');
const index = {
  schemaVersion: 1, baselineSha256: hash, rankingRule: RANKING_RULE,
  sections: baseline.sections.map(section => ({ id: section.id, cases: buildCaseIndex(section) }))
};
for (const revision of history.revisions) {
  for (const section of baseline.sections) {
    const url = new URL(revision.sectionFiles[section.id], root);
    const saved = JSON.parse(await readFile(url));
    saved.cases = rankSection(section, saved.scores);
    saved.rankingRule = RANKING_RULE;
    await writeFile(url, JSON.stringify(saved) + '\n');
  }
}
await writeFile(new URL('data/case-index.json', root), JSON.stringify(index, null, 2) + '\n');
console.log(`Prepared ${index.sections.reduce((sum, section) => sum + section.cases.length, 0)} case cards and saved revision rankings. Baseline bytes untouched.`);
