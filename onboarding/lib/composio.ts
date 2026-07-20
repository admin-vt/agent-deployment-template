import { Composio } from '@composio/core';

/** Server-side Composio client — the same org/project the agent runs against. */
export const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });

/** Toolkits this deployment offers. Mirror of template.config.ts (empty = none). */
export const TOOLKITS = (process.env.COMPOSIO_TOOLKITS ?? '')
  .split(',')
  .map((t) => t.trim())
  .filter(Boolean);
