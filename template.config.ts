/**
 * Every per-client value lives here. A new deployment edits this file
 * (the runbook prompts for each value) and nothing else in src/.
 *
 * Every CHANGE-ME must be replaced before deploy — scripts/deploy.sh and
 * scripts/slack-app-create.mjs refuse to run while any remain. Values
 * without CHANGE-ME are sensible defaults; change them per client as needed.
 */
export const templateConfig = {
  /** Client / deployment identity */
  client: {
    name: 'CHANGE-ME Client Name', // e.g. 'Acme Corp'
    slug: 'CHANGE-ME-slug', // kebab-case; names the Mastra/Doppler/Vercel projects, e.g. 'acme'
  },

  /** The agent as end users meet it */
  agent: {
    id: 'assistant',
    name: 'CHANGE-ME Agent Name', // e.g. 'Acme Research Assistant'
    // What the agent is for, which tools to lean on, how to answer. Example:
    //   You are an operations assistant for Acme. For tasks that require
    //   running commands or producing files, use the workspace tools
    //   (workspace_init first, workspace_commit to persist results) and tell
    //   the user exactly what you produced and where.
    instructions: `CHANGE-ME: the agent's role, tools to lean on, and answer style.`,
  },

  /**
   * Default model, OpenRouter model-router format: openrouter/<provider>/<model>.
   * Requires OPENROUTER_API_KEY. Swappable per client and per agent.
   */
  model: 'openrouter/anthropic/claude-sonnet-4.5',

  /**
   * Composio toolkits enabled for this deployment (full catalog available).
   * Deliberately empty by default — every tool is a per-client decision,
   * especially ones that ingest external content (web search, email, docs).
   * e.g. ['firecrawl'] for live web search.
   */
  composio: {
    toolkits: [] as string[],
  },

  /** The agent's persistent filesystem: a git repo cloned into the sandbox */
  workspace: {
    /** owner/repo on GitHub; created by the runbook */
    repo: 'CHANGE-ME-org/CHANGE-ME-slug-agent-workspace',
    branch: 'main',
  },

  /** Slack app identity + agent-view presentation (docs/slack-setup.md). */
  slack: {
    /** App display name, as the workspace sees it */
    displayName: 'CHANGE-ME Agent Name',
    /** Bot handle (@mention name) */
    handle: 'CHANGE-ME-handle',
    /** Shown under the agent's name in the Slack agent view (≤300 chars) */
    description: 'CHANGE-ME: one or two sentences on what this agent does for the team.',
    /** Rotating "thinking" status lines shown while the agent works */
    loadingMessages: ['Working on it…', 'Searching…', 'Reading sources…'],
    /** Up to 4 clickable prompts pinned when someone opens an agent thread */
    suggestedPrompts: [
      { title: "What's in the workspace?", message: 'List what is currently in your workspace repo.' },
      { title: 'Draft a document', message: 'Draft a document in the workspace about: ' },
    ],
  },

  /** Skills shipped with this deployment (standard SKILL.md directories) */
  skills: ['./skills/workspace'],
} as const;

export type TemplateConfig = typeof templateConfig;
