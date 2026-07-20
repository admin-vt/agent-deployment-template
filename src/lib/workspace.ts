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
const INIT_LOCK = '/mnt/files/.ws-init-lock';

function remoteUrl(): string {
  const token = process.env.GITHUB_TOKEN;
  const { repo } = templateConfig.workspace;
  return `https://x-access-token:${token}@github.com/${repo}.git`;
}

/**
 * Shell preamble that guarantees a valid clone at WORKSPACE_DIR before any
 * workspace work runs. Serialized under a mkdir-based mutex because the
 * sandbox backend can dispatch a command twice concurrently (verified, V4;
 * re-verified on this deployment): without the lock, one dispatch's
 * `rev-parse || rm -rf` can destroy the repo the other just cloned — even
 * after that dispatch already reported success. Locks older than 5 minutes
 * are stolen (a duplicate killed mid-flight would otherwise wedge every
 * later call); the clone lands via clone-to-temp + atomic mv as a second
 * line of defense. Every tool runs this, so any dispatch on any sandbox
 * self-heals before acting.
 */
function ensureRepo(): string {
  const { branch } = templateConfig.workspace;
  return (
    `for i in $(seq 1 120); do ` +
    `if mkdir ${INIT_LOCK} 2>/dev/null; then break; fi; ` +
    `[ -n "$(find ${INIT_LOCK} -maxdepth 0 -mmin +5 2>/dev/null)" ] && rm -rf ${INIT_LOCK}; ` +
    `sleep 1; done; ` +
    `[ -d ${WORKSPACE_DIR}/.git ] && rm -f ${WORKSPACE_DIR}/.git/*.lock; ` +
    `git -C ${WORKSPACE_DIR} rev-parse --verify HEAD >/dev/null 2>&1 || rm -rf ${WORKSPACE_DIR}; ` +
    `if [ ! -d ${WORKSPACE_DIR}/.git ]; then ` +
    `t=$(mktemp -d /mnt/files/.ws-clone.XXXXXX) && ` +
    `git clone -q --branch ${branch} ${remoteUrl()} "$t/repo" && ` +
    `{ mv -n -T "$t/repo" ${WORKSPACE_DIR} 2>/dev/null; rm -rf "$t"; }; fi; ` +
    `git -C ${WORKSPACE_DIR} pull -q --ff-only 2>/dev/null; ` +
    `rmdir ${INIT_LOCK} 2>/dev/null; `
  );
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
    const result = await bash(
      ensureRepo() +
        `if git -C ${WORKSPACE_DIR} rev-parse --verify HEAD >/dev/null 2>&1; ` +
        `then echo WORKSPACE_READY && ls -1 ${WORKSPACE_DIR} | head -20; ` +
        `else echo WORKSPACE_INIT_FAILED; fi`,
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
    const result = await bash(ensureRepo() + `cd ${WORKSPACE_DIR} && (${command})`);
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
      ensureRepo() +
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
