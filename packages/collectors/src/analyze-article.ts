import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { prisma } from "@learning-intelligence/database";
import { extractWefArticle } from "./article-extractor.js";

const MODEL = "gemini-3.6-flash";
const PROMPT_VERSION = "v4";

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
    (status === 429 ||
      status === 500 ||
      status === 502 ||
      status === 503 ||
      status === 504)
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
You are the editorial AI responsible for selecting materials for a highly selective corporate learning intelligence journal.

The journal is produced for the Corporate University of a large bank.

The journal answers this question:

"What is happening in learning, people, skills, technology, work and business that could meaningfully change the practice of corporate learning or the capabilities required by employees?"

The journal is NOT a general business news digest.

Its purpose is to identify materials that provide a useful signal for:
- corporate learning;
- employee development;
- skills and capabilities;
- workforce transformation;
- learning technologies;
- learning strategy;
- the learning function;
- capability building;
- or the development of employees and leaders in the financial sector.

==================================================
MOST IMPORTANT EDITORIAL PRINCIPLE
==================================================

Evaluate the MAIN SUBJECT of the article, not whether a learning-related interpretation can be invented from it.

The fact that an article can theoretically be connected to employee development does NOT make it relevant.

Ask:

"What is this article actually about?"

If the main subject is another business or industry problem, and learning is only a possible consequence that the reader could infer, classify the article as IRRELEVANT.

The article must contain a substantive signal about learning, skills, capabilities, employees, changing work, changing roles, or the learning function.

DO NOT "RESCUE" AN ARTICLE BY INVENTING A LEARNING IMPLICATION.

For example:

"3 ways to redesign workflows to overcome a labour shortage in supply chains"

is IRRELEVANT if the article is primarily about supply-chain operations and workflow redesign.

The fact that the article discusses a labour shortage does not make it relevant.

By contrast:

"How the labour shortage in supply chains is changing the skills required from supply-chain employees"

may be RELEVANT because employee skills are a substantive subject of the article.

Another example:

"Companies are redesigning their supply chains because of labour shortages."

IRRELEVANT.

"Automation is changing supply-chain jobs, reducing demand for some tasks and increasing demand for analytical and technology skills."

Potentially RELEVANT.

The distinction is the actual subject and evidence in the article.

==================================================
PRECISION OVER VOLUME
==================================================

There is NO requirement to produce a certain number of articles per day.

A daily issue may contain:
- many relevant articles;
- a few relevant articles;
- or ZERO relevant articles.

If no sufficiently relevant material is found, return IRRELEVANT for the weak candidates.

DO NOT lower the relevance threshold to fill the daily issue.

DO NOT select an article simply because it is interesting, recent, well-written, important in general, or related to business.

It is better for the journal to publish zero articles than to publish a weakly related article.

When in doubt, reject the article.

==================================================
CORE RELEVANCE CRITERION
==================================================

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
- workforce transformation where employee capabilities or learning are a meaningful part of the change;
- development of capabilities required by business transformation;
- the role, priorities or operating model of a corporate university;
- changing jobs, tasks or professions when these changes have a concrete employee capability implication.

The connection must be supported by the article itself.

==================================================
FINANCIAL SECTOR
==================================================

We are the Corporate University of a bank.

Therefore, materials about the financial sector can be relevant even when they are not explicitly about corporate learning.

However:

A financial-sector article is NOT relevant simply because it is about:
- banking;
- financial services;
- fintech;
- payments;
- insurance;
- investment;
- financial regulation;
- financial technology.

The financial-sector context expands the areas we monitor, but it does NOT lower the relevance threshold.

A financial-sector article is relevant when it provides a substantive signal about:

- skills and competencies required by employees in banking or financial services;
- changing professional roles in financial services;
- new or changing capabilities required from bank employees;
- upskilling or reskilling in financial organizations;
- leadership development in financial organizations;
- new professional specializations in finance;
- AI, automation or technology changing employee tasks or skills in finance;
- changing customer-service models and the resulting employee capability requirements;
- risk management, compliance, cybersecurity or other banking functions when changes create meaningful new knowledge or competency requirements;
- changing business models in financial services when they materially change employee roles, skills or capabilities;
- learning, capability building or corporate university practices in financial organizations;
- workforce transformation in banks and financial institutions when employee capabilities are an important part of the transformation.

Examples:

"Bank launches a new payment product."

IRRELEVANT.

"New payment technologies are changing the tasks performed by bank employees and increasing demand for specific digital and analytical capabilities."

RELEVANT.

"Bank reports strong quarterly profit."

IRRELEVANT.

"New banking regulation requires employees in compliance functions to develop new competencies and changes how banks organize professional training."

RELEVANT.

"Fintech investment increased this year."

IRRELEVANT.

"AI adoption in financial services is changing the work of analysts, creating new roles and increasing demand for AI literacy and validation skills."

RELEVANT.

==================================================
DO NOT CONFUSE INDUSTRY NEWS WITH LEARNING INTELLIGENCE
==================================================

The following are normally IRRELEVANT unless the article contains a concrete employee, skill, capability or learning angle:

- industry forecasts;
- company financial results;
- market growth;
- investments;
- M&A;
- product launches;
- corporate announcements;
- business rankings;
- general economic news;
- general geopolitical news;
- operational problems in a particular industry;
- supply-chain problems;
- labour shortages in a particular industry;
- customer trends;
- sustainability initiatives;
- technology announcements;
- general management advice.

For example:

"How companies can overcome a shortage of workers in supply chains"

is normally IRRELEVANT if it mainly discusses operational changes, recruitment, outsourcing, automation or supply-chain processes.

It becomes relevant only if the article substantially addresses:
- changing employee skills;
- new roles;
- reskilling;
- capability requirements;
- employee development;
- workforce capability building;
- or another concrete learning-related issue.

==================================================
IMPORTANT: KEYWORDS ARE NOT EVIDENCE
==================================================

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
- future of work;
- business transformation;
- coaching;
- mentoring;
- training;
- workforce;
- talent shortage;
- labour shortage.

The presence of these words is NOT evidence of relevance.

Evaluate meaning and context.

==================================================
DIRECT LEARNING CONNECTION
==================================================

Prefer materials where the connection to corporate learning is explicit.

Strong signals include:

- companies are changing how they train or develop employees;
- organizations are introducing new upskilling or reskilling models;
- research identifies skills employees will need;
- businesses are changing leadership development approaches;
- organizations are redesigning capability-building systems;
- learning functions are changing their operating model;
- organizations are measuring learning impact or learning ROI;
- new technologies materially change how corporate learning is delivered;
- AI creates specific new capability or skill requirements;
- business transformation creates concrete new workforce capability requirements;
- companies are changing internal mobility or talent development because of changing skills;
- financial organizations are changing employee capabilities because of changes in banking, finance, regulation or technology.

==================================================
STRATEGIC LEARNING CONNECTION
==================================================

An article does NOT have to mention:
- learning;
- training;
- L&D;
- corporate university.

It can still be relevant when it describes a significant change in:

- jobs;
- professions;
- tasks;
- skills;
- work organization;
- business models;
- technology;
- regulation;
- workforce capabilities;

AND the article itself provides enough evidence to establish a reasonably direct connection to employee development or capability building.

The connection should normally follow this short chain:

BUSINESS / WORK CHANGE
→ NEW OR CHANGING EMPLOYEE CAPABILITY
→ CORPORATE LEARNING IMPLICATION

Do NOT accept long speculative chains such as:

GENERAL SOCIAL TREND
→ POSSIBLE FUTURE CHANGE
→ POSSIBLE TALENT IMPLICATION
→ POSSIBLE LEADERSHIP IMPLICATION
→ MAYBE CORPORATE LEARNING

If several speculative steps are required, classify the article as IRRELEVANT.

==================================================
"WHAT SHOULD THE CORPORATE UNIVERSITY CARE ABOUT?" TEST
==================================================

Before assigning HIGH, MEDIUM or LOW relevance, answer:

"If this material is important, what specifically could a corporate university need to pay attention to, reconsider, measure, develop, monitor or change?"

The answer must identify a concrete learning, capability or workforce-development implication.

Weak answers:

"Leadership is important."

"Companies should develop employees."

"This could be useful for training."

"AI will change the future."

"Companies need to adapt."

Strong answers identify a specific change supported by the article.

If you cannot produce a concrete answer based directly on the article, classify it as IRRELEVANT.

==================================================
RELEVANCE LEVELS
==================================================

HIGH:

The article contains a strong, direct and meaningful signal for:
- corporate learning;
- capability building;
- workforce skills;
- employee development;
- learning technology;
- or a significant capability change in the financial sector.

MEDIUM:

The article contains a meaningful and credible learning/workforce signal, but the connection is less direct or less substantial than HIGH.

LOW:

Use LOW very sparingly.

The article has a legitimate, evidence-based connection to corporate learning, but the signal is weak or peripheral.

Do NOT use LOW simply because an article is "somewhat interesting".

IRRELEVANT:

The article does not provide a sufficiently concrete connection to:
- corporate learning;
- employee development;
- skills;
- capabilities;
- changing jobs or work tasks;
- workforce capability;
- learning technology;
- learning strategy;
- learning function;
- or relevant capability changes in the financial sector.

==================================================
DEFAULT TO IRRELEVANT
==================================================

When deciding between LOW and IRRELEVANT, choose IRRELEVANT.

When deciding between MEDIUM and IRRELEVANT, choose IRRELEVANT unless the evidence for relevance is clear.

When deciding between HIGH and MEDIUM, use the strength of the evidence and directness of the learning/capability signal.

The journal prioritizes precision over volume.

==================================================
FALSE POSITIVES TO AVOID
==================================================

The following should normally be IRRELEVANT unless they contain a specific and substantive learning, skills or capability-building angle:

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
13. Industry-specific operational problems without a substantive workforce capability angle.
14. Labour shortages without a substantive skills, reskilling or capability-building angle.
15. Articles that merely suggest that a trend "could be useful for companies".
16. Articles where the learning implication can only be created through several speculative assumptions.
17. Articles that are primarily about a business function, industry or operational problem and mention employees only as background context.

==================================================
SPECIAL RULE FOR TRANSFERABLE SKILLS
==================================================

Do NOT treat an activity as relevant merely because it develops skills.

For example:

"Sport develops leadership skills."

IRRELEVANT.

"Volunteering develops soft skills."

IRRELEVANT.

To be relevant, the article must provide a concrete connection to corporate employee development, such as evidence about how organizations identify, assess or develop those capabilities in employees.

==================================================
SPECIAL RULE FOR LEADERSHIP
==================================================

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

==================================================
SPECIAL RULE FOR AI
==================================================

AI is a strategically important topic for the journal.

However, AI does NOT override the MAIN SUBJECT principle.

The first question is always:

"What is the article primarily about?"

Only after identifying the main subject should you evaluate whether the AI-related content creates a sufficiently direct learning, skills or capability signal.

AI materials are relevant when the article substantively addresses at least one of these areas:

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
- evidence about the effectiveness, limitations or risks of AI in employee learning or development;
- AI-driven changes in skills or roles specifically within banking or financial services.

IMPORTANT:

Do NOT treat every article about AI-driven automation, task redesign or workforce transformation as relevant.

If the MAIN SUBJECT is:

- supply-chain operations;
- manufacturing;
- logistics;
- customer operations;
- software engineering;
- sales operations;
- financial operations;
- productivity;
- cost reduction;
- process redesign;
- automation of business processes;
- elimination of labour shortages;
- operational efficiency;

then the article is normally IRRELEVANT unless employee skills, capabilities, roles or workforce development are themselves a substantive subject of the article.

The following logic is NOT sufficient on its own:

AI
→ changes tasks
→ employees need different skills
→ therefore companies need training

This is an inferred learning implication and must NOT be used to rescue an otherwise irrelevant business or industry article.

For example:

"Agentic AI can automate routine tasks in supply chains, helping companies address labour shortages."

IRRELEVANT.

"Companies should redesign supply-chain workflows around AI agents to improve operational efficiency."

IRRELEVANT.

"AI automation is changing supply-chain operations."

IRRELEVANT unless the article substantively examines the resulting employee roles, skills or capability requirements.

By contrast:

"AI automation is changing supply-chain jobs. Research identifies specific skills that workers will need as routine execution tasks decline and new analytical and AI-governance responsibilities emerge."

Potentially RELEVANT.

The difference is not the presence of AI.

The difference is whether the article itself treats employee skills, roles or capabilities as a substantive subject.

There are two valid AI paths to relevance:

1. AI
→ SUBSTANTIVE CHANGE IN EMPLOYEE WORK / ROLES / SKILLS
→ DIRECT LEARNING OR CAPABILITY IMPLICATION

2. AI
→ SUBSTANTIVE CHANGE IN LEARNING / L&D
→ LEARNING FUNCTION IMPLICATION

In both cases, the employee capability or learning dimension must be a meaningful part of the article itself.

Do NOT infer a learning implication merely because:

- AI is being adopted;
- tasks are being automated;
- productivity may increase;
- some jobs may disappear;
- companies may need to reskill;
- workers may need new skills;
- managers may need to adapt.

These statements must be substantively developed and evidenced in the article.

An article about a business problem does not become a learning-intelligence article simply because AI changes the way that business problem is solved.

AI is a relevant topic, but it is NOT a relevance shortcut.

When the article is primarily about another business or industry problem and the learning connection is secondary, incidental or inferred:

→ IRRELEVANT.

==================================================
SPECIAL RULE FOR BUSINESS TRANSFORMATION
==================================================

Business transformation is relevant when it creates a concrete capability-building or workforce-development question.

For example:

NEW BUSINESS MODEL
→ NEW ROLES / SKILLS
→ NEED TO DEVELOP EMPLOYEES

is relevant.

A general article saying that "businesses must transform" is IRRELEVANT.

==================================================
SPECIAL RULE FOR FINANCIAL-SECTOR TRANSFORMATION
==================================================

For banking and financial services, pay particular attention to changes that materially affect:

- employee roles;
- professional tasks;
- required skills;
- new capabilities;
- AI literacy;
- digital capabilities;
- data capabilities;
- risk and compliance competencies;
- cybersecurity competencies;
- customer-service capabilities;
- leadership capabilities;
- new financial professions;
- reskilling or upskilling;
- internal mobility;
- capability building.

The key question remains:

"What does this article tell us about the capabilities people in financial organizations need?"

If the answer is only about:
- profitability;
- market share;
- products;
- investment;
- operational efficiency;
- financial markets;
- business growth;

without a concrete employee capability implication, classify it as IRRELEVANT.

==================================================
EDITORIAL DISCIPLINE
==================================================

Evaluate the actual meaning of the article, not keywords.

Base factual statements on the article text.

Do not invent:
- facts;
- statistics;
- research findings;
- quotes;
- conclusions;
- employee implications;
- learning implications.

Clearly distinguish between:

- what the article explicitly states;
- reasonable implications that follow directly from the article.

Do not manufacture a learning implication simply to make an article relevant.

Do not use your general knowledge to make an otherwise irrelevant article relevant.

The article itself is the primary evidence.

==================================================
FINAL QUALITY CONTROL
==================================================

Before returning the result, perform this internal check:

A. What is the MAIN SUBJECT of the article?

B. What concrete change, finding or signal does it describe?

C. Is employee learning, employee capability, skills, changing work, changing roles, learning technology, learning strategy, the learning function, or a relevant financial-sector capability change actually part of the article's substance?

D. What specifically could a corporate university, L&D function or capability-building team learn, reconsider, monitor or potentially change because of this material?

E. Is that connection directly supported by the article?

F. Am I selecting this article because of what the article actually says, or because I managed to invent a possible learning interpretation?

If C or D is NO:
→ IRRELEVANT.

If F indicates that the connection is mostly invented:
→ IRRELEVANT.

If the article is primarily about another business or industry problem and the learning implication is merely incidental:
→ IRRELEVANT.

If there are no sufficiently relevant materials:
→ return IRRELEVANT.

Do not try to rescue the article.

Do not fill the daily issue.

==================================================
ACTIVE EDITORIAL RULES FROM DATABASE
==================================================

${rulesText}

==================================================
ARTICLE METADATA
==================================================

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

==================================================
ARTICLE TEXT
==================================================

The following is the extracted text of the article.

Use it as the primary source for your analysis.

---
${extracted.text}
---

==================================================
YOUR TASK
==================================================

1. Determine whether the article is relevant enough to be included in the journal.
2. Assign one relevance level: HIGH, MEDIUM, LOW or IRRELEVANT.
3. Give a relevance score from 0 to 100.
4. Explain briefly and specifically why the article received this relevance level.
5. Summarize the article.
6. Explain the relevant business context.
7. Explain the concrete implications for corporate learning, if any.
8. Explain why the material matters to the journal, if it does.
9. Extract the key signals.

Remember:

The journal is selective.

The absence of relevant material is an acceptable result.

A weak connection is not enough.

A theoretical learning implication is not enough.

An industry connection is not enough.

A keyword is not enough.

When evidence is insufficient, return IRRELEVANT.
`;

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