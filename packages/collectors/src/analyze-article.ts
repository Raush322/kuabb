import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { prisma } from "@learning-intelligence/database";
import { extractWefArticle } from "./article-extractor.js";

const MODEL = "gemini-3.6-flash";
const PROMPT_VERSION = "v3";

const MAX_AI_ATTEMPTS = 3;
const AI_RETRY_DELAYS_MS = [3000, 6000];

type AnalysisResult = {
  relevance: "HIGH" | "MEDIUM" | "LOW" | "IRRELEVANT";
  relevanceScore: number;
  relevanceReason: string;
  summary: string;
  businessContext: string;
  learningImplications: string;
  whyItMatters: string;
  keySignals: string[];
};

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("GEMINI_API_KEY is not set.");
}

const ai = new GoogleGenAI({
  apiKey,
});

function isRetryableAiError(error: unknown): boolean {
  if (!error) {
    return false;
  }

  const errorObject = error as {
    status?: number;
    code?: number;
    message?: string;
  };

  const status = errorObject.status ?? errorObject.code;

  if (
    typeof status === "number" &&
    (status === 429 || status === 500 || status === 502 || status === 503 || status === 504)
  ) {
    return true;
  }

  const message =
    typeof errorObject.message === "string"
      ? errorObject.message.toLowerCase()
      : String(error).toLowerCase();

  return (
    message.includes("503") ||
    message.includes("429") ||
    message.includes("500") ||
    message.includes("502") ||
    message.includes("504") ||
    message.includes("unavailable") ||
    message.includes("overloaded") ||
    message.includes("high demand") ||
    message.includes("rate limit") ||
    message.includes("temporarily")
  );
}

async function generateContentWithRetry(prompt: string) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_AI_ATTEMPTS; attempt++) {
    try {
      console.log(
        `Gemini attempt ${attempt}/${MAX_AI_ATTEMPTS}...`,
      );

      return await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: {
            type: "object",
            properties: {
              relevance: {
                type: "string",
                enum: [
                  "HIGH",
                  "MEDIUM",
                  "LOW",
                  "IRRELEVANT",
                ],
              },
              relevanceScore: {
                type: "number",
                minimum: 0,
                maximum: 100,
              },
              relevanceReason: {
                type: "string",
              },
              summary: {
                type: "string",
              },
              businessContext: {
                type: "string",
              },
              learningImplications: {
                type: "string",
              },
              whyItMatters: {
                type: "string",
              },
              keySignals: {
                type: "array",
                items: {
                  type: "string",
                },
              },
            },
            required: [
              "relevance",
              "relevanceScore",
              "relevanceReason",
              "summary",
              "businessContext",
              "learningImplications",
              "whyItMatters",
              "keySignals",
            ],
            additionalProperties: false,
          },
        },
      });
    } catch (error) {
      lastError = error;

      const retryable = isRetryableAiError(error);

      console.error(
        `Gemini attempt ${attempt} failed.`,
      );
      console.error(error);

      if (!retryable || attempt === MAX_AI_ATTEMPTS) {
        throw error;
      }

      const delay =
        AI_RETRY_DELAYS_MS[attempt - 1] ?? 6000;

      console.log(
        `Temporary Gemini error. Retrying in ${delay / 1000} seconds...`,
      );

      await new Promise((resolve) =>
        setTimeout(resolve, delay),
      );
    }
  }

  throw lastError ?? new Error("Gemini request failed.");
}

export async function analyzeArticle(articleId: string) {
  console.log(`\nAnalyzing article: ${articleId}`);

  const article = await prisma.article.findUnique({
    where: {
      id: articleId,
    },
  });

  if (!article) {
    throw new Error(`Article not found: ${articleId}`);
  }

  console.log(`Title: ${article.title}`);
  console.log(`URL: ${article.url}`);

  console.log("\nExtracting article text...");

  const extracted = await extractWefArticle(article.url);

  if (!extracted.text) {
    throw new Error("Article extraction returned empty text.");
  }

  console.log(`Extracted text length: ${extracted.text.length}`);

  console.log("\nLoading relevance rules...");

  const rules = await prisma.relevanceRule.findMany({
    where: {
      isActive: true,
    },
    orderBy: {
      priority: "desc",
    },
  });

  if (rules.length === 0) {
    throw new Error("No active relevance rules found.");
  }

  console.log(`Active rules: ${rules.length}`);

  const rulesText = rules
    .map(
      (rule) =>
        `- [${rule.ruleType}] Priority ${rule.priority}: ${rule.name}\n  ${rule.ruleText}`,
    )
    .join("\n");

    const prompt = `
You are the editorial AI responsible for selecting materials for a corporate learning intelligence journal.

The journal answers one specific question:

"What is happening in learning, people, skills, technology and business that could potentially change the practice of corporate learning?"

The journal is intended for a corporate university of a large bank.

CORE RELEVANCE CRITERION

A material is relevant only if it provides a concrete and meaningful signal that could influence at least one of the following:

- corporate learning strategy;
- employee development;
- upskilling or reskilling;
- future skills or changing skill requirements;
- leadership development;
- learning technologies;
- learning analytics;
- organization or operating model of the learning function;
- capability building;
- skills-based workforce practices;
- workforce transformation where learning is a meaningful response;
- development of capabilities required by business transformation;
- the role, priorities or operating model of a corporate university.

IMPORTANT:

Do NOT include an article merely because it mentions:
- leadership;
- employees;
- HR;
- talent;
- diversity;
- inclusion;
- AI;
- technology;
- skills;
- productivity;
- the future of work;
- business transformation;
- coaching;
- mentoring;
- training.

The presence of these keywords is NOT evidence of relevance.

DIRECT LEARNING CONNECTION

Prefer materials where the connection to corporate learning is explicit.

Examples of strong signals:

- companies are changing how they train or develop employees;
- organizations are introducing new upskilling or reskilling models;
- research identifies skills that employees will need;
- businesses are changing leadership development approaches;
- companies are redesigning capability-building systems;
- learning functions are changing their operating model;
- organizations are measuring learning impact or learning ROI;
- new technologies materially change how corporate learning is delivered;
- AI creates specific new capability or skill requirements;
- business transformation creates concrete new workforce capability requirements;
- companies are changing internal mobility or talent development because of changing skills.

STRATEGIC LEARNING CONNECTION

An article does NOT have to mention corporate learning explicitly.

It can still be relevant when it describes a significant change in:

- jobs;
- professions;
- skills;
- work organization;
- business models;
- technology;
- regulation;
- workforce capabilities;

AND the article provides enough evidence to establish a reasonably direct connection to future employee development or capability building.

The connection should normally follow this short chain:

BUSINESS / WORK CHANGE
→ NEW OR CHANGING CAPABILITY REQUIREMENT
→ CORPORATE LEARNING IMPLICATION

Do NOT accept long speculative chains such as:

GENERAL SOCIAL TREND
→ POSSIBLE FUTURE CHANGE
→ POSSIBLE TALENT IMPLICATION
→ POSSIBLE LEADERSHIP IMPLICATION
→ MAYBE CORPORATE LEARNING

If several speculative steps are required, classify the article as IRRELEVANT.

THE "WHAT SHOULD THE CORPORATE UNIVERSITY CARE ABOUT?" TEST

Before assigning HIGH, MEDIUM or LOW relevance, answer this question:

"If this material is important, what specifically could a corporate university need to pay attention to, reconsider, measure, develop or change?"

A valid answer must identify a concrete learning, capability or workforce-development implication.

Weak answers include:

"This is relevant because leadership is important."

"This could help companies develop employees."

"This highlights the importance of diversity."

"Companies could potentially use this for leadership development."

Strong answers identify a concrete change, capability or learning implication supported by the article.

If you cannot produce a concrete answer of this kind based on the article, classify it as IRRELEVANT.

RELEVANCE THRESHOLD

Use the following interpretation:

HIGH:
The article contains a strong, direct and actionable signal for corporate learning, capability building or workforce skills.

MEDIUM:
The article contains a meaningful learning/workforce signal, but the implications are less direct or less substantial.

LOW:
The article has a legitimate connection to corporate learning, but the signal is weak, peripheral or mostly contextual.

IRRELEVANT:
The article does not provide a sufficiently concrete connection to corporate learning, employee development, workforce capabilities or the organization of the learning function.

IMPORTANT:

When in doubt between LOW and IRRELEVANT, choose IRRELEVANT.

The journal prioritizes precision over volume.

FALSE POSITIVES TO AVOID

The following types of articles should normally be classified as IRRELEVANT unless they contain a specific learning or capability-building angle:

1. General diversity and inclusion stories.
2. General gender-gap stories.
3. General leadership stories.
4. General workplace culture stories.
5. General employee wellbeing stories.
6. General business transformation stories.
7. General AI or technology news.
8. General productivity advice.
9. General talent-management commentary.
10. Stories about sports, arts or other activities that claim to develop transferable skills.
11. General economic or geopolitical news without a clear workforce capability implication.
12. Company announcements about products or investments without a meaningful employee capability or learning implication.
13. Articles that merely suggest that a trend "could be useful for companies" without concrete evidence.
14. Articles where the learning implication can only be created through several speculative assumptions.

SPECIAL RULE FOR TRANSFERABLE SKILLS

Do NOT treat an activity as relevant to corporate learning merely because it develops skills.

For example:

"Sport develops leadership skills."

This alone is NOT sufficient.

To be relevant, the article would need to provide a concrete connection to corporate employee development, such as evidence about how organizations identify, assess or develop those capabilities in employees.

Likewise:

"Volunteering develops soft skills."

is not sufficient.

"Employees who participate in structured volunteering programs demonstrate measurable development of specific capabilities, and companies are incorporating this into their development architecture."

could be relevant.

SPECIAL RULE FOR LEADERSHIP

Leadership is relevant only when the material provides a meaningful signal about:

- leadership development;
- leadership capabilities;
- leadership pipelines;
- succession development;
- development methods;
- assessment of leadership capabilities;
- changing requirements for leaders;
- organizational systems for developing leaders.

A general article about the importance of leaders or leadership is IRRELEVANT.

SPECIAL RULE FOR AI

AI is a strategically important topic for the journal.

However, the presence of AI or a new AI technology alone does NOT make an article relevant.

AI materials are relevant when they provide a meaningful signal in at least one of these areas:

- how AI changes the skills employees need;
- which new AI-related capabilities organizations need to build;
- how AI changes existing jobs, roles or professional tasks;
- job redesign caused by AI adoption;
- upskilling or reskilling for AI adoption;
- AI literacy and AI fluency in the workforce;
- how organizations integrate AI into employee work;
- how AI changes management or leadership capabilities;
- how AI changes learning and development itself;
- AI-powered learning technologies;
- personalization or adaptation of learning through AI;
- AI tutors, coaches or assistants for employee development;
- AI assessment, feedback or skills measurement;
- AI-enabled learning content creation;
- changes in the role or operating model of the learning function caused by AI;
- organizational capability building required for successful AI adoption;
- evidence about the effectiveness, limitations or risks of AI in employee learning or development.

There are two valid AI paths to relevance:

1. AI → CHANGE IN WORK / ROLES / SKILLS → LEARNING IMPLICATION

2. AI → CHANGE IN LEARNING / L&D → LEARNING FUNCTION IMPLICATION

Both are relevant.

Do not require an article to mention "training", "learning" or "L&D" if it provides strong evidence that AI is changing the capabilities employees need.

At the same time, do not infer a learning implication merely because AI adoption is discussed.

For example:

"AI agents are increasingly performing routine analytical tasks."

This alone may be insufficient.

But:

"AI agents are increasingly performing routine analytical tasks, while analysts are expected to shift toward validation, judgment and higher-level problem solving."

This contains a concrete skills signal and may be relevant to corporate learning.

For AI-related articles, pay particular attention to:

- changing task composition;
- changing skill requirements;
- emerging roles;
- declining or expanding skills;
- human-AI collaboration;
- AI literacy;
- reskilling;
- capability building;
- workforce transformation;
- learning technology;
- evidence about AI effectiveness in learning.

Do not assume that every AI development requires employee training. The article must provide evidence for the connection.

An article about a new AI model, product, funding round or corporate AI announcement is normally IRRELEVANT unless it also contains a meaningful workforce, capability, skills or learning signal.

SPECIAL RULE FOR BUSINESS TRANSFORMATION

Business transformation is relevant when it creates a concrete capability-building or workforce-development question.

For example:

NEW BUSINESS MODEL
→ NEW ROLES / SKILLS
→ NEED TO DEVELOP EMPLOYEES

is relevant.

A general article saying that "businesses must transform" is not.

EDITORIAL DISCIPLINE

Evaluate the actual meaning of the article, not keywords.

Base factual statements on the article text.

Do not invent facts, statistics, research findings, quotes or conclusions.

Clearly distinguish between:
- what the article explicitly states;
- reasonable implications that follow directly from it.

Do not manufacture a learning implication simply to make an article relevant.

The journal is deliberately selective. It is better to reject a borderline article than to fill the daily issue with loosely related material.

Apply the following editorial rules:

${rulesText}

ARTICLE METADATA

Title:
${article.title}

Original title:
${article.originalTitle ?? article.title}

Author:
${article.author ?? extracted.author ?? "Unknown"}

Published:
${article.publishedAt?.toISOString() ?? extracted.publishedAt ?? "Unknown"}

URL:
${article.url}

ARTICLE TEXT

The following is the extracted text of the article.

Use it as the primary source for your analysis.

---
${extracted.text}
---

Your task:

1. Determine whether the article is relevant enough to be included in the journal.
2. Assign one relevance level: HIGH, MEDIUM, LOW or IRRELEVANT.
3. Give a relevance score from 0 to 100.
4. Explain briefly and specifically why the article received this relevance level.
5. Summarize the article.
6. Explain the relevant business context.
7. Explain the concrete implications for corporate learning, if any.
8. Explain why the material matters to the journal, if it does.
9. Extract the key signals.

FINAL DECISION RULE

Before returning the result, perform this internal check:

A. What is the main subject of the article?
B. What concrete change, finding or signal does it describe?
C. Does that signal affect employee skills, capability building, employee development, changing jobs or work tasks, learning technology, learning strategy, the learning function, or the capabilities required for adopting an important technology such as AI?
D. What specifically could a corporate university, L&D function or capability-building team learn, reconsider, monitor or potentially change because of this material?
E. Is that connection directly supported by the article rather than created through speculation?

If the answer to C or D is no, return:

relevance = "IRRELEVANT"

Do not try to rescue the article by inventing a learning implication.

If the article is relevant, keep the learning implications specific to the evidence in the article rather than producing generic recommendations.
`;

;

  console.log("\nSending article to Gemini...");

  const response = await generateContentWithRetry(prompt);

  if (!response.text) {
    throw new Error("Gemini returned an empty response.");
  }

  const analysis =
    JSON.parse(response.text) as AnalysisResult;

  console.log("\n==============================");
  console.log("AI ANALYSIS");
  console.log("==============================");

  console.log(`Relevance: ${analysis.relevance}`);
  console.log(`Score: ${analysis.relevanceScore}`);
  console.log(`Reason: ${analysis.relevanceReason}`);
  console.log(`Summary: ${analysis.summary}`);
  console.log(
    `Business context: ${analysis.businessContext}`,
  );
  console.log(
    `Learning implications: ${analysis.learningImplications}`,
  );
  console.log(
    `Why it matters: ${analysis.whyItMatters}`,
  );
  console.log(
    `Key signals: ${analysis.keySignals.join("; ")}`,
  );

  console.log("\nSaving analysis to database...");

  const savedAnalysis =
    await prisma.articleAnalysis.create({
      data: {
        articleId: article.id,
        relevance: analysis.relevance,
        relevanceScore: analysis.relevanceScore,
        relevanceReason: analysis.relevanceReason,
        summary: analysis.summary,
        businessContext: analysis.businessContext,
        learningImplications:
          analysis.learningImplications,
        whyItMatters: analysis.whyItMatters,
        keySignals: analysis.keySignals,
        aiModel: MODEL,
        promptVersion: PROMPT_VERSION,
      },
    });

  console.log(
    `ArticleAnalysis created: ${savedAnalysis.id}`,
  );

  return savedAnalysis;
}