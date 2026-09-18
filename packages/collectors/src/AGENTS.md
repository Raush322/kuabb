# Learning Intelligence + Banking

## Project

This is a corporate learning intelligence journal for the Corporate University.

The product collects articles from selected international and Russian sources,
analyzes them with AI, determines relevance to corporate learning, and later
presents the results through a web interface.

Core question:

"What is happening in learning, people, skills, technology and business that
could potentially change the practice of corporate learning?"

## Important

The user is not a programmer.

Work in small, verifiable steps.
Do not make large changes without explaining them.
Do not rewrite working parts unnecessarily.
After each meaningful change, explain how to test it.

## Current stack

- Next.js
- TypeScript
- PostgreSQL
- Prisma
- Node.js worker
- BullMQ + Redis planned
- Gemini API for article analysis
- Docker Compose planned
- Git

## Repository structure

apps/
  web/

packages/
  database/
  collectors/
  ai/
  shared/
  config/

docs/
infra/

## Database

The Prisma schema already exists.

Main content tables:

- Article
- ArticleSource
- ArticleTopic
- ArticleTag
- ArticleAnalysis

Source tables:

- Source
- SourceFeed

AI/editorial:

- RelevanceRule
- AiPrompt

Collection:

- CollectionRun
- CollectionItem

Digests:

- Digest
- DigestArticle

## Current working source

World Economic Forum (WEF).

Collector:

packages/collectors/src/wef-db.ts

Article extractor:

packages/collectors/src/article-extractor.ts

AI analyzer:

packages/collectors/src/analyze-article.ts

## Gemini

Gemini API is working.

Current model:

gemini-3.6-flash

The API key is stored in:

packages/collectors/.env

Never ask the user to provide or paste the API key.

## Current AI pipeline

Article
→ extract full article text
→ load relevance rules
→ Gemini analysis
→ save ArticleAnalysis

The reusable function is:

analyzeArticle(articleId)

Important:
analyze-article.ts must NOT execute analysis automatically when imported.

A separate test script exists:

packages/collectors/src/analyze-latest.ts

## Current WEF collector

The collector currently:

1. downloads WEF article sitemap pages;
2. finds article URLs;
3. fetches article metadata;
4. filters by publication date;
5. checks canonical URL against the database;
6. creates new Article records;
7. creates ArticleSource;
8. creates CollectionItem;
9. automatically calls analyzeArticle() for NEW articles.

Duplicate articles are not sent to Gemini.

## Current problem

The WEF sitemap contains up to 1500 URLs across 3 pages.

The current collector downloads article pages before determining whether
they are fresh.

This is inefficient.

The collector recently produced:

"Unique stories found: 1500"

and then attempted to fetch a very large number of article URLs.

This caused the user to stop the process.

The next task is to inspect the WEF sitemap structure and determine whether
publication/update dates are available directly in the sitemap.

Goal:

WEF sitemap
→ URL + date
→ filter old articles BEFORE downloading article pages
→ fetch only fresh articles
→ save to DB
→ analyze NEW articles with Gemini

Do NOT solve this by simply reducing MAX_PAGES.
The architecture should correctly filter old articles before expensive article
requests.

## Retry

A retry mechanism was temporarily added to fetchHtml():

- maximum 3 attempts
- 2 second delay

Keep this if useful, but do not let retry hide the underlying inefficient
collection logic.

## Recent successful tests

The automatic pipeline has already been partially verified.

A genuinely new WEF article was created:

"How women's sport could help to close the leadership gender gap"

Article ID:

a5dda344-eef9-4632-be4e-de6ddf6982aa

The collector automatically called:

analyzeArticle(articleId)

The article text was successfully extracted.

Gemini was called.

Gemini returned HTTP 503 because of temporary high demand.

Therefore:

WEF → Article → automatic analyzeArticle()
is confirmed to work.

Gemini availability/retry is a separate issue.

## Editorial relevance rules

Relevant if a material can influence:

- corporate learning practice;
- employee development;
- organization of the learning function;
- learning technologies;
- understanding of future skills.

Also relevant if it contains a meaningful signal about transformation of work,
professions or skills that may require changes in corporate learning.

Exclude:

- school education;
- university news;
- generic promotional EdTech press releases;
- motivational content;
- vacancies;
- generic HR content without learning implications;
- corporate news without learning/workforce implications.

## Main topics

1. Learning
2. Technology & AI
3. People & Skills
4. Future of Work
5. Leadership & Organization
6. Business Transformation
7. Financial Sector
8. Research & Evidence

Important intersection topics include:

- Capability Building
- Skills-based Organization
- Learning ROI / Impact
- Workforce Transformation
- Reskilling for Transformation
- Learning & Change Management
- Corporate University as Business Partner
- AI & Business Capability
- Job Redesign & Learning

## Development philosophy

Do not build everything at once.

Preferred order:

1. make one source reliable;
2. verify collection;
3. verify AI analysis;
4. commit to Git;
5. add second source;
6. generalize extractors;
7. add topics/tags;
8. build web interface;
9. automate collection;
10. add more sources.

Always preserve working functionality.

When changing a file, prefer showing the complete replacement file
if the user is expected to copy it.

Never ask the user to paste secrets.