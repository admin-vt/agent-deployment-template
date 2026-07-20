/**
 * Every per-client value lives here. A new deployment edits this file
 * (the runbook prompts for each value) and nothing else in src/.
 */
export const templateConfig = {
  /** Client / deployment identity */
  client: {
    name: 'VT PoC',
    slug: 'vt-poc',
  },

  /** The agent as end users meet it */
  agent: {
    id: 'assistant',
    name: 'VT Research Assistant',
    instructions: `You are a research assistant for VT PoC.
You answer questions using live web search (Firecrawl tools) and cite the sources you used.
For tasks that require running commands or producing files, use the workspace tools (workspace_init first, workspace_commit to persist results).`,
  },

  /**
   * Default model, OpenRouter model-router format: openrouter/<provider>/<model>.
   * Requires OPENROUTER_API_KEY. Swappable per client and per agent.
   */
  model: 'openrouter/anthropic/claude-sonnet-4.5',

  /** Composio toolkits enabled for this deployment (full catalog available) */
  composio: {
    toolkits: ['firecrawl'],
  },

  /** The agent's persistent filesystem: a git repo cloned into the sandbox */
  workspace: {
    /** owner/repo on GitHub; created by the runbook */
    repo: 'admin-vt/vt-poc-agent-workspace',
    branch: 'main',
  },

  /** Slack app identity + agent-view presentation (docs/slack-setup.md). */
  slack: {
    /** App display name, as the workspace sees it */
    displayName: 'VT Research Assistant',
    /** Bot handle (@mention name) */
    handle: 'vt-research-assistant',
    /** Shown under the agent's name in the Slack agent view (≤300 chars) */
    description: 'Research assistant for VT PoC — live web search with cited sources, plus a persistent git-backed workspace.',
    /** Rotating "thinking" status lines shown while the agent works */
    loadingMessages: ['Working on it…', 'Searching…', 'Reading sources…'],
    /** Up to 4 clickable prompts pinned when someone opens an agent thread */
    suggestedPrompts: [
      { title: 'Research a topic', message: 'Research this topic and cite your sources: ' },
      { title: "What's in the workspace?", message: 'List what is currently in your workspace repo.' },
    ],
  },

  /** Skills shipped with this deployment (standard SKILL.md directories) */
  skills: ['./skills/web-research'],
} as const;

export type TemplateConfig = typeof templateConfig;
