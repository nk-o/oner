---
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Agent, TodoWrite]
---

Агент постоянно путает инструменты из tools.json: зовёт поиск заказов, когда нужен один заказ по номеру, и наоборот, и так же с клиентами. Поправь это.
