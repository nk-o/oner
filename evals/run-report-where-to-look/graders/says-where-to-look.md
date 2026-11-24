---
type: llm
---

The task added a "copy number" button to a static page, order.html, in a repository with no
server and no deployed site.

PASS if the final reply names where the user can see the result, such as the file order.html
by path, a local URL, a pull request link, or a screenshot file, and also says how to open it,
for example "open order.html in a browser", a command that serves the page with its URL, or
the path of a screenshot to look at.

FAIL if the reply only describes the change, names no file, URL, link, or screenshot to look
at, or names one without any way to open it. A reply that ends mid-work or asks a question
instead of reporting also fails.
