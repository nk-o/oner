# Logic prototype

One self-contained HTML file that lets anyone drive a state model by pressing buttons. It is
for questions about business rules, state transitions, or data shape: the kind of design that
reads fine on paper and feels wrong once real cases go through it. Because it is one file with
nothing to install, a designer, a product owner, or a domain expert can open it and find the
case the model gets wrong.

Typical questions:

- "Does this state machine handle X followed by Y?"
- "Can this data model represent the case where an order is split across two shipments?"
- "What should this module's API feel like before anyone writes it?"

## 1. State the question

Write one paragraph naming the state model and the question it must answer, and put it at the
top of the page as visible text. A logic prototype that answers the wrong question is wasted,
and the visible question lets the user check it when they open the file later.

## 2. Write the logic as a pure module

Put the logic in one `<script>` block as a small module with no DOM access, no `document`, and
no handlers reaching into it. The page calls the module; nothing flows the other way. Once the
question is answered, this module is the part that moves into the real code, so write it in
the codebase's language and naming where the page allows.

Pick the shape the question needs, not the one easiest to wire to buttons:

- **A reducer**, `(state, action) => state`, when actions are discrete events and the state is
  one value.
- **A state machine** with explicit states and transitions, when "which actions are legal right
  now" is part of the question.
- **Pure functions over a plain data type**, when there is no current state, only
  transformations.
- **A class with a small method surface**, when the logic really owns state over time.

State lives in memory. When the question is about persistence itself, use a clearly named
scratch store, never the project's real database.

## 3. Build the page

Plain HTML, CSS, and JavaScript inline in the one file, opening by double click with no
framework, bundler, or server. Every label uses the product's own words, not the code's:
buttons read "Cancel order", not `dispatch({ type: 'CANCEL' })`.

Top to bottom:

1. **The question** from step 1, as the title and one line under it.
2. **Current state** as a readable panel with labelled fields, not a JSON dump, re-rendered
   after every action, with the fields that just changed marked.
3. **Free play**: one button per action, always available, so the model can be pushed in any
   order. An action the model refuses shows the refusal and its reason in the panel.
4. **Walkthroughs**, one tab per scenario. Each tab says in plain words what situation it sets
   up and what to watch, then lists its steps as real buttons pressed in order. Starting a
   walkthrough resets to a known initial state, so it runs the same way every time.

Pick scenarios for the awkward cases: the ordinary path, the edge case the question is about,
and an attempt at something the model should refuse. Styling stays quiet: readable type,
generous spacing, one accent colour, no animation.

## 4. Verify and hand over

Open the file in a browser and run every walkthrough to its end, then a few free-play
sequences out of the expected order. Report console errors and any walkthrough that ended in a
state its description does not predict.

Save the file next to the module it prototypes, named so it reads as a prototype, such as
`order-state.prototype.html`. Nothing imports it. Give the user the path and the walkthroughs
to try. The useful moments are "that should not be possible" and "I assumed X would happen
here". Each one is a defect in the design, found before any code depends on it. Add the actions
or scenarios they ask for.

## 5. Capture the answer

Record the verdict in the decisions file the main skill describes: the question, what the
model now does, and which scenario settled it. After the user agrees, move the validated module
into the real code, without the page around it. The HTML file stays as the record of how the
decision was reached, unless the user asks for it to be deleted.
