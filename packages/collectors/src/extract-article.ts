import { prisma } from "@learning-intelligence/database";
import { extractWefArticle } from "./article-extractor.js";

async function main() {
  console.log("Finding article in database...");

  const article = await prisma.article.findFirst({
    where: {
      title: {
        contains:
          "What skills do employers want from young people entering the workforce",
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!article) {
    throw new Error("Article not found in database");
  }

  console.log("\nArticle found:");
  console.log(`Title: ${article.title}`);
  console.log(`URL: ${article.url}`);

  console.log("\nExtracting article...");

  const extracted = await extractWefArticle(article.url);

  console.log("\n==============================");
  console.log("EXTRACTED ARTICLE");
  console.log("==============================");

  console.log(`\nTitle: ${extracted.title}`);
  console.log(`Author: ${extracted.author ?? "not found"}`);
  console.log(`Published: ${extracted.publishedAt ?? "not found"}`);
  console.log(`Text length: ${extracted.text.length}`);

  console.log("\n------------------------------");
  console.log("ARTICLE TEXT");
  console.log("------------------------------\n");

  console.log(extracted.text);
}

main()
  .catch((error) => {
    console.error("Extraction failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });