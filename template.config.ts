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

  /** Skills shipped with this deployment (standard SKILL.md directories) */
  skills: ['./skills/web-research'],
} as const;

export type TemplateConfig = typeof templateConfig;
