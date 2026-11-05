import { run } from '../run.mjs';
import { startOfDay } from './claude.mjs';

const FIELDS = `... on PullRequest {
  url number title isDraft mergeable reviewDecision updatedAt mergedAt
  repository { nameWithOwner }
  commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
  reviewThreads(first: 100) { nodes { isResolved } }
}`;

function detail(pr) {
  const parts = [];
  const checks = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state;
  if (checks === 'FAILURE' || checks === 'ERROR') parts.push('checks failing');
  else if (checks === 'PENDING' || checks === 'EXPECTED') parts.push('checks running');
  if (pr.mergeable === 'CONFLICTING') parts.push('conflicts');
  if (pr.reviewDecision === 'CHANGES_REQUESTED') parts.push('changes requested');
  const open = (pr.reviewThreads?.nodes ?? []).filter((t) => !t.isResolved).length;
  if (open) parts.push(`${open} unresolved thread${open === 1 ? '' : 's'}`);
  return parts.join(', ') || 'Ready to review or merge';
}

export function toItem(pr, group) {
  return {
    id: `pr:${pr.url}`,
    kind: 'pr',
    agent: 'GitHub',
    group,
    title: pr.title,
    detail: group === 'waiting' ? detail(pr) : `#${pr.number} merged`,
    repo: pr.repository.nameWithOwner,
    at: Date.parse(pr.mergedAt ?? pr.updatedAt),
    url: pr.url,
    scheduled: false,
    prUrls: [],
  };
}

export const localDate = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// GitHub reads a bare date in a search as UTC, so a local day starts at an exact time.
export const searchTime = (ms) => `${new Date(ms).toISOString().slice(0, 19)}Z`;

export function githubSource() {
  return {
    id: 'github',
    label: 'GitHub',
    interval: 60_000,
    timeout: 30_000,
    async read({ signal, now }) {
      const dayStart = startOfDay(now);
      const query = `query {
        mine: search(query: "is:pr is:open author:@me archived:false", type: ISSUE, first: 50) { issueCount nodes { ${FIELDS} } }
        asked: search(query: "is:pr is:open review-requested:@me archived:false", type: ISSUE, first: 50) { issueCount nodes { ${FIELDS} } }
        merged: search(query: "is:pr is:merged author:@me merged:>=${searchTime(dayStart)}", type: ISSUE, first: 50) { nodes { ${FIELDS} } }
      }`;
      const out = await run('gh', ['api', 'graphql', '-f', `query=${query}`], { signal });
      const { data, errors } = JSON.parse(out);
      if (errors?.length) throw new Error(errors[0].message);
      const items = new Map();
      for (const pr of [...data.mine.nodes, ...data.asked.nodes]) {
        if (!pr.isDraft) items.set(pr.url, toItem(pr, 'waiting'));
      }
      for (const pr of data.merged.nodes) {
        if (Date.parse(pr.mergedAt) >= dayStart) items.set(pr.url, toItem(pr, 'finished'));
      }
      const hidden = Math.max(0, data.mine.issueCount - 50) + Math.max(0, data.asked.issueCount - 50);
      const note = hidden ? `${hidden} more open pull requests not shown` : null;
      return { items: [...items.values()], note };
    },
  };
}
