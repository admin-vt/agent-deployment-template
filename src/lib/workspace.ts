import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { templateConfig } from '../../template.config';
import { getAgentSession } from './composio';

/**
 * The agent's persistent filesystem: a git repo cloned into the Composio
 * Remote Sandbox. Sandboxes are ephemeral; the repo is the only durable
 * state — work lands by committing and pushing.
 *
 * The repo lives on the sandbox's LOCAL disk, deliberately NOT on the
 * /mnt/files s3fs mount. Verified (ari-clickup diagnosis): s3fs has no
 * atomic rename, `rm -rf` fails on non-empty trees, directory listings go
 * stale between calls, and git ops run ~50x slower — git corrupts itself
 * there under the backend's concurrent duplicate dispatch. Local ext4 has
 * real POSIX semantics; losing the working copy with the sandbox is fine
 * because anything uncommitted was never durable anyway.
 *
 * Concurrency model (all verified): the backend can dispatch one command
 * twice concurrently, and a command whose SDK request times out (~180s)
 * keeps running server-side. So: repo repair is serialized under an atomic
 * mkdir mutex (local fs), network git ops are bounded with `timeout` so an
 * abandoned command cannot mutate state for long, and when the repo cannot
 * be verified ready the tools say so instead of acting on a broken tree.
 */
const WORKSPACE_DIR = '/home/user/workspace';
const INIT_LOCK = '/home/user/.ws-init-lock';

function remoteUrl(): string {
  const token = process.env.GITHUB_TOKEN;
  const { repo } = templateConfig.workspace;
  return `https://x-access-token:${token}@github.com/${repo}.git`;
}

/**
 * Shell preamble: ensure a valid clone at WORKSPACE_DIR, serialized under
 * the mutex. Waits up to 60s for a contender; locks older than 5 minutes
 * are stolen (an abandoned holder's process is bounded by the `timeout`s
 * below, so a lock that old is orphaned). If the lock can't be acquired,
 * repair is SKIPPED — never repair lock-less; the readiness guard after
 * the preamble reports honestly instead.
 */
function ensureRepo(): string {
  const { branch } = templateConfig.workspace;
  return (
    `ws_locked=0; for i in $(seq 1 60); do ` +
    `if mkdir ${INIT_LOCK} 2>/dev/null; then ws_locked=1; break; fi; ` +
    `[ -n "$(find ${INIT_LOCK} -maxdepth 0 -mmin +5 2>/dev/null)" ] && rm -rf ${INIT_LOCK}; ` +
    `sleep 1; done; ` +
    `if [ "$ws_locked" = 1 ]; then ` +
    `trap 'rmdir ${INIT_LOCK} 2>/dev/null' EXIT; ` +
    `[ -d ${WORKSPACE_DIR}/.git ] && rm -f ${WORKSPACE_DIR}/.git/*.lock; ` +
    `git -C ${WORKSPACE_DIR} rev-parse --verify HEAD >/dev/null 2>&1 || rm -rf ${WORKSPACE_DIR}; ` +
    `if [ ! -d ${WORKSPACE_DIR}/.git ]; then ` +
    `t=$(mktemp -d /home/user/.ws-clone.XXXXXX) && ` +
    `timeout -k 5 120 git clone -q --branch ${branch} ${remoteUrl()} "$t/repo" && ` +
    `{ mv -n -T "$t/repo" ${WORKSPACE_DIR} 2>/dev/null; rm -rf "$t"; }; fi; ` +
    `timeout -k 5 60 git -C ${WORKSPACE_DIR} pull -q --ff-only 2>/dev/null; ` +
    `rmdir ${INIT_LOCK} 2>/dev/null; trap - EXIT; ` +
    `fi; `
  );
}

/** Readiness guard: run `body` only against a verified repo. */
function ifReady(body: string): string {
  return (
    `if git -C ${WORKSPACE_DIR} rev-parse --verify HEAD >/dev/null 2>&1; ` +
    `then ${body}; ` +
    `else echo WORKSPACE_NOT_READY: repo unavailable, possibly being repaired by a concurrent operation - retry; fi`
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
    'Ensure the workspace repository is cloned into the sandbox and up to date. Call once before other workspace operations.',
  inputSchema: z.object({}),
  outputSchema: z.object({ output: z.string() }),
  execute: async () => {
    const result = await bash(
      ensureRepo() + ifReady(`echo WORKSPACE_READY && ls -1 ${WORKSPACE_DIR} | head -20`),
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
    const result = await bash(ensureRepo() + ifReady(`cd ${WORKSPACE_DIR} && (${command})`));
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
        ifReady(
          `cd ${WORKSPACE_DIR} && rm -f .git/index.lock .git/config.lock && ` +
            `git config user.email agent@${templateConfig.client.slug}.local && ` +
            `git config user.name "${templateConfig.agent.name}" && git add -A && ` +
            `(git diff --cached --quiet || git commit -q -m "${safeMessage}") && ` +
            `timeout -k 5 60 git push -q origin HEAD:${branch} && echo COMMIT_PUSHED && git log --oneline -1`,
        ),
    );
    return { output: result.stdout || result.stderr || String(result.error) };
  },
});

export const workspaceTools = {
  workspaceInit,
  workspaceRun,
  workspaceCommit,
};
