// Positions are ordinal within one case. Equal costs keep source-row order,
// making changes reproducible without manufacturing gains for ties.
export const RANKING_RULE = 'Within each case: cost ascending, ties by source row; unavailable executions last and unranked.';

export function buildCaseIndex(section) {
  const groups = new Map();
  for (const entry of section.entries) {
    if (!groups.has(entry.caseNumber)) groups.set(entry.caseNumber, {
      caseNumber: entry.caseNumber, caseName: entry.caseName, entries: []
    });
    groups.get(entry.caseNumber).entries.push(entry);
  }
  return [...groups.values()].map(({ entries, ...group }) => ({
    ...group,
    entryIds: entries.slice().sort((a, b) => a.baseline.cost - b.baseline.cost || a.sourceRow - b.sourceRow).map(entry => entry.id)
  }));
}

export function rankCase(caseInfo, entriesById, scores) {
  const baselineRanks = new Map(caseInfo.entryIds.map((id, index) => [id, index + 1]));
  const available = id => scores[id]?.status === 'ok' && Number.isFinite(scores[id].cost);
  const entryIds = caseInfo.entryIds.slice().sort((a, b) => {
    if (available(a) !== available(b)) return available(a) ? -1 : 1;
    return (available(a) ? scores[a].cost - scores[b].cost : 0) || entriesById[a].sourceRow - entriesById[b].sourceRow;
  });
  for (const [index, id] of entryIds.entries()) {
    if (!scores[id]) continue;
    scores[id].baselineRank = baselineRanks.get(id);
    scores[id].currentRank = available(id) ? index + 1 : null;
    scores[id].positionsGained = available(id) ? baselineRanks.get(id) - (index + 1) : null;
  }
  return { caseNumber: caseInfo.caseNumber, caseName: caseInfo.caseName, entryIds };
}

export function rankSection(section, scores) {
  const entriesById = Object.fromEntries(section.entries.map(entry => [entry.id, entry]));
  return buildCaseIndex(section).map(caseInfo => rankCase(caseInfo, entriesById, scores));
}
