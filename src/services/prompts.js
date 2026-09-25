/**
 * Prompt templates for AI summarization
 * Separated from ai-service.js for maintainability
 */

import { buildLanguageInstruction } from '../shared/response-language.mjs';

export { buildLanguageInstruction };

// Minimal prompts for models with very small context windows
export const MINIMAL_PROMPTS = {
  system: `Summarize this forum discussion: 1) original post key points 2) best replies 3) key takeaways.`,
  op: `Briefly summarize the original post's main points and questions.`,
  comments: `Summarize the key points and advice in these replies.`,
  combine: `Merge these partial summaries into one.`,
  final: `Combine the following into a structured summary.`
};

// Full prompts for comprehensive summarization
export const FULL_PROMPTS = {
  system: `You are an expert forum discussion analyzer. Your task is to provide comprehensive, structured summaries of Discourse forum discussions that clearly distinguish between different types of contributions.

Analyze the forum discussion with these guidelines:

**STRUCTURE ANALYSIS:**
- The FIRST post is always from the original author (OP)
- All SUBSEQUENT posts are from commenters/community members
- Identify the main topic, questions, or issues raised

**SUMMARY FORMAT:**

## 📝 Original Post Summary
**Author's Main Points:**
- [Key points, questions, or situations described by OP]
- [Any specific requests for advice or information]
- [Important context or background provided]

## 💬 Community Response Analysis
**Key Insights from Commenters:**
- [Most valuable advice or suggestions]
- [Different perspectives or approaches mentioned]
- [Warnings, tips, or important considerations]
- [Consensus opinions vs. conflicting viewpoints]

**Notable Contributors:**
- [Highlight particularly helpful or expert responses]

## 🎯 Key Takeaways
- [Main actionable advice]
- [Important warnings or considerations]
- [Consensus recommendations]
- [Unresolved questions or ongoing debates]

**TONE:** Professional yet accessible, focusing on practical value for the forum's readers.
**FOCUS:** Emphasize actionable insights, data points, and expert opinions that would be most valuable to readers.`,

  op: `You are an expert forum discussion analyzer. Summarize ONLY the original post (OP) from this forum discussion.

**OUTPUT FORMAT:**
## 📝 Original Post Summary
**Author's Main Points:**
- [Key points, questions, or situations described by OP]
- [Any specific requests for advice or information]
- [Important context or background provided]

**FOCUS:** Extract the core question/issue and key context from the original poster.`,

  comments: `You are an expert forum discussion analyzer. Summarize the following community comments/replies from a forum discussion.

**OUTPUT FORMAT:**
**Key Insights from Comments:**
- [Most valuable advice or suggestions]
- [Different perspectives mentioned]
- [Warnings, tips, or important considerations]

**FOCUS:** Extract actionable insights and expert opinions.`,

  combine: `You are an expert forum discussion analyzer. Combine these partial summaries of community comments into a cohesive analysis.

**OUTPUT FORMAT:**
## 💬 Community Response Analysis
**Key Insights from Commenters:**
- [Most valuable advice or suggestions]
- [Different perspectives or approaches mentioned]
- [Warnings, tips, or important considerations]
- [Consensus opinions vs. conflicting viewpoints]

**Notable Contributors:**
- [Highlight particularly helpful or expert responses]

**FOCUS:** Synthesize the key themes and actionable advice from all comment summaries.`,

  final: `You are an expert forum discussion analyzer. Given the summary of the original post and the analysis of community comments, create a final cohesive summary.

**OUTPUT FORMAT:**
[Include the OP summary as provided]

[Include the community analysis as provided]

## 🎯 Key Takeaways
- [Main actionable advice]
- [Important warnings or considerations]
- [Consensus recommendations]
- [Unresolved questions or ongoing debates]

**FOCUS:** Create a well-structured final summary that helps readers quickly understand the discussion.`
};

export const MAX_CUSTOM_SYSTEM_PROMPT_CHARS = 12000;

/**
 * Append the response-language instruction to a summarization prompt.
 * An undefined language leaves the prompt unchanged.
 * @param {string} prompt - The prompt text
 * @param {string} [language] - A response language value ('auto', 'en', …)
 * @returns {string} The prompt with a trailing LANGUAGE line
 */
export function withLanguageInstruction(prompt, language) {
  if (language === undefined) {
    return prompt;
  }
  return `${prompt}

**LANGUAGE:** ${buildLanguageInstruction(language, 'discussion')}`;
}

/**
 * Get the appropriate prompt based on type and whether minimal mode is enabled
 * @param {string} promptType - One of: 'system', 'op', 'comments', 'combine', 'final'
 * @param {boolean} useMinimal - Whether to use minimal prompts
 * @param {string} [language] - Response language; omitted means no language line
 * @returns {string} The prompt text
 */
export function getPrompt(promptType, useMinimal = false, language) {
  const prompts = useMinimal ? MINIMAL_PROMPTS : FULL_PROMPTS;
  return withLanguageInstruction(prompts[promptType] || prompts.system, language);
}

/**
 * Get the minimal version of a full prompt
 * @param {string} fullPrompt - The full prompt text (optionally with its language line)
 * @param {string} [language] - Response language used to build fullPrompt
 * @returns {string} The corresponding minimal prompt
 */
export function getMinimalPromptFor(fullPrompt, language) {
  for (const key of Object.keys(FULL_PROMPTS)) {
    if (withLanguageInstruction(FULL_PROMPTS[key], language) === fullPrompt) {
      return withLanguageInstruction(MINIMAL_PROMPTS[key], language);
    }
  }
  return withLanguageInstruction(MINIMAL_PROMPTS.system, language);
}

/**
 * Resolve a user-configured summarization system prompt.
 * Empty values intentionally restore the built-in prompt.
 */
export function normalizeCustomSystemPrompt(customPrompt) {
  if (typeof customPrompt !== 'string') {
    return '';
  }

  const trimmedPrompt = customPrompt.trim();
  return trimmedPrompt.slice(0, MAX_CUSTOM_SYSTEM_PROMPT_CHARS);
}

export function resolveSummarySystemPrompt(
  customPrompt,
  fallback = FULL_PROMPTS.system,
  language
) {
  return withLanguageInstruction(
    normalizeCustomSystemPrompt(customPrompt) || fallback,
    language
  );
}

const CUSTOM_HIERARCHICAL_PHASE_INSTRUCTIONS = {
  op: `Process only the original post. Preserve its main issue, questions,
important context, and any requested advice so they can be used in the final
summary.`,
  comments: `Process only the community replies. Preserve valuable advice,
different perspectives, warnings, concrete data points, and areas of agreement
or disagreement so they can be used in the final summary.`,
  combine: `Combine the partial community-reply analyses into one cohesive
intermediate analysis. Remove repetition without discarding material facts.`,
  final: `Synthesize the supplied original-post and community-reply analyses
into the final response requested by the custom system prompt. Do not refer to
the hierarchical processing steps.`
};

/**
 * Apply a custom system prompt to a hierarchical phase without changing the
 * phase-specific map/reduce workflow used for long discussions.
 */
export function getHierarchicalPrompt(promptType, customSystemPrompt, language) {
  if (!customSystemPrompt) {
    return withLanguageInstruction(
      FULL_PROMPTS[promptType] || FULL_PROMPTS.system,
      language
    );
  }

  const phasePrompt = CUSTOM_HIERARCHICAL_PHASE_INSTRUCTIONS[promptType]
    || CUSTOM_HIERARCHICAL_PHASE_INSTRUCTIONS.final;
  return withLanguageInstruction(`${customSystemPrompt}

---

The source discussion is being processed hierarchically. For this phase, follow
the additional task instructions below while continuing to honor the custom
system prompt above:

${phasePrompt}`, language);
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

/**
 * The part of a topic the model was given. Posts count the original post, so
 * replies are posts − 1 (like the side panel's "first N of M replies").
 * @param {object} [fetchResult] a topic fetch result or session-like object:
 *   { truncated, coveredPosts, totalPosts, pagesFetched }
 * @returns {{ truncated: boolean, coveredPosts: number|null, totalPosts: number|null, pagesRead: number|null }}
 */
export function describeTopicCoverage(fetchResult = {}) {
  const source = fetchResult || {};
  return {
    truncated: source.truncated === true,
    coveredPosts: positiveInteger(source.coveredPosts),
    totalPosts: positiveInteger(source.totalPosts),
    pagesRead: positiveInteger(source.pagesFetched ?? source.pagesRead)
  };
}

/**
 * A one-paragraph note telling the model that it only has the start of the
 * topic (page limit or the safety cap on topics of unknown size). Empty when
 * the whole topic was provided.
 * @param {object} [coverage] describeTopicCoverage() output
 * @param {'summary'|'answer'} [purpose]
 * @returns {string}
 */
export function buildCoverageNote(coverage, purpose = 'summary') {
  if (!coverage?.truncated) return '';
  const covered = positiveInteger(coverage.coveredPosts);
  const total = positiveInteger(coverage.totalPosts);
  const action = purpose === 'answer'
    ? 'If the answer could depend on later replies, say so, and don\'t claim to cover them.'
    : 'Say so in the summary and don\'t claim to cover later replies.';
  if (covered && total && total > covered) {
    const coveredReplies = Math.max(0, covered - 1).toLocaleString('en-US');
    const totalReplies = Math.max(0, total - 1).toLocaleString('en-US');
    return `Note: only the first ${coveredReplies} of ${totalReplies} replies were provided. ${action}`;
  }
  return `Note: only the first part of this topic was provided; the topic may continue beyond the provided replies. ${action}`;
}
