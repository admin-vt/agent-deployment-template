import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { templateConfig } from '../../template.config';
import { getAgentSession } from './composio';

/**
 * The agent's persistent filesystem: a git repo cloned into the Composio
 * Remote Sandbox at /mnt/files/workspace. Sandboxes are ephemeral; the repo
 * is the only durable state — work lands by committing and pushing.
 *
 * Verified behavior (V4): the sandbox backend occasionally dispatches a
 * command twice concurrently, so every command here is idempotent and
 * lock-tolerant.
 */
const WORKSPACE_DIR = '/mnt/files/workspace';

function remoteUrl(): string {
  const token = process.env.GITHUB_TOKEN;
  const { repo } = templateConfig.workspace;
  return `https://x-access-token:${token}@github.com/${repo}.git`;
}

async function bash(command: string) {
  const session = await getAgentSession();
  const res = await session.execute('COMPOSIO_REMOTE_BASH_TOOL', { command });
  const data = (res?.data ?? {}) as { stdout?: string; stderr?: string };
  return {
    stdout: data.stdout ?? '',
    stderr: data.stderr ?? '',
    error: res?.error ?? null,
  };
}

export const workspaceInit = createTool({
  id: 'workspace_init',
  description:
    'Ensure the workspace repository is cloned into the sandbox at /mnt/files/workspace and up to date. Call once before other workspace operations.',
  inputSchema: z.object({}),
  outputSchema: z.object({ output: z.string() }),
  execute: async () => {
    const { branch } = templateConfig.workspace;
    // Self-healing: clear stale locks from interrupted duplicates; if the
    // clone is corrupt (e.g. a race left an invalid HEAD), re-clone fresh.
    const result = await bash(
      `[ -d ${WORKSPACE_DIR}/.git ] && rm -f ${WORKSPACE_DIR}/.git/*.lock; ` +
        `git -C ${WORKSPACE_DIR} rev-parse --verify HEAD >/dev/null 2>&1 || rm -rf ${WORKSPACE_DIR}; ` +
        `[ -d ${WORKSPACE_DIR}/.git ] || git clone -q --branch ${branch} ${remoteUrl()} ${WORKSPACE_DIR}; ` +
        `cd ${WORKSPACE_DIR} && git pull -q --ff-only 2>/dev/null; echo WORKSPACE_READY && ls -1 | head -20`,
    );
    return { output: result.stdout || result.stderr || String(result.error) };
  },
});

export const workspaceRun = createTool({
  id: 'workspace_run',
  description:
    'Run a shell command inside the workspace directory in the sandbox. Commands must be safe to run twice (the backend may retry).',
  inputSchema: z.object({
    command: z.string().describe('Shell command to run from the workspace root'),
  }),
  outputSchema: z.object({ stdout: z.string(), stderr: z.string() }),
  execute: async ({ command }) => {
    const result = await bash(`cd ${WORKSPACE_DIR} && (${command})`);
    return { stdout: result.stdout, stderr: result.stderr };
  },
});

export const workspaceCommit = createTool({
  id: 'workspace_commit',
  description:
    'Commit and push all workspace changes to the workspace repository. This is how work becomes durable — sandboxes are ephemeral.',
  inputSchema: z.object({
    message: z.string().describe('Commit message describing the work'),
  }),
  outputSchema: z.object({ output: z.string() }),
  execute: async ({ message }) => {
    const { branch } = templateConfig.workspace;
    const safeMessage = message.replace(/"/g, "'");
    const result = await bash(
      `cd ${WORKSPACE_DIR} && rm -f .git/index.lock .git/config.lock && ` +
        `git config user.email agent@${templateConfig.client.slug}.local && ` +
        `git config user.name "${templateConfig.agent.name}" && git add -A && ` +
        `(git diff --cached --quiet || git commit -q -m "${safeMessage}") && ` +
        `git push -q origin HEAD:${branch} && echo COMMIT_PUSHED && git log --oneline -1`,
    );
    return { output: result.stdout || result.stderr || String(result.error) };
  },
});

export const workspaceTools = {
  workspaceInit,
  workspaceRun,
  workspaceCommit,
};
