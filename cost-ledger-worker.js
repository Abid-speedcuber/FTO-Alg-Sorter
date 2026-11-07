import { evaluateEntry } from './cost-ledger.js';
import { rankCase, rankGlobal } from './case-rankings.js';

self.addEventListener('message', ({ data }) => {
  const { requestId, entries, cases, global = false, seedScores = {} } = data;
  const entriesById = Object.fromEntries(entries.map(entry => [entry.id, entry]));
  const allScores = { ...seedScores };
  for (const caseInfo of cases) {
    const scores = Object.fromEntries(caseInfo.entryIds.map(id => [id, evaluateEntry(entriesById[id])]));
    const ranked = rankCase(caseInfo, entriesById, scores);
    Object.assign(allScores, scores);
    self.postMessage({ requestId, scores, ranked });
  }
  if (global) self.postMessage({ requestId, globalRanking: rankGlobal(entries, allScores) });
  self.postMessage({ requestId, done: true });
});
