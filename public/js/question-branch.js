import { timestampMs } from "./utils.js?v=93";

// Prefer the branch containing the newest created node. Legacy nodes without
// creation dates use their codes as a stable, natural-order fallback.
export function newestQuestionBranch(tree, fixed = {}) {
  const { grades = [], subjects = [], topics = [], subtopics = [] } = tree;
  const created = row => timestampMs(row.createdAt || row.taoLuc || row.ngayTao);
  const newest = (rows, descendants = () => []) => [...rows].sort((a, b) => {
    const score = row => Math.max(created(row), ...descendants(row).map(created), 0);
    return score(b) - score(a) || String(b.code || b.id).localeCompare(String(a.code || a.id), "vi", { numeric: true });
  })[0];
  const grade = fixed.gradeId !== undefined ? grades.find(row => row.id === fixed.gradeId) : newest(grades, row => [...subjects, ...topics, ...subtopics].filter(child => child.gradeId === row.id));
  const gradeId = grade?.id || "";
  const subject = !gradeId ? undefined : fixed.subjectId !== undefined ? subjects.find(row => row.id === fixed.subjectId && row.gradeId === gradeId) : newest(subjects.filter(row => row.gradeId === gradeId), row => [...topics, ...subtopics].filter(child => child.subjectId === row.id));
  const subjectId = subject?.id || "";
  const topic = !subjectId ? undefined : fixed.topicId !== undefined ? topics.find(row => row.id === fixed.topicId && row.subjectId === subjectId) : newest(topics.filter(row => row.subjectId === subjectId), row => subtopics.filter(child => child.topicId === row.id));
  const topicId = topic?.id || "";
  const subtopic = !topicId ? undefined : fixed.subtopicId !== undefined ? subtopics.find(row => row.id === fixed.subtopicId && row.topicId === topicId) : newest(subtopics.filter(row => row.topicId === topicId));
  return { gradeId, subjectId, topicId, subtopicId: subtopic?.id || "" };
}
