import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { createSlackAdapter } from '@chat-adapter/slack';
import { templateConfig } from '../../../template.config';
import { defaultUserId, getUserTools } from '../../lib/composio';
import { workspaceTools } from '../../lib/workspace';

/**
 * The deployment's agent. Everything client-specific (name, instructions,
 * model, toolkits, skills) comes from template.config.ts.
 *
 * Tools resolve per request: the user's Composio session (their connected
 * accounts, the toolkit catalog, the sandbox) plus the workspace tools.
 */
export const assistant = new Agent({
  id: templateConfig.agent.id,
  name: templateConfig.agent.name,
  instructions: [
    templateConfig.agent.instructions,
    `When using workspace or sandbox tools, pass userId="${defaultUserId()}" unless the request context provides one.`,
  ].join('\n\n'),
  model: templateConfig.model,
  memory: new Memory({
    options: { lastMessages: 20 },
  }),
  // Slack attaches only when its credentials exist, so deployments without
  // Slack (or before app install) run unchanged.
  ...(process.env.SLACK_BOT_TOKEN && process.env.SLACK_SIGNING_SECRET
    ? { channels: { adapters: { slack: createSlackAdapter() } } }
    : {}),
  skills: [...templateConfig.skills],
  tools: async ({ requestContext }) => {
    const userId =
      (requestContext?.get?.('userId') as string | undefined) ?? defaultUserId();
    const composioTools = await getUserTools(userId);
    return { ...composioTools, ...workspaceTools };
  },
});
