// Pushes the integration branch, and with --deploy also fast-forwards the deploy branch to it. Never forces.
import { git, gitOut, currentBranch } from "../lib/git.mjs";

export function push(ctx, opts = {}) {
  const { repo, cfg } = ctx;
  const remote = opts.remote || "origin";
  const branch = cfg.integrationBranch;
  if (currentBranch(repo) !== branch) return { ok: false, message: `STOP: the checkout is not on ${branch}.` };
  git(repo, ["fetch", "-q", remote]);
  const behind = gitOut(repo, ["rev-list", "--count", `${branch}..${remote}/${branch}`]);
  if (behind && behind !== "0") return { ok: false, message: `STOP: ${remote}/${branch} has ${behind} commit(s) you do not; merge them first.` };
  const lines = [];
  const r = git(repo, ["push", remote, branch]);
  if (r.code !== 0) return { ok: false, message: `push failed: ${r.err.trim()}` };
  lines.push(`pushed ${branch}`);

  if (opts.deploy) {
    const target = cfg.deploy.branch;
    if (!target) return { ok: false, message: [...lines, "No deploy branch in the config."].join("\n") };
    if (!cfg.deploy.allowPush && !opts.ownerSaidGo) {
      return { ok: false, message: [...lines, `Pushing ${target} needs the owner's go (config deploy.allowPush is false); pass --owner-said-go after asking.`].join("\n") };
    }
    const exists = git(repo, ["rev-parse", "--verify", "--quiet", `${remote}/${target}`]).code === 0;
    if (exists && git(repo, ["merge-base", "--is-ancestor", `${remote}/${target}`, branch]).code !== 0) {
      return { ok: false, message: [...lines, `STOP: ${remote}/${target} has commits ${branch} lacks; merge ${remote}/${target} into ${branch} first.`].join("\n") };
    }
    const d = git(repo, ["push", remote, `${branch}:${target}`]);
    if (d.code !== 0) return { ok: false, message: [...lines, `deploy push failed: ${d.err.trim()}`].join("\n") };
    lines.push(`fast-forwarded ${target} to ${gitOut(repo, ["rev-parse", "--short", branch])}`);
  }
  return { ok: true, message: lines.join("\n") };
}
