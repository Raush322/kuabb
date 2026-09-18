import { prisma } from "@learning-intelligence/database";

import {
  CURRENT_SOURCE_SLUGS,
  isRelevantCandidate,
} from "./editorial-filter.js";

const LOOKBACK_HOURS = 24;

function getMoscowDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getDateOnly(dateString: string) {
  return new Date(`${dateString}T00:00:00.000Z`);
}

function isFresh(publishedAt: Date | null) {
  if (!publishedAt) {
    return false;
  }

  const cutoff = new Date(
    Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000,
  );

  return publishedAt >= cutoff;
}

async function main() {
  console.log("Starting digest cleanup...");

  const today = getDateOnly(getMoscowDate());

  const digestArticles = await prisma.digestArticle.findMany({
    include: {
      digest: true,
      article: {
        include: {
          articleSources: {
            include: {
              source: true,
            },
          },
        },
      },
    },
  });

  let removedOldSource = 0;
  let removedOldDate = 0;
  let removedEditorial = 0;
  let kept = 0;

  for (const digestArticle of digestArticles) {
    const sources = digestArticle.article.articleSources.map(
      (item) => item.source.slug,
    );

    const currentSource = sources.find((slug) =>
      CURRENT_SOURCE_SLUGS.has(slug),
    );

    let shouldRemove = false;
    let reason = "";

    if (!currentSource) {
      shouldRemove = true;
      reason = "old source";
      removedOldSource++;
    } else if (
      digestArticle.digest.periodStart.getTime() === today.getTime() &&
      !isFresh(digestArticle.article.publishedAt)
    ) {
      shouldRemove = true;
      reason = "older than 24 hours";
      removedOldDate++;
    } else if (
      !isRelevantCandidate(
        digestArticle.article.title,
        digestArticle.article.originalContent.slice(0, 12000),
        currentSource,
      )
    ) {
      shouldRemove = true;
      reason = "current editorial rules";
      removedEditorial++;
    }

    if (shouldRemove) {
      await prisma.digestArticle.delete({
        where: {
          digestId_articleId: {
            digestId: digestArticle.digestId,
            articleId: digestArticle.articleId,
          },
        },
      });

      console.log(
        `Removed: ${digestArticle.article.title} [${reason}]`,
      );
    } else {
      kept++;
    }
  }

  const emptyDigests = await prisma.digest.findMany({
    where: {
      articles: {
        none: {},
      },
    },
  });

  for (const digest of emptyDigests) {
    await prisma.digest.delete({
      where: {
        id: digest.id,
      },
    });

    console.log(`Removed empty digest: ${digest.title}`);
  }

  console.log("");
  console.log("Cleanup finished.");
  console.log(`Kept digest articles: ${kept}`);
  console.log(`Removed old-source articles: ${removedOldSource}`);
  console.log(`Removed old articles from today: ${removedOldDate}`);
  console.log(
    `Removed articles by current editorial rules: ${removedEditorial}`,
  );
  console.log(`Removed empty digests: ${emptyDigests.length}`);
}

main()
  .catch((error) => {
    console.error("Cleanup failed:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });