export const QUESTION_LEVELS = ['NB', 'TH', 'VD', 'VDC'];
export function emptyQuestionStats() {
  return { total: 0, types: { tn: 0, dcx: 0, tl: 0, lt: 0 }, levels: { NB: 0, TH: 0, VD: 0, VDC: 0 }, unclassified: 0 };
}
function addQuestion(stats, question) {
  stats.total += 1;
  const type = String(question.type || '').toLowerCase();
  const level = String(question.level || '').trim().toUpperCase();
  stats.types[type] = (stats.types[type] || 0) + 1;
  if (QUESTION_LEVELS.includes(level)) stats.levels[level] += 1;
  else stats.unclassified += 1;
}
// Compute both levels of the topic tree in one pass, without extra reads per card.
export function topicQuestionStats(questions = [], subtopics = []) {
  const parents = new Map(), children = new Map();
  const parentOf = new Map(subtopics.map(child => [String(child.id), String(child.topicId || '')]));
  for (const question of questions) {
    const childId = String(question.subtopicId || '');
    const parentId = parentOf.get(childId) || String(question.topicId || '');
    if (childId) {
      if (!children.has(childId)) children.set(childId, emptyQuestionStats());
      addQuestion(children.get(childId), question);
    }
    if (parentId) {
      if (!parents.has(parentId)) parents.set(parentId, emptyQuestionStats());
      addQuestion(parents.get(parentId), question);
    }
  }
  return { parents, children };
}
export function questionsInSubtopic(questions = [], subtopicId = '', filters = {}) {
  if (!subtopicId) return [];
  return questions.filter(question => String(question.subtopicId || '') === String(subtopicId)
    && (!filters.type || String(question.type || '').toLowerCase() === String(filters.type).toLowerCase())
    && (!filters.level || String(question.level || '').trim().toUpperCase() === String(filters.level).toUpperCase()));
}
