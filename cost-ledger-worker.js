import { evaluateEntry } from './cost-ledger.js';
import { rankCase } from './case-rankings.js';

self.addEventListener('message', ({ data }) => {
  const { requestId, entries, cases } = data;
  const entriesById = Object.fromEntries(entries.map(entry => [entry.id, entry]));
  for (const caseInfo of cases) {
    const scores = Object.fromEntries(caseInfo.entryIds.map(id => [id, evaluateEntry(entriesById[id])]));
    const ranked = rankCase(caseInfo, entriesById, scores);
    self.postMessage({ requestId, scores, ranked });
  }
  self.postMessage({ requestId, done: true });
});
