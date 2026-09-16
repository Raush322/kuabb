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

const contentTypes: Array<{ code: ContentTypeCode; name: string }> = [
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

function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\//g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function main() {
  await prisma.$transaction([
    ...topics.map((name, index) =>
      prisma.topic.upsert({
        where: { slug: toSlug(name) },
        create: { name, slug: toSlug(name), sortOrder: index + 1 },
        update: { name, sortOrder: index + 1, isActive: true },
      }),
    ),
    ...tags.map((name) =>
      prisma.tag.upsert({
        where: { slug: toSlug(name) },
        create: { name, slug: toSlug(name) },
        update: { name, isActive: true },
      }),
    ),
    ...contentTypes.map(({ code, name }, index) =>
      prisma.contentType.upsert({
        where: { code },
        create: { code, name, sortOrder: index + 1 },
        update: { name, sortOrder: index + 1, isActive: true },
      }),
    ),
  ]);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
