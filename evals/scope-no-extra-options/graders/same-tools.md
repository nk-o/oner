---
type: regex
target: { source: file, path: tools.json }
pattern: '"name"\s*:\s*"(search_orders|get_order|search_customers|get_customer)"'
match: "count:4"
---
