#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval
cat > tools.json <<'JSON'
[
  {
    "name": "search_orders",
    "description": "Use this tool to find orders. It can look up orders in the order database and return information about orders, including their status, items, totals and the customer who placed them. Use it whenever the user asks about an order or orders.",
    "input_schema": {
      "type": "object",
      "properties": {
        "query": { "type": "string", "description": "Text to search for in orders." }
      },
      "required": ["query"]
    }
  },
  {
    "name": "get_order",
    "description": "Use this tool to get orders. It looks up an order in the order database and returns information about the order, including its status, items, totals and the customer who placed it. Use it whenever the user asks about an order.",
    "input_schema": {
      "type": "object",
      "properties": {
        "order_id": { "type": "string", "description": "The order to get." }
      },
      "required": ["order_id"]
    }
  },
  {
    "name": "search_customers",
    "description": "Use this tool to find customers. It can look up customers in the customer database and return information about customers, including their contact details and their orders. Use it whenever the user asks about a customer or customers.",
    "input_schema": {
      "type": "object",
      "properties": {
        "query": { "type": "string", "description": "Text to search for in customers." }
      },
      "required": ["query"]
    }
  },
  {
    "name": "get_customer",
    "description": "Use this tool to get customers. It looks up a customer in the customer database and returns information about the customer, including contact details and orders. Use it whenever the user asks about a customer.",
    "input_schema": {
      "type": "object",
      "properties": {
        "customer_id": { "type": "string", "description": "The customer to get." }
      },
      "required": ["customer_id"]
    }
  }
]
JSON
mkdir -p src
cat > src/tools.js <<'JS'
import { readFileSync } from 'node:fs';

export const tools = JSON.parse(readFileSync(new URL('../tools.json', import.meta.url), 'utf8'));

export const handlers = {
  search_orders: ({ query }) => db.orders.search(query),
  get_order: ({ order_id }) => db.orders.byId(order_id),
  search_customers: ({ query }) => db.customers.search(query),
  get_customer: ({ customer_id }) => db.customers.byId(customer_id),
};
JS
git add -A
git commit -qm "feat: support agent tools"
