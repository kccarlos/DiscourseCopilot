// The "Ask the forum" agent loop. One turn (the question, or a follow-up):
//
//   plan ──▶ the model answers with one JSON action ──▶ run the tool ──▶ observation ─┐
//    ▲                                                                                │
//    └──────────────────────────── saved after every step ◀───────────────────────────┘
//   final_answer, or the step budget is spent ──▶ one streamed call writes the answer
//
// Everything the loop needs to continue lives in the activity record (the
// steps, the transcript the model has seen, the source cards, the turns), and
// it is saved after every step, so a restarted service worker picks up at the
// last completed step: a step still marked "running" had its action chosen but
// no observation yet, and is run again instead of asking the model again.
import { executeAgentTool, isRecoverableToolError, AgentToolError } from './agent-tools.mjs';
import { ForumToolError } from './forum-tools.mjs';
import { planAgentStep, AgentActionParseError } from '../services/agent-action.mjs';
import {
  FINAL_ANSWER_TOOL,
  actionMessage,
  buildAgentSystemPrompt,
  finalAnswerInstruction,
  followUpMessage,
  goalMessage,
  observationMessage
} from '../services/agent-prompt.mjs';
import { clampAgentBudget } from '../shared/preferences.mjs';
import { agentStepText, compactAgentTranscript, MAX_AGENT_STEPS } from '../shared/agent-activity.mjs';
import { forumDisplayName, normalizeSiteUrl } from '../shared/forum-site.mjs';
import { isAbortError } from '../shared/rate-limit-retry.mjs';

const DETAIL_CHARS = 1500;

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw Object.assign(new Error('Task cancelled'), { name: 'AbortError' });
  }
}

function progressOf(stepsUsed, budget, sourceCount) {
  return {
    percent: Math.min(95, Math.round((stepsUsed / budget.maxSteps) * 100)),
    completedSteps: stepsUsed,
    totalSteps: budget.maxSteps,
    sourceCount,
    etaMs: null
  };
}

// What the panel shows for a failed tool call, kept short; the model gets the full message.
function errorText(error) {
  return String(error?.message || error || 'The tool failed').slice(0, 500);
}

/**
 * Runs the current turn of an agent run to its answer.
 * @param {object} options
 * @param {object} options.activity the run's saved record (steps, transcript, turns, sourceRefs)
 * @param {(patch: object, options?: {durable?: boolean}) => Promise<void>} options.save writes a patch to the record
 * @param {(system: string, messages: Array) => Promise<string>} options.planAction one planning call
 * @param {(request: {system: string, messages: Array, onStream: Function}) => Promise<string>} options.writeAnswer the streamed answer call
 * @param {object} options.toolClient ForumToolClient bound to the run's forum
 * @param {{list: Function, get: Function}} options.savedSummaries
 * @param {AbortSignal} [options.signal]
 * @param {object} options.budget { maxSteps, maxTopicReads, maxCharsPerRead } for this turn
 * @param {(patch: object, options?: object) => Promise<void>} [options.report] task progress (throws once cancelled)
 * @returns {Promise<{ patch: object, answer: string, outOfBudget: boolean }>} the record fields that finish the turn
 */
export async function runAgentLoop({
  activity,
  save,
  planAction,
  writeAnswer,
  toolClient,
  savedSummaries,
  signal,
  budget: requestedBudget,
  forumName = '',
  responseLanguage,
  customInstructions = '',
  report = async () => {},
  onStream = () => {},
  now = () => Date.now()
}) {
  // Source links are always built from the tool client's forum, never from model output.
  const siteUrl = normalizeSiteUrl(toolClient?.siteUrl);
  if (!siteUrl) {
    throw new ForumToolError('INVALID_ARGUMENT', 'A valid forum site URL is required', { retryable: false });
  }
  const budget = clampAgentBudget(requestedBudget);
  const system = buildAgentSystemPrompt({
    forumName: forumDisplayName(siteUrl, forumName) || 'the forum',
    siteUrl,
    budget,
    responseLanguage,
    customInstructions,
    now: now()
  });

  const turnIndex = Math.max(0, (activity.turns.length || 1) - 1);
  // A new run has no turns yet; its first one is the goal. (agentTurnsOf
  // would stand in a finished-looking turn, which this loop must not see.)
  const turns = activity.turns.length
    ? activity.turns.map(turn => ({ ...turn }))
    : [{ id: activity.taskId, question: activity.question, answer: '', startedAt: 0, completedAt: 0 }];
  const turn = turns[turnIndex];
  if (!turn?.question) {
    throw new Error('Agent question is required');
  }
  const steps = activity.steps.map(step => ({ ...step }));
  const transcript = activity.transcript.map(message => ({ ...message }));
  const sources = activity.sourceRefs.map(source => ({ ...source }));

  const turnSteps = () => steps.filter(step => step.turn === turnIndex);
  const stepsUsed = () => turnSteps().filter(step => step.status !== 'running').length;
  const ctx = {
    siteUrl,
    toolClient,
    budget,
    sources,
    savedSummaries,
    // Topics already read for this question (re-reading one is free).
    turnReads: new Set(
      turnSteps()
        .filter(step => step.tool === 'read_topic' && step.status === 'completed' && step.topicId)
        .map(step => step.topicId)
    )
  };

  const persist = (patch = {}, { durable = true } = {}) =>
    save(
      {
        steps,
        transcript: compactAgentTranscript(transcript),
        sourceRefs: sources,
        turns,
        budget,
        ...patch
      },
      { durable }
    );

  // The turn's opening message goes in once; a resumed turn already has it.
  if (!turn.startedAt) {
    if (!transcript.length && turnIndex > 0) {
      // A follow-up on a run from before follow-ups: no saved conversation, so
      // rebuild the beginning from its question and answer.
      transcript.push(goalMessage(turns[0].question), actionMessage({ tool: FINAL_ANSWER_TOOL, arguments: { answer: turns[0].answer } }));
    }
    turn.transcriptStart = transcript.length;
    transcript.push(turnIndex === 0 ? goalMessage(turn.question) : followUpMessage(turn.question));
    turn.startedAt = now();
    await persist({ phase: 'planning', statusText: 'Planning…', progress: progressOf(0, budget, sources.length) });
  }

  let gist = '';
  let outOfBudget = false;

  while (true) {
    throwIfAborted(signal);
    let step = turnSteps().find(candidate => candidate.status === 'running') || null;
    let action;

    if (step) {
      // Restarted mid-step: the action was chosen, the observation never saved.
      action = { tool: step.tool, arguments: { ...step.args }, reason: step.reason };
    } else {
      if (stepsUsed() >= budget.maxSteps || steps.length >= MAX_AGENT_STEPS) {
        outOfBudget = true;
        break;
      }
      await persist(
        {
          phase: 'planning',
          statusText: `Planning step ${stepsUsed() + 1} of ${budget.maxSteps}…`,
          progress: progressOf(stepsUsed(), budget, sources.length)
        },
        { durable: false }
      );
      try {
        ({ action } = await planAgentStep({ complete: messages => planAction(system, messages), transcript }));
      } catch (error) {
        if (error instanceof AgentActionParseError) {
          steps.push({
            id: `step-${steps.length + 1}`,
            turn: turnIndex,
            tool: 'plan',
            args: {},
            reason: '',
            status: 'failed',
            detail: '',
            title: '',
            resultCount: null,
            error: error.message,
            startedAt: now(),
            completedAt: now()
          });
          await persist({ phase: 'failed', statusText: 'The model did not reply with a valid action' });
        }
        throw error;
      }
      throwIfAborted(signal);
      if (action.tool === FINAL_ANSWER_TOOL) {
        gist = String(action.arguments.answer || '').trim();
        break;
      }
      step = {
        id: `step-${steps.length + 1}`,
        turn: turnIndex,
        tool: action.tool,
        args: Object.fromEntries(Object.entries(action.arguments).slice(0, 8)),
        reason: action.reason,
        status: 'running',
        detail: '',
        title: '',
        resultCount: null,
        error: '',
        startedAt: now(),
        completedAt: 0
      };
      steps.push(step);
    }

    await persist({
      phase: 'running_tool',
      statusText: agentStepText(step),
      progress: progressOf(stepsUsed(), budget, sources.length)
    });

    let observation;
    let isError = false;
    try {
      const result = await executeAgentTool(action, ctx);
      observation = result.observation;
      step.status = 'completed';
      step.resultCount = result.resultCount ?? null;
      if (result.topicId) step.topicId = result.topicId;
      if (result.sourceId) step.sourceId = result.sourceId;
      if (result.title) step.title = result.title;
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) {
        throw error;
      }
      if (!isRecoverableToolError(error)) {
        // A forum that needs the user, a browser without access, or something
        // unexpected. The step stays "running": on Continue it is run again,
        // and the executor settles it if the run fails instead.
        throw error;
      }
      isError = true;
      step.status = 'failed';
      step.error = errorText(error);
      observation = error instanceof AgentToolError ? error.message : `The request failed: ${errorText(error)}`;
    }
    step.completedAt = now();
    step.detail = observation.slice(0, DETAIL_CHARS);
    transcript.push(actionMessage({ ...action, reason: step.reason }), observationMessage(action.tool, observation, isError));
    await persist({ progress: progressOf(stepsUsed(), budget, sources.length) });
    // Throws once the task was cancelled.
    await report({ phase: 'running_tool', statusText: agentStepText(step), progress: progressOf(stepsUsed(), budget, sources.length) });
  }

  // ---- The answer: one streamed call over the same conversation ----
  throwIfAborted(signal);
  await persist({ phase: 'answering', statusText: 'Writing the answer…', progress: progressOf(stepsUsed(), budget, sources.length) });
  await report({ phase: 'answering', statusText: 'Writing the answer…', progress: progressOf(stepsUsed(), budget, sources.length) });
  const messages = [...transcript];
  if (gist) {
    messages.push(actionMessage({ tool: FINAL_ANSWER_TOOL, arguments: { answer: gist }, reason: '' }));
  }
  messages.push(finalAnswerInstruction(sources, { outOfBudget }));
  let answer = String(await writeAnswer({ system, messages, onStream })).trim();
  throwIfAborted(signal);
  if (!answer) {
    answer = gist;
  }
  if (!answer) {
    throw new Error('No Agent answer was generated');
  }

  transcript.push(actionMessage({ tool: FINAL_ANSWER_TOOL, arguments: { answer }, reason: '' }));
  turn.answer = answer;
  turn.completedAt = now();
  if (outOfBudget) {
    turn.outOfBudget = true;
  }
  return {
    answer,
    outOfBudget,
    patch: {
      steps,
      transcript: compactAgentTranscript(transcript),
      sourceRefs: sources,
      turns,
      budget,
      answer,
      answerStatus: 'answered'
    }
  };
}
