import "dotenv/config";

import { prisma } from "@learning-intelligence/database";

import { extractArticle } from "./article-extractor.js";

const BATCH_SIZE = 10;

async function main() {
  const articles = await prisma.article.findMany({
    where: {
      imageUrl: null,
    },
    select: {
      id: true,
      title: true,
      url: true,
    },
    orderBy: {
      publishedAt: "desc",
    },
  });

  console.log(`Articles without images: ${articles.length}`);

  let processed = 0;
  let found = 0;
  let notFound = 0;
  let errors = 0;

  for (let index = 0; index < articles.length; index += BATCH_SIZE) {
    const batch = articles.slice(index, index + BATCH_SIZE);

    for (const article of batch) {
      processed++;

      console.log("");
      console.log(`[${processed}/${articles.length}] ${article.title}`);
      console.log(article.url);

      try {
        const extracted = await extractArticle(article.url, article.title);

        if (!extracted.imageUrl) {
          notFound++;
          console.log("Image: not found");
          continue;
        }

        await prisma.article.update({
          where: { id: article.id },
          data: { imageUrl: extracted.imageUrl },
        });

        found++;
        console.log(`Image saved: ${extracted.imageUrl}`);
      } catch (error) {
        errors++;
        console.error("Image extraction failed:");
        console.error(error);
      }
    }
  }

  console.log("");
  console.log("==============================");
  console.log("IMAGE BACKFILL COMPLETED");
  console.log("==============================");
  console.log(`Processed: ${processed}`);
  console.log(`Images found and saved: ${found}`);
  console.log(`Images not found: ${notFound}`);
  console.log(`Errors: ${errors}`);
}

main()
  .catch((error) => {
    console.error("");
    console.error("FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
