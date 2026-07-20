/** Parse the Slack allowlist from agent-account metadata. Bad/missing → []. */
export function parseAllowlist(metadata: Record<string, string> | undefined): string[] {
  try {
    const parsed = JSON.parse(metadata?.slackAllowlist ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
