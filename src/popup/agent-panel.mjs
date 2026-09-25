// The topic view's Agent surfaces: the inline answer panel (#agentPanel)
// for the current forum's run and the pill (#agentPill) pointing at a run on
// another forum. Which run shows where comes from selectAgentRunView().
import { isAgentActivityTerminal } from '../shared/agent-activity.mjs';
import { agentRecentWindowMs, isAgentAnswerUnopened, selectAgentRunView } from './agent-runs.mjs';
import { applyForumHue, createForumChip } from './forum-ui.mjs';

const $ = id => document.getElementById(id);

export class AgentPanel {
  /**
   * @param {object} deps
   * @param {object} deps.state shared panel state (pageContext)
   * @param {object} deps.runs AgentRuns
   * @param {object} deps.forums ForumDirectory
   * @param {object} deps.view AgentAnswerView
   * @param {() => object} deps.getRetention resolveRetention() of the saved preferences
   */
  constructor({ state, runs, forums, view, getRetention }) {
    this.state = state;
    this.runs = runs;
    this.forums = forums;
    this.view = view;
    this.getRetention = getRetention;
    this.pillActivityId = '';
  }

  get root() {
    return $('agentPanel');
  }

  get details() {
    return this.root.querySelector('.agent-panel-details');
  }

  isTopicViewVisible() {
    return !$('topicView').classList.contains('hidden');
  }

  // Renders the panel (unless the composer has its place) and the pill;
  // returns the selectAgentRunView() result.
  render({ composerOpen = false } = {}) {
    const panel = this.root;
    const pill = $('agentPill');
    const siteUrl = this.state.pageContext?.siteUrl || '';
    const view = selectAgentRunView(this.runs.records(), siteUrl, {
      preferredId: this.runs.currentRuns.get(siteUrl) || '',
      windowMs: agentRecentWindowMs(this.getRetention())
    });

    const showPanel = view.mode === 'panel' && !composerOpen;
    panel.classList.toggle('hidden', !showPanel);
    $('topicView').classList.toggle('has-agent-panel', view.mode === 'panel');
    if (showPanel) {
      if (panel.dataset.activityId !== view.activity.activityId) {
        // Answers already read on an earlier visit start collapsed.
        this.details.open = !isAgentActivityTerminal(view.activity.status) || isAgentAnswerUnopened(view.activity);
      }
      this.renderHeader(view.activity);
      this.view.render(panel, view.activity, { mode: 'inline' });
      if (this.details.open && this.isTopicViewVisible()) {
        void this.runs.markOpened(view.activity);
      }
    } else if (view.mode !== 'panel') {
      delete panel.dataset.activityId;
      delete panel.dataset.taskId;
    }

    this.pillActivityId = view.mode === 'pill' ? view.activity.activityId : '';
    pill.classList.toggle('hidden', view.mode !== 'pill');
    if (view.mode === 'pill') {
      const forumName = this.forums.label(view.activity.siteUrl, view.activity.forumName);
      const text = {
        running: `Researching on ${forumName}…`,
        waiting: `${forumName} needs you to log in`,
        ready: `Answer ready from ${forumName}`,
        failed: `Research on ${forumName} failed`
      }[view.kind];
      $('agentPillText').textContent = text;
      pill.dataset.kind = view.kind;
      pill.setAttribute('aria-label', `${text}. View answer`);
      applyForumHue(pill, view.activity.siteUrl);
    }
    return view;
  }

  renderHeader(activity) {
    const panel = this.root;
    const question = this.view.part(panel, 'question');
    question.textContent = activity.question || activity.title;
    question.title = activity.question || activity.title;
    const forumName = this.forums.label(activity.siteUrl, activity.forumName);
    const forumSlot = this.view.part(panel, 'forum');
    if (forumSlot.textContent !== forumName) {
      forumSlot.replaceChildren(createForumChip(activity.siteUrl, forumName));
    }
    this.view.part(panel, 'meta').textContent = this.view.statusSummary(activity);
  }

  focus() {
    const panel = this.root;
    if (panel.classList.contains('hidden')) {
      return;
    }
    this.details.open = true;
    panel.querySelector('.agent-panel-summary').focus({ preventScroll: true });
    panel.scrollIntoView({ block: 'nearest' });
  }
}
