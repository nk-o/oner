#!/usr/bin/env bash
# Prints the pull request context pr-feedback starts from. Every call is a GitHub read, so
# the skill grants this one script instead of `gh api` as a whole, which would also let a
# write through for the rest of an unattended run. Always exits 0, because a dynamic-context
# command that fails aborts the whole skill.
set -u

n="$(gh pr view --json number --jq .number 2>/dev/null)"

echo "- PR: $(gh pr view --json number,title,url,isDraft,baseRefName,mergeable,mergeStateStatus 2>/dev/null || echo "no PR for this branch")"
echo "- Intent (PR body): $(gh pr view --json body --jq .body 2>/dev/null | head -60)"
echo "- Checks: $(gh pr checks 2>&1)"

if [ -z "$n" ]; then
  printf '%s\n' "- Conversation: none" "- Review summaries: none" "- Unresolved inline threads: none"
  exit 0
fi

echo "- Conversation: $(gh api "repos/{owner}/{repo}/issues/$n/comments" --paginate \
  --jq '[.[] | {author: .user.login, url: .html_url, body: .body[0:3000]}]' 2>/dev/null || echo "none")"
echo "- Review summaries: $(gh api "repos/{owner}/{repo}/pulls/$n/reviews" --paginate \
  --jq '[.[] | select(.body != "") | {author: .user.login, state: .state, url: .html_url, body: .body[0:3000]}]' \
  2>/dev/null || echo "none")"
echo "- Unresolved inline threads: $(gh api graphql -F owner='{owner}' -F repo='{repo}' -F pr="$n" \
  -f query='query($owner:String!,$repo:String!,$pr:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$pr){reviewThreads(first:100){nodes{isResolved isOutdated path line comments(first:20){nodes{author{login} body url}}}}}}}' \
  --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved | not) | {path, line, outdated: .isOutdated, url: .comments.nodes[0].url, comments: [.comments.nodes[] | {author: .author.login, body: .body[0:3000]}]}]' \
  2>/dev/null || echo "none")"

exit 0
