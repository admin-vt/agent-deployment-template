import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { createSlackAdapter } from '@chat-adapter/slack';
import { templateConfig } from '../../../template.config';
import { getAgentTools } from '../../lib/composio';
import { workspaceTools } from '../../lib/workspace';
import { getModelApiKey, getSlackAllowlist, resolveSlackEmail } from '../../lib/identity';

/**
 * The deployment's agent. Everything client-specific (name, instructions,
 * model, toolkits, skills) comes from template.config.ts. Identity model:
 * one agent account, humans on a Slack allowlist (docs/identity-model.md).
 */

/** Only allowlisted senders reach the agent. Default closed. */
const allowlistGuard: import('@mastra/core/channels').ChannelHandler = async (
  thread,
  message,
  defaultHandler,
) => {
  const email = await resolveSlackEmail(message.author.userId);
  if (email === null) {
    await thread.post(
      "I couldn't verify your identity — if this persists, the Slack app may be missing the `users:read.email` permission (reinstall required).",
    );
    return;
  }
  const allowlist = await getSlackAllowlist();
  if (!allowlist.includes(email)) {
    await thread.post(
      'Sorry — I can only chat with approved teammates. Ask the account holder to add you on the onboarding page.',
    );
    return;
  }
  await defaultHandler(thread, message);
};

export const assistant = new Agent({
  id: templateConfig.agent.id,
  name: templateConfig.agent.name,
  instructions: templateConfig.agent.instructions,
  // BYOK: the client's OpenRouter key from the agent account, dev key fallback.
  model: async () => ({
    id: templateConfig.model,
    apiKey: await getModelApiKey(),
  }),
  memory: new Memory({
    options: { lastMessages: 20 },
  }),
  // Slack attaches only when its credentials exist, so deployments without
  // Slack (or before app install) run unchanged.
  ...(process.env.SLACK_BOT_TOKEN && process.env.SLACK_SIGNING_SECRET
    ? {
        channels: {
          adapters: { slack: createSlackAdapter() },
          handlers: {
            onDirectMessage: allowlistGuard,
            onMention: allowlistGuard,
          },
        },
      }
    : {}),
  skills: [...templateConfig.skills],
  tools: async () => ({ ...(await getAgentTools()), ...workspaceTools }),
});
