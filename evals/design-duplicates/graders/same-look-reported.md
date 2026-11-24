---
type: llm
---

The help-article callout appears in two places: the public article (site/article.html) and the
editor preview (editor/preview.html), each with its own inline `.callout` rule. design-context
moves duplicates onto one shared implementation as part of the request.

PASS when the reply says both places now use one shared style or component for the callout,
such as a rule in the shared site/base.css that both pages load, or names a reason the two
stay apart.

FAIL when the reply mentions only the article, says the preview was left as it was, offers the
preview as a later follow-up, or made the same edit in two copies without naming a reason to
keep them apart.
