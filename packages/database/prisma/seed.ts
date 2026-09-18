import { ContentTypeCode } from "../src/generated/prisma/client.js";

import { prisma } from "../src/client.js";

const topics = [
  "Learning",
  "Technology & AI",
  "People & Skills",
  "Future of Work",
  "Leadership & Organization",
  "Business Transformation",
  "Financial Sector",
  "Research & Evidence",
];

const tags = [
  "Capability Building",
  "Skills-based Organization",
  "Learning ROI / Impact",
  "Workforce Transformation",
  "Reskilling for Transformation",
  "Productivity & Learning",
  "Learning & Performance",
  "Learning & Internal Mobility",
  "Learning & Talent Strategy",
  "Learning & Change Management",
  "Learning & Organizational Transformation",
  "Learning & Innovation",
  "Learning & Customer Experience",
  "Learning & Risk",
  "Learning & Compliance",
  "Learning & Sales",
  "Learning & Leadership Pipeline",
  "Learning Ecosystem",
  "Learning Function Transformation",
  "Corporate University as Business Partner",
  "Learning Analytics & Business Analytics",
  "AI & Business Capability",
  "Job Redesign & Learning",
  "Future Skills & Business Models",
];

const sources = [
  {
    name: "World Economic Forum",
    slug: "world-economic-forum",
    url: "https://www.weforum.org/",
    country: "CH",
    language: "en",
    sourceType: "ORGANIZATION" as const,
    priority: 100,
    description:
      "International organization publishing research, analysis and perspectives on business, technology, skills and the future of work.",
    trustScore: 0.95,
  },
];

const sourceFeeds = [
  {
    sourceSlug: "world-economic-forum",
    feedType: "SITEMAP" as const,
    url: "https://www.weforum.org/sitemap/articles/",
  },
];

const contentTypes: Array<{
  code: ContentTypeCode;
  name: string;
}> = [
  { code: "NEWS", name: "News" },
  { code: "RESEARCH", name: "Research" },
  { code: "REPORT", name: "Report" },
  { code: "TREND", name: "Trend" },
  { code: "CASE", name: "Case" },
  { code: "PRODUCT", name: "Product" },
  { code: "OPINION", name: "Opinion" },
  { code: "ANALYSIS", name: "Analysis" },
  { code: "EVENT", name: "Event" },
  { code: "REGULATION", name: "Regulation" },
  { code: "DATA", name: "Data" },
];

const relevanceRules = [
  {
    name: "Влияние на корпоративное обучение",
    ruleType: "INCLUDE",
    priority: 100,
    ruleText:
      "Материал релевантен, если он может повлиять на практику корпоративного обучения, развитие сотрудников, организацию learning-функции, технологии обучения или подходы к развитию навыков.",
  },
  {
    name: "Трансформация работы и навыков",
    ruleType: "INCLUDE",
    priority: 90,
    ruleText:
      "Релевантны материалы о том, как меняются профессии, рабочие задачи, навыки и требования к сотрудникам, если эти изменения могут потребовать изменений в корпоративном обучении и развитии.",
  },
  {
    name: "Бизнес-трансформация и обучение",
    ruleType: "INCLUDE",
    priority: 80,
    ruleText:
      "Релевантны материалы о трансформации бизнеса, если они содержат значимый сигнал для развития capabilities, workforce, навыков, обучения или организационных изменений.",
  },
  {
    name: "Исследования и данные",
    ruleType: "INCLUDE",
    priority: 70,
    ruleText:
      "Релевантны исследования, отчёты и данные об обучении, навыках, workforce, будущем работы, эффективности развития сотрудников и других факторах, которые помогают принимать решения в корпоративном обучении.",
  },
  {
    name: "Школьное и университетское образование",
    ruleType: "EXCLUDE",
    priority: 100,
    ruleText:
      "Не включать материалы, посвящённые исключительно школьному или университетскому образованию, если они не содержат значимого сигнала для корпоративного обучения, навыков или будущего работы.",
  },
  {
    name: "Рекламный EdTech-контент",
    ruleType: "EXCLUDE",
    priority: 90,
    ruleText:
      "Не включать рекламные материалы, пресс-релизы и продвижение EdTech-продуктов сами по себе. Материал может быть релевантен, если кроме продвижения содержит самостоятельный значимый сигнал о развитии технологий обучения или практики L&D.",
  },
  {
    name: "Общий HR-контент без learning implication",
    ruleType: "EXCLUDE",
    priority: 80,
    ruleText:
      "Не включать материалы о найме, компенсациях, вакансиях, HR-процессах и employee experience, если они не содержат существенного влияния на обучение, навыки, workforce transformation или развитие организации.",
  },
];

function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function main() {
  await prisma.$transaction(async (tx) => {
    for (const [index, name] of topics.entries()) {
      await tx.topic.upsert({
        where: {
          slug: toSlug(name),
        },
        create: {
          name,
          slug: toSlug(name),
          sortOrder: index + 1,
        },
        update: {
          name,
          sortOrder: index + 1,
          isActive: true,
        },
      });
    }

    for (const name of tags) {
      await tx.tag.upsert({
        where: {
          slug: toSlug(name),
        },
        create: {
          name,
          slug: toSlug(name),
        },
        update: {
          name,
          isActive: true,
        },
      });
    }

    for (const [index, { code, name }] of contentTypes.entries()) {
      await tx.contentType.upsert({
        where: {
          code,
        },
        create: {
          code,
          name,
          sortOrder: index + 1,
        },
        update: {
          name,
          sortOrder: index + 1,
          isActive: true,
        },
      });
    }

    for (const rule of relevanceRules) {
      await tx.relevanceRule.upsert({
        where: {
          name: rule.name,
        },
        create: {
          name: rule.name,
          ruleType: rule.ruleType,
          priority: rule.priority,
          ruleText: rule.ruleText,
          isActive: true,
        },
        update: {
          ruleType: rule.ruleType,
          priority: rule.priority,
          ruleText: rule.ruleText,
          isActive: true,
        },
      });
    }

    for (const source of sources) {
      await tx.source.upsert({
        where: {
          slug: source.slug,
        },
        create: source,
        update: {
          name: source.name,
          url: source.url,
          country: source.country,
          language: source.language,
          sourceType: source.sourceType,
          priority: source.priority,
          description: source.description,
          trustScore: source.trustScore,
          isActive: true,
        },
      });
    }

    for (const feed of sourceFeeds) {
      const source = await tx.source.findUniqueOrThrow({
        where: {
          slug: feed.sourceSlug,
        },
      });

      await tx.sourceFeed.upsert({
        where: {
          sourceId_url: {
            sourceId: source.id,
            url: feed.url,
          },
        },
        create: {
          sourceId: source.id,
          feedType: feed.feedType,
          url: feed.url,
        },
        update: {
          feedType: feed.feedType,
          isActive: true,
        },
      });
    }
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });