---
name: web-research
description: Use when answering questions that need current, factual, or externally-sourced information — anything the model cannot answer authoritatively from its own knowledge. Guides live web research with the Firecrawl tools.
---

# Web research

Answer from live sources, not from memory. The Firecrawl tools are the way to reach the web.

## Method

1. **Search first.** Use `FIRECRAWL_SEARCH` with a focused query (5–10 words, no filler). Prefer 2–3 precise searches over one vague one. Vary the angle between searches — entity name, the specific claim, the timeframe — rather than rephrasing the same words.
2. **Read what matters.** When a result looks load-bearing, fetch the actual page with `FIRECRAWL_SCRAPE` rather than trusting the snippet. Snippets truncate and mislead.
3. **Crawl only when the answer is spread across a site** (`FIRECRAWL_CRAWL` / `FIRECRAWL_MAP_MULTIPLE_URLS_BASED_ON_OPTIONS`); it is slower and costs more credits than search + scrape.
4. **Stop when saturated.** When two independent sources agree and nothing new is appearing, answer.

## Answering

- Cite sources inline as markdown links on the claims they support.
- Distinguish what sources say from what you infer; say which is which when it matters.
- If sources conflict, present the conflict — do not silently pick a side.
- If the answer genuinely is not findable, say so and show what you searched.
