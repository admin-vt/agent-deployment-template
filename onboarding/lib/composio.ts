import { Composio } from '@composio/core';

/** Server-side Composio client — the same org/project the agent runs against. */
export const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });

/** Toolkits this deployment offers end users. Mirror of template.config.ts. */
export const TOOLKITS = (process.env.COMPOSIO_TOOLKITS ?? 'firecrawl').split(',');
