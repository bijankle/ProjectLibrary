# KCGM Flashcards

Full screen, offline capable swipe flashcard deck on the KCGM Fimiston processing plant (Growth Project, Stage 1 and Stage 2).
Built for learning the plant language: area codes, tag numbering, circuit logic, acronyms and shift handover talk.

Open it at https://bijankle.github.io/KCGMhomework/ and use Chrome's "Add to Home screen" so it launches full screen like an app.

To add cards, edit `cards.js` (each card has a question `q`, a short answer `a` and the detail `e`),
then bump `VERSION` in `sw.js` so phones pick up the change.

## Follow up questions (AI)

On the answer side of each card there is a "Dig deeper" section with three suggested follow up questions and a box for your own.
Answers come from Google Gemini using your own free key from aistudio.google.com (Settings on the home screen). The key is stored only on your phone.
Every question is sent with `facts.js` (a condensed plant reference from the design criteria and control philosophies), the glossary and the cards in the same topic,
and each answer is tagged as coming from the plant docs, docs plus general knowledge, general knowledge only, or not covered.
