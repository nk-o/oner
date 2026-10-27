# Humanizer: pattern catalogue

Every AI-writing tell this skill removes, with a before and after for each. Read this in
full during step 1 of the audit; the numbering (§7, §14) is what `SKILL.md` refers to.

## CONTENT PATTERNS

### 1. Undue Emphasis on Significance, Legacy, and Broader Trends

**Words to watch:** stands/serves as, is a testament/reminder, a vital/significant/crucial/pivotal/key role/moment, underscores/highlights its importance/significance, reflects broader, symbolizing its ongoing/enduring/lasting, contributing to the, setting the stage for, marking/shaping the, represents/marks a shift, key turning point, evolving landscape, focal point, indelible mark, deeply rooted

**Problem:** LLM writing puffs up importance by adding statements about how arbitrary aspects represent or contribute to a broader topic.

**Before:**
> The Statistical Institute of Catalonia was officially established in 1989, marking a pivotal moment in the evolution of regional statistics in Spain. This initiative was part of a broader movement across Spain to decentralize administrative functions and enhance regional governance.

**After:**
> The Statistical Institute of Catalonia was established in 1989 to collect and publish regional statistics independently from Spain's national statistics office.


### 2. Undue Emphasis on Notability and Media Coverage

**Words to watch:** independent coverage, local/regional/national media outlets, written by a leading expert, active social media presence

**Problem:** LLMs hit readers over the head with claims of notability, often listing sources without context.

**Before:**
> Her views have been cited in The New York Times, BBC, Financial Times, and The Hindu. She maintains an active social media presence with over 500,000 followers.

**After:**
> In a 2024 New York Times interview, she argued that AI regulation should focus on outcomes rather than methods.


### 3. Superficial Analyses with -ing Endings

**Words to watch:** highlighting/underscoring/emphasizing..., ensuring..., reflecting/symbolizing..., contributing to..., cultivating/fostering..., encompassing..., showcasing...

**Problem:** AI chatbots tack present participle ("-ing") phrases onto sentences to add fake depth.

**Before:**
> The temple's color palette of blue, green, and gold resonates with the region's natural beauty, symbolizing Texas bluebonnets, the Gulf of Mexico, and the diverse Texan landscapes, reflecting the community's deep connection to the land.

**After:**
> The temple uses blue, green, and gold colors. The architect said these were chosen to reference local bluebonnets and the Gulf coast.


### 4. Promotional and Advertisement-like Language

**Words to watch:** boasts a, vibrant, rich (figurative), profound, enhancing its, showcasing, exemplifies, commitment to, natural beauty, nestled, in the heart of, groundbreaking (figurative), renowned, breathtaking, must-visit, stunning

**Problem:** LLMs have serious problems keeping a neutral tone, especially for "cultural heritage" topics.

**Before:**
> Nestled within the breathtaking region of Gonder in Ethiopia, Alamata Raya Kobo stands as a vibrant town with a rich cultural heritage and stunning natural beauty.

**After:**
> Alamata Raya Kobo is a town in the Gonder region of Ethiopia, known for its weekly market and 18th-century church.


### 5. Vague Attributions and Weasel Words

**Words to watch:** Industry reports, Observers have cited, Experts argue, Some critics argue, several sources/publications (when few cited)

**Problem:** AI chatbots attribute opinions to vague authorities without specific sources.

**Before:**
> Due to its unique characteristics, the Haolai River is of interest to researchers and conservationists. Experts believe it plays a crucial role in the regional ecosystem.

**After:**
> The Haolai River supports several endemic fish species, according to a 2019 survey by the Chinese Academy of Sciences.


### 6. Outline-like "Challenges and Future Prospects" Sections

**Words to watch:** Despite its... faces several challenges..., Despite these challenges, Challenges and Legacy, Future Outlook

**Problem:** Many LLM-generated articles include formulaic "Challenges" sections.

**Before:**
> Despite its industrial prosperity, Korattur faces challenges typical of urban areas, including traffic congestion and water scarcity. Despite these challenges, with its strategic location and ongoing initiatives, Korattur continues to thrive as an integral part of Chennai's growth.

**After:**
> Traffic congestion increased after 2015 when three new IT parks opened. The municipal corporation began a stormwater drainage project in 2022 to address recurring floods.


## LANGUAGE AND GRAMMAR PATTERNS

### 7. Overused "AI Vocabulary" Words

**High-frequency AI words:** Actually, additionally, align with, comprehensive, crucial, delve, emphasizing, enduring, enhance, fostering, furthermore, garner, highlight (verb), interplay, intricate/intricacies, key (adjective), landscape (abstract noun), moreover, navigate, nuanced, pivotal, realm, robust, showcase, straightforward, tapestry (abstract noun), testament, underscore (verb), valuable, vibrant

**Problem:** These words appear far more frequently in post-2023 text. They often co-occur.

**Before:**
> Additionally, a distinctive feature of Somali cuisine is the incorporation of camel meat. An enduring testament to Italian colonial influence is the widespread adoption of pasta in the local culinary landscape, showcasing how these dishes have integrated into the traditional diet.

**After:**
> Somali cuisine also includes camel meat, which is considered a delicacy. Pasta dishes, introduced during Italian colonization, remain common, especially in the south.


### 8. Avoidance of "is"/"are" (Copula Avoidance)

**Words to watch:** serves as/stands as/marks/represents [a], boasts/features/offers [a]

**Problem:** LLMs substitute elaborate constructions for simple copulas.

**Before:**
> Gallery 825 serves as LAAA's exhibition space for contemporary art. The gallery features four separate spaces and boasts over 3,000 square feet.

**After:**
> Gallery 825 is LAAA's exhibition space for contemporary art. The gallery has four rooms totaling 3,000 square feet.


### 9. Negative Parallelisms and Tailing Negations

**Problem:** Constructions like "Not only...but..." or "It's not just about..., it's..." are overused. So are clipped tailing-negation fragments such as "no guessing" or "no wasted motion" tacked onto the end of a sentence instead of written as a real clause.

**Before:**
> It's not just about the beat riding under the vocals; it's part of the aggression and atmosphere. It's not merely a song, it's a statement.

**After:**
> The heavy beat adds to the aggressive tone.

**Before (tailing negation):**
> The options come from the selected item, no guessing.

**After:**
> The options come from the selected item without forcing the user to guess.


### 10. Rule of Three Overuse

**Problem:** LLMs force ideas into groups of three to appear comprehensive.

**Before:**
> The event features keynote sessions, panel discussions, and networking opportunities. Attendees can expect innovation, inspiration, and industry insights.

**After:**
> The event includes talks and panels. There's also time for informal networking between sessions.


### 11. Elegant Variation (Synonym Cycling)

**Problem:** AI has repetition-penalty code causing excessive synonym substitution.

**Before:**
> The protagonist faces many challenges. The main character must overcome obstacles. The central figure eventually triumphs. The hero returns home.

**After:**
> The protagonist faces many challenges but eventually triumphs and returns home.


### 12. False Ranges

**Problem:** LLMs use "from X to Y" constructions where X and Y aren't on a meaningful scale.

**Before:**
> Our journey through the universe has taken us from the singularity of the Big Bang to the grand cosmic web, from the birth and death of stars to the enigmatic dance of dark matter.

**After:**
> The book covers the Big Bang, star formation, and current theories about dark matter.


### 13. Passive Voice and Subjectless Fragments

**Problem:** LLMs often hide the actor or drop the subject entirely with lines like "No configuration file needed" or "The results are preserved automatically." Rewrite these when active voice makes the sentence clearer and more direct. Not every passive is wrong. Use judgment when the actor is unknown or irrelevant ("The bridge was built in 1904").

**Before:**
> No configuration file needed. The results are preserved automatically.

**After:**
> You do not need a configuration file. The system preserves the results automatically.


## ORWELL-STYLE CLARITY

Apply alongside the AI-specific patterns above. Spirit over letter, so prefer plain, direct English.

### Dead metaphors

Flag figures of speech worn smooth by overuse: *level playing field*, *think outside the box*, *at the end of the day*, *move the needle*, *low-hanging fruit*, *deep dive*, *unpack*, *lean in*, *double down*, *game-changer*. Test: if you've seen it in a hundred blog posts, it's dead. Fresh metaphors that paint a picture are fine.

### Long words where short ones work

Flag: *utilize* (use), *implement* when you mean do/carry out, *leverage* (use), *facilitate* (help), *methodology* (method), *prior to* (before), *in order to* (to), *at this point in time* (now), *due to the fact that* (because). Technical terms earn their place when they carry precise meaning (*kerning* in a typography piece is fine).

### Pretentious diction and jargon

Flag dress-up words: *paradigm*, *synergy*, *holistic*, *ecosystem* (non-biological), *deliverable*, *actionable*, *learnings* (lessons), *cadence* (schedule), *align* (agree). Flag throat-clearing: *It is important to note that…*, *It should be pointed out that…*, *It goes without saying that…*. Flag padding: *very*, *really*, *quite*, *rather*, *somewhat*, *basically*, *actually*, *literally* (non-literal), *just* (filler), *that* (when optional), *in terms of*, *with regard to*.


## STYLE PATTERNS

### 14. Em Dashes (and En Dashes): Cut Them

**Rule:** The final rewrite contains **no** em dashes (—) or en dashes (–) used as sentence breaks. Replace each one, in rough order: period, comma, or restructure. Do not reach for parentheses. A parenthetical aside dropped where the dash was trades one tell for another and keeps the same interrupted rhythm. Also catch spaced em dashes (` — `) and double hyphens (` -- `) used the same way. En dashes for ranges (pages 10–15) may stay when they are true ranges, not parenthetical breaks; rewrite the range if unsure.

The em dash clusters heavily in AI prose; a lone dash in an otherwise clean paragraph is weaker evidence when deciding what to change in the source (see Detection guidance).

**Before:**
> The term is primarily promoted by Dutch institutions—not by the people themselves. You don't say "Netherlands, Europe" as an address—yet this mislabeling continues—even in official documents.

**After:**
> The term is primarily promoted by Dutch institutions, not by the people themselves. You don't say "Netherlands, Europe" as an address, yet this mislabeling continues in official documents.

**Before:**
> The new policy — announced without warning — affects thousands of workers. The changes -- long overdue according to critics -- will take effect immediately.

**After:**
> The new policy, announced without warning, affects thousands of workers. The changes, long overdue according to critics, will take effect immediately.

Before returning the final rewrite, scan it for `—` and `–`. Any hit means the draft isn't done.


### 15. Overuse of Boldface

**Problem:** AI chatbots emphasize phrases in boldface mechanically.

**Before:**
> It blends **OKRs (Objectives and Key Results)**, **KPIs (Key Performance Indicators)**, and visual strategy tools such as the **Business Model Canvas (BMC)** and **Balanced Scorecard (BSC)**.

**After:**
> It blends OKRs, KPIs, and visual strategy tools like the Business Model Canvas and Balanced Scorecard.


### 16. Inline-Header Vertical Lists

**Problem:** AI outputs lists where an item starts with a bolded label and a colon, and the
line then restates the label instead of adding anything to it.

**The tell is the restatement, not the bold.** A bold lead-in that ends in a period, names
the item once, and is followed by genuinely new detail is an ordinary way to write a list.
Leave those alone. Convert only the entries whose text repeats their own label.

**Before:**
> - **User Experience:** The user experience has been significantly improved with a new interface.
> - **Performance:** Performance has been enhanced through optimized algorithms.
> - **Security:** Security has been strengthened with end-to-end encryption.

**After:**
> The update improves the interface, speeds up load times through optimized algorithms, and adds end-to-end encryption.

**Not a tell, leave it:**
> - **Schema in TypeScript.** Tables live in one file and the migration is generated from it.
> - **Rollback.** `db push --force` restores the previous schema without touching row data.


### 17. Title Case in Headings

**Problem:** AI chatbots capitalize all main words in headings.

**Before:**
> ## Strategic Negotiations And Global Partnerships

**After:**
> ## Strategic negotiations and global partnerships


### 18. Emojis

**Problem:** AI chatbots often decorate headings or bullet points with emojis.

**Before:**
> 🚀 **Launch Phase:** The product launches in Q3
> 💡 **Key Insight:** Users prefer simplicity
> ✅ **Next Steps:** Schedule follow-up meeting

**After:**
> The product launches in Q3. User research showed a preference for simplicity. Next step: schedule a follow-up meeting.


### 19. Quotation Marks (context matters)

**Do not treat curly vs. straight quotes as an AI tell by itself.** macOS, Word, Google Docs, and most CMSes auto-curl quotes. Straight quotes are correct in code, JSON, JSX string literals, and repo markdown the build expects to stay ASCII.

**For marketing/site copy in the repo:** Match the project's existing convention (check sibling pages). If there is no convention, straight ASCII quotes in source files are fine. Never change quotes inside code blocks, URLs, or config.


## TYPOGRAPHY AND PUNCTUATION

Fix only what the output medium allows (don't fight the repo's quote style). Apply during rewrite when editing user-facing copy.

### Dashes (beyond §14)

- **Hyphen (-):** compound modifiers (*well-known*, *state-of-the-art*).
- **En dash (–):** ranges and connections (*pages 10–15*, *London–Paris*). Flag hyphens used for numeric ranges in polished copy.
- **Double hyphen (--):** flag when used as an em dash.

### Ellipsis

Prefer the ellipsis character (…) over three periods (...) in finished marketing or editorial copy. Three periods in markdown/repo source is often acceptable.

### Spacing and emphasis

- Flag double spaces after a sentence.
- Flag more than one exclamation point in professional copy longer than a few paragraphs; suggest cutting unless the voice is deliberately loud.
- Flag underline for emphasis, bold+italic together, and ALL CAPS for emphasis in body text (short labels OK).

## COMMUNICATION PATTERNS

### 20. Collaborative Communication Artifacts

**Words to watch:** I hope this helps, Of course!, Certainly!, You're absolutely right!, Would you like..., let me know, here is a...

**Problem:** Text meant as chatbot correspondence gets pasted as content.

**Before:**
> Here is an overview of the French Revolution. I hope this helps! Let me know if you'd like me to expand on any section.

**After:**
> The French Revolution began in 1789 when financial crisis and food shortages led to widespread unrest.


### 21. Knowledge-Cutoff Disclaimers and Speculative Gap-Filling

**Words to watch:** as of [date], Up to my last training update, While specific details are limited/scarce..., based on available information, not publicly available, maintains a low profile, keeps personal details private, prefers to stay out of the spotlight, likely [grew up/studied/began], it is believed that

**Problem:** Two related tells. (a) Older models leave hard knowledge-cutoff disclaimers in the text. (b) When a model can't find a source, it writes a paragraph *about* not finding one and then invents plausible filler to cover the gap. For a private person the guess almost always lands on the same stock phrases ("maintains a low profile," "keeps personal details private"), none of it sourced. Say what isn't known, or cut the sentence; don't dress a guess up as fact.

**Before (cutoff disclaimer):**
> While specific details about the company's founding are not extensively documented in readily available sources, it appears to have been established sometime in the 1990s.

**After:**
> The company was founded in 1994, according to its registration documents.

**Before (speculative gap-fill):**
> Information about her early life is not publicly available, suggesting she maintains a low profile and keeps personal details private. She likely grew up in a middle-class household, which shaped her later interest in education reform.

**After:**
> Her early life is not documented in the available sources. (Or omit the section.)


### 22. Sycophantic/Servile Tone

**Problem:** Overly positive, people-pleasing language.

**Before:**
> Great question! You're absolutely right that this is a complex topic. That's an excellent point about the economic factors.

**After:**
> The economic factors you mentioned are relevant here.


## FILLER AND HEDGING

### 23. Filler Phrases and Diplomatic Hedging

**Before → After:**
- "In order to achieve this goal" → "To achieve this"
- "Due to the fact that it was raining" → "Because it was raining"
- "At this point in time" → "Now"
- "In the event that you need help" → "If you need help"
- "The system has the ability to process" → "The system can process"
- "It is important to note that the data shows" → "The data shows"

**Cut on sight (often AI throat-clearing):** *It's worth noting that*, *Interestingly,*, *To be sure,*, *That said,*, *It bears mentioning*, *Of course,* (when padding, not agreement).


### 24. Excessive Hedging

**Problem:** Over-qualifying statements.

**Before:**
> It could potentially possibly be argued that the policy might have some effect on outcomes.

**After:**
> The policy may affect outcomes.


### 25. Generic Positive Conclusions and False Profundity

**Problem:** Vague upbeat or "deep" endings that could close any essay on any topic.

**Phrases to watch:** *The future looks bright*, *Exciting times lie ahead*, *journey toward excellence*, *step in the right direction*, *And that changes everything*, *The implications are profound*, *This is just the beginning*, *And perhaps that's the point*.

**Before:**
> The future looks bright for the company. Exciting times lie ahead as they continue their journey toward excellence. This represents a major step in the right direction.

**After:**
> The company plans to open two more locations next year.


### 26. Hyphenated Word Pair Overuse

**Words to watch:** third-party, cross-functional, client-facing, data-driven, decision-making, well-known, high-quality, real-time, long-term, end-to-end

**Problem:** AI hyphenates these uniformly, including in predicate position (`the report is high-quality`). Humans hyphenate inconsistently, typically only when the compound is attributive (`a high-quality report`) and often dropping the hyphen otherwise (`the report is high quality`). Keep attributive-position hyphens; drop them when the compound follows the noun.

**Before:**
> The cross-functional team delivered a high-quality, data-driven report. The team is cross-functional, the report is high-quality, and the methodology is data-driven.

**After:**
> The cross-functional team delivered a high-quality, data-driven report. The team is cross functional, the report is high quality, and the methodology is data driven.


### 27. Persuasive Authority Tropes

**Phrases to watch:** The real question is, at its core, in reality, what really matters, fundamentally, the deeper issue, the heart of the matter

**Problem:** LLMs use these phrases to pretend they are cutting through noise to some deeper truth, when the sentence that follows usually just restates an ordinary point with extra ceremony.

**Before:**
> The real question is whether teams can adapt. At its core, what really matters is organizational readiness.

**After:**
> The question is whether teams can adapt. That mostly depends on whether the organization is ready to change its habits.


### 28. Signposting and Announcements

**Phrases to watch:** Let's dive in, let's explore, let's break this down, here's what you need to know, now let's look at, without further ado

**Problem:** LLMs announce what they are about to do instead of doing it. This meta-commentary slows the writing down and gives it a tutorial-script feel.

**Before:**
> Let's dive into how caching works in Next.js. Here's what you need to know.

**After:**
> Next.js caches data at multiple layers, including request memoization, the data cache, and the router cache.


### 29. Fragmented Headers

**Signs to watch:** A heading followed by a one-line paragraph that simply restates the heading before the real content begins.

**Problem:** LLMs often add a generic sentence after a heading as a rhetorical warm-up. It usually adds nothing and makes the prose feel padded.

**Before:**
> ## Performance
>
> Speed matters.
>
> When users hit a slow page, they leave.

**After:**
> ## Performance
>
> When users hit a slow page, they leave.


### 30. Diff-Anchored Writing

**Problem:** Documentation or comments written as if narrating a change rather than describing the thing as it is. Unless the document is inherently version-scoped (changelogs, release notes, migration guides), it should read coherently without knowing what changed in the last commit.

**Before:**
> This function was added to replace the previous approach of iterating through all items, which caused O(n²) performance.

**After:**
> This function uses a hash map for O(1) lookups, avoiding the O(n²) cost of naive iteration.


## TECHNICAL PROSE

Tells that show up in a README, a docs page, an RFC, or release notes rather than in an
article. Apply them alongside everything above.

### 31. Abstract Metaphor Nouns

**Words to watch:** substrate, wedge, vector, locus, vantage, nexus, primitive (as a noun),
harness (figurative), surface (as in "API surface"), bedrock, scaffolding (figurative),
modality, gold-plating, ratchet (figurative), evacuate (for moving code), endgame, north
star, flywheel

**Problem:** These read as technical and precise, and nearly always stand in for a plainer,
concrete word. Substrate is a base. Wedge in is add. Vector is a way or a method.
Gold-plating is more than the job needs. Ratchet is either the mechanism's real name or a
limit that only tightens. Evacuate is move out. Endgame is the last phase. Pick the concrete
word. A named pattern is fine when the document says what it means the first time it appears.

**Before:**
> The retry primitive gives us a vantage on failures across the substrate. The endgame is to
> evacuate the legacy queue once the new one is bedrock.

**After:**
> The retry helper reports every failure in one place. Once the new queue handles production
> traffic, we delete the old one.


### 32. Say What It Does, Not How It Feels

**Problem:** A sentence that names a feeling about the software instead of a fact about it.
"The database stays close at hand." "SQL you can read." "Types that follow your schema."
Each one sounds like information and carries none. The fix names the mechanism, or a number:
"`.toSQL()` returns the exact string sent to the database", "a column rename fails the build".

**Two tests.** Ask what the sentence tells the reader to do or to know; if you cannot restate
it as a concrete instruction, fact, or number, cut it. Then ask whether the sentence could
appear unchanged in another project's documentation; if it could, it says nothing about this
one, so cut it.

**Before:**
> Migrations are a first-class citizen, giving you confidence that your schema and your code
> stay in harmony.

**After:**
> `db generate` writes a migration from the schema file. CI runs it against a scratch database
> and fails when the result does not match the committed snapshot.


### 33. Colons as Mid-Sentence Connectors

**Problem:** A colon before a list or an example is fine. A colon splicing the two halves of
one sentence is a crutch that promises an explanation and delivers a restatement. Rewrite so
the point stands on its own.

**Before:**
> If you're coming from traditional automation: instead of registering event handlers, you
> describe conditions.

**After:**
> You describe the conditions that should fire the scheduler, in plain English.


### 34. Adverbs Propping Up Weak Verbs

**Problem:** An adverb doing the verb's work means the verb is wrong. Distinct from the
padding words in §23; this one is about the pairing.

**Before → After:**
- "runs quickly" → "is fast", or the measured number
- "significantly improves throughput" → "raises throughput from 400 to 1,100 requests per second"
- "carefully validates the input" → "rejects any payload without a `sig` field"
- "dramatically reduces memory" → "cuts peak heap from 2.1 GB to 340 MB"

An adverb carrying real information stays: "the job runs nightly", "the flag is set manually".


## MANNERED PROSE

### 35. Metaphor Where a Literal Phrase Exists

**Problem:** Mannered prose substitutes metaphor and flourish for direct statement. Instead of
"a parameter worth varying", the mannered writer produces "a dial worth turning". Instead of
"this point still matters", "this point earns its keep". The phrase is there to display the
writer rather than to carry the idea, and readers can tell. It also costs precision, because a
metaphor drags in connotations the writer did not choose. The fix is to say what you mean:
when a literal phrase exists, use it.

Distinct from §31, which is about single nouns standing in for plainer ones. This one is about
the whole construction, and it shows up in verbs and idioms as much as in nouns.

**Before → After:**
- "the rules travel" → "the rules apply everywhere"
- "ceremony is a cost" → "each extra step costs time"
- "this is the one that earns its keep" → "this is the one worth running every time"
- "a map that lives only in this chat dies with it" → "a map only in this chat is lost when the
  chat ends"
- "the twenty lines are the ones that page someone" → "the twenty lines are the ones that cause
  an incident"

**Keep** a metaphor that is the thing's actual name in the domain (a git branch, a database
lock, a call stack), and one the piece defines and then uses consistently.

## DETECTION GUIDANCE

### What NOT to flag (false positives)

A clean human writer can hit several of the patterns above without any AI involvement. Before rewriting, sanity-check that you are not gutting legitimate prose. The following are *not* reliable indicators on their own:

- **Perfect grammar and consistent style.** Many writers are professionals or have been edited. Polish does not equal AI.
- **Mixed casual and formal registers.** This often signals a person in a technical field, a young writer, or someone with neurodivergent prose habits, not a chatbot.
- **"Bland" or "robotic" prose.** AI prose has *specific* tells. Generic dryness without those tells is just dry writing.
- **Formal or academic vocabulary.** AI overuses *specific* fancy words (see §7), not all fancy words. Don't flatten "ostensibly" or "constituent" just because they sound brainy.
- **Letter-style opening or closing on a comment.** Salutations and sign-offs predate ChatGPT by centuries.
- **Common transition words in isolation.** *Additionally*, *moreover*, *consequently* are AI-coded only when piled up. One *however* is not a tell.
- **Curly quotes alone.** macOS, Word, Google Docs, and most CMSes auto-curl by default. Curly quotes only count when stacked with other tells.
- **Em dashes alone.** Many editors and journalists use them often. Em dashes are evidence only when paired with formulaic sales-y rhythm.
- **Unsourced claims.** Most of the web is unsourced. Lack of citations doesn't prove anything.
- **Correct, complex formatting.** Visual editors and templates produce clean output without any AI.

When in doubt, look for **clusters** of tells, not isolated ones. A single em dash means nothing; em dashes plus rule-of-three plus *vibrant tapestry* plus a "Conclusion" section is a confession.


### Signs of human writing (preserve these)

When you see these, lean toward leaving the prose alone. They are evidence of a real person writing, and over-editing will destroy what makes the piece sound human:

- **Specific, unusual, hard-to-fabricate detail.** A real address. A weird quote. The phrase "the lawyer who used to work upstairs from my dentist." LLMs round off specifics; humans hoard them.
- **Mixed feelings and unresolved tension.** "I think this is mostly good, but it bothers me, and I can't fully explain why." LLMs default to clean takes.
- **Dated, era-bound references.** Slang, memes, or in-jokes that map to a specific year and subculture. Models lag by a year or more.
- **First-person editorial choices the writer can defend.** If the writer can explain *why* they made a particular cut or used a particular word, that's a strong human signal.
- **Variety in sentence length.** Real writing alternates short and long. AI writing tends toward an even, mid-length cadence.
- **Genuine asides, parentheticals, or self-corrections.** "(I keep wanting to say 'almost' here, but it really was certain.)" Models rarely interrupt themselves like this.
- **Edits made before November 30, 2022.** ChatGPT's public launch. Anything older than that is, with very rare exceptions, not AI-written.

