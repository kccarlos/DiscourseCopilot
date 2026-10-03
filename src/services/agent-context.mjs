// Small helpers shared by the Ask-the-forum composer, the agent prompt and
// the answer view: the question's bounds and citation extraction.

export const AGENT_CONTEXT_LIMITS = Object.freeze({
  maxQuestionChars: 4000,
  maxSystemPromptChars: 12000
});

function text(value, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export function normalizeAgentQuestion(value) {
  return text(value, AGENT_CONTEXT_LIMITS.maxQuestionChars);
}

export function extractCitationIds(answer, sourceRefs = []) {
  const available = new Set(sourceRefs.map(source => text(source?.sourceId, 20)).filter(Boolean));
  const matches = String(answer || '').match(/\[S\d+\]/g) || [];
  return [...new Set(matches.map(match => match.slice(1, -1)).filter(id => available.has(id)))];
}
