import { prisma } from "@learning-intelligence/database";
import { analyzeArticle } from "./analyze-article.js";

async function main() {
  const article = await prisma.article.findFirst({
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!article) {
    throw new Error("No articles found in database.");
  }

  await analyzeArticle(article.id);
}

main()
  .catch((error) => {
    console.error("\nFAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });