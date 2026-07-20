import { Mastra } from '@mastra/core';
import { assistant } from './agents/assistant';

export const mastra = new Mastra({
  agents: { assistant },
});
