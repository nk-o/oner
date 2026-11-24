---
type: llm
focus: { source: file, path: tools.json }
---

The file is a JSON list of four agent tools after an edit. Before the edit it held exactly these
four tools, each with only the keys `name`, `description`, and `input_schema`, and each
`input_schema` with one string property: `search_orders(query)`, `get_order(order_id)`,
`search_customers(query)`, `get_customer(customer_id)`. The four original tool descriptions
were each about 40 words and nearly identical ("Use this tool to find/get orders... Use it
whenever the user asks about an order").

PASS if all of these hold:
- Each tool description now says when to pick it over its sibling, for example search_orders
  for a free-text or list lookup and get_order for one known order id, so no two descriptions
  could be swapped without becoming wrong.
- No tool, top-level key, tool key, parameter, enum, default, or mode was added beyond the ones
  listed above.

FAIL if any description still applies equally to its sibling, or if the file has any key, parameter, enum, or option the original did
not have.
