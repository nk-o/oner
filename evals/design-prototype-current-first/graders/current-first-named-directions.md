---
type: llm
focus: trace
---

The agent built a prototype with several directions for an order list screen. Judge the picker
it describes or builds.

PASS when both hold:
- The first picker item is the current order list mounted unchanged (named "Current",
  "Текущий", or similar), built from the app's own files such as src/orders.js and
  src/tokens.css rather than redrawn from scratch.
- Every other direction is named after the decision it makes, such as "Карточки",
  "Группы по статусу", or "Плотная таблица".

FAIL when there is no unchanged current item, when the current item is not first, or when any
direction is named only by a letter or number, such as "Option A", "Вариант 1", or
"Направление 2".
