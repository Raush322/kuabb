import crypto from "node:crypto";

import { prisma } from "@learning-intelligence/database";
import * as cheerio from "cheerio";

import { analyzeArticle } from "./analyze-article.js";
import { translateArticle } from "./translate-article.js";

const BASE_URL = "https://www.weforum.org/sitemap/articles/";
const SOURCE_SLUG = "world-economic-forum";

const MAX_PAGES = 1;
const LOOKBACK_HOURS = 24;

// Выпуск формируется по московскому времени.
const ISSUE_TIME_ZONE = "Europe/Moscow";

type Article = {
  title: string;
  url: string;
};

type ArticleDetails = Article & {
  author: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  excerpt: string | null;
  imageUrl: string | null;
  originalContent: string | null;
};

function getMoscowDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ISSUE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getDateOnly(dateString: string): Date {
  return new Date(`${dateString}T00:00:00.000Z`);
}

async function fetchHtml(url: string): Promise<string> {
  const MAX_ATTEMPTS = 3;
  const RETRY_DELAY_MS = 2000;

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      console.log(
        `Fetching: ${url} (attempt ${attempt}/${MAX_ATTEMPTS})`,
      );

      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Request failed: ${response.status} ${response.statusText}`,
        );
      }

      return await response.text();
    } catch (error) {
      lastError = error;

      console.error(
        `Request failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${url}`,
      );
      console.error(error);

      if (attempt < MAX_ATTEMPTS) {
        console.log(
          `Retrying in ${RETRY_DELAY_MS / 1000} seconds...`,
        );

        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAY_MS),
        );
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError));
}

async function fetchPage(page: number): Promise<Article[]> {
  const url =
    page === 1 ? BASE_URL : `${BASE_URL}?page=${page}`;

  console.log(`Fetching sitemap page ${page}: ${url}`);

  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const articles = new Map<string, string>();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    const title = $(element).text().replace(/\s+/g, " ").trim();

    if (!href || !title) {
      return;
    }

    const articleUrl = new URL(href, BASE_URL);

    if (
      !articleUrl.href.startsWith(
        "https://www.weforum.org/stories/",
      )
    ) {
      return;
    }

    if (title.length < 20) {
      return;
    }

    articleUrl.hash = "";
    articleUrl.search = "";

    articles.set(articleUrl.href, title);
  });

  return Array.from(articles.entries()).map(([url, title]) => ({
    url,
    title,
  }));
}

function findStructuredData(
  html: string,
  key: string,
): string | null {
  const marker = `"${key}"`;
  const index = html.indexOf(marker);

  if (index === -1) {
    return null;
  }

  const afterKey = html.slice(index + marker.length);
  const match = afterKey.match(/:\s*"([^"]+)"/);

  return match?.[1] ?? null;
}

function findAuthor(html: string): string | null {
  const match = html.match(
    /"author":\[\{"@type":"Person","name":"([^"]+)"/,
  );

  if (match?.[1]) {
    return match[1];
  }

  const creatorMatch = html.match(
    /"creator":\["([^"]+)"\]/,
  );

  return creatorMatch?.[1] ?? null;
}

function findImage(html: string): string | null {
  const match = html.match(
    /"image":"(https:\/\/&#x61;sset&#x73;\.&#x77;eforu&#x6D;\.&#x6F;r&#x67;\/[^"]+)"/,
  );

  return match?.[1] ?? null;
}

function findDescription(html: string): string | null {
  const match = html.match(
    /"description":"((?:\\.|[^"\\])*)"/,
  );

  if (!match?.[1]) {
    return null;
  }

  return match[1]
    .replace(/\\"/g, '"')
    .replace(/\\n/g, " ")
    .trim();
}

/**
 * Извлекает основной текст статьи WEF.
 *
 * Используем несколько вариантов структуры страницы,
 * потому что HTML WEF может меняться.
 */
function extractArticleContent(html: string): string | null {
  const $ = cheerio.load(html);

  const selectors = [
    "article",
    '[data-testid="article-content"]',
    '[data-testid="story-content"]',
    '[class*="article-content"]',
    '[class*="story-content"]',
    "main",
  ];

  for (const selector of selectors) {
    const element = $(selector).first();

    if (!element.length) {
      continue;
    }

    const paragraphs = element
      .find("p")
      .map((_, paragraph) =>
        $(paragraph)
          .text()
          .replace(/\s+/g, " ")
          .trim(),
      )
      .get()
      .filter((text) => text.length > 30);

    if (paragraphs.length >= 3) {
      const content = paragraphs.join("\n\n").trim();

      if (content.length >= 500) {
        return content;
      }
    }
  }

  /**
   * Запасной вариант:
   * собираем все достаточно длинные <p> на странице.
   */
  const paragraphs = $("p")
    .map((_, paragraph) =>
      $(paragraph)
        .text()
        .replace(/\s+/g, " ")
        .trim(),
    )
    .get()
    .filter((text) => text.length > 40);

  const uniqueParagraphs = Array.from(
    new Set(paragraphs),
  );

  const content = uniqueParagraphs.join("\n\n").trim();

  if (content.length >= 500) {
    return content;
  }

  return null;
}

async function fetchArticleDetails(
  article: Article,
): Promise<ArticleDetails> {
  const html = await fetchHtml(article.url);

  const publishedAt =
    findStructuredData(html, "datePublished") ??
    findStructuredData(html, "publishedAt");

  const updatedAt =
    findStructuredData(html, "dateModified");

  const originalContent = extractArticleContent(html);

  console.log(
    `Extracted article text: ${
      originalContent
        ? `${originalContent.length} characters`
        : "not found"
    }`,
  );

  return {
    ...article,
    author: findAuthor(html),
    publishedAt,
    updatedAt,
    excerpt: findDescription(html),
    imageUrl: findImage(html),
    originalContent,
  };
}

function isFresh(
  publishedAt: string | null,
  cutoff: Date,
): boolean {
  if (!publishedAt) {
    return false;
  }

  const publishedDate = new Date(publishedAt);

  if (Number.isNaN(publishedDate.getTime())) {
    return false;
  }

  return publishedDate >= cutoff;
}

async function getTodayDigest() {
  const issueDate = getMoscowDate();
  const date = getDateOnly(issueDate);

  const existingDigest = await prisma.digest.findUnique({
    where: {
      periodStart: date,
    },
  });

  if (existingDigest) {
    return existingDigest;
  }

  return prisma.digest.create({
    data: {
      title: `Выпуск от ${issueDate}`,
      periodStart: date,
      periodEnd: date,
      status: "PUBLISHED",
    },
  });
}

async function getNextDigestPosition(
  digestId: string,
): Promise<number> {
  const lastArticle = await prisma.digestArticle.findFirst({
    where: {
      digestId,
    },
    orderBy: {
      position: "desc",
    },
  });

  return (lastArticle?.position ?? 0) + 1;
}

async function addArticleToDigest(
  digestId: string,
  articleId: string,
): Promise<boolean> {
  const existing = await prisma.digestArticle.findUnique({
    where: {
      digestId_articleId: {
        digestId,
        articleId,
      },
    },
  });

  if (existing) {
    console.log(
      `Article already belongs to today's digest: ${articleId}`,
    );

    return false;
  }

  const position = await getNextDigestPosition(digestId);

  await prisma.digestArticle.create({
    data: {
      digestId,
      articleId,
      position,
    },
  });

  console.log(
    `Article added to today's digest: position ${position}`,
  );

  return true;
}

/**
 * Переводит принятую статью через DeepL.
 *
 * Перевод выполняется только после того, как Gemini
 * признал материал релевантным.
 */
async function translateAcceptedArticle(
  articleId: string,
  title: string,
  originalContent: string | null,
) {
  if (!originalContent) {
    throw new Error(
      "Cannot translate article: original content is empty.",
    );
  }

  console.log("");
  console.log("--- DEEPL TRANSLATION ---");

  const translation = await translateArticle(
    title,
    originalContent,
  );

  const updatedArticle = await prisma.article.update({
    where: {
      id: articleId,
    },
    data: {
      translatedTitle: translation.translatedTitle,
      translatedContent: translation.translatedContent,
      translationLanguage: translation.translationLanguage,
      translationProvider: translation.translationProvider,
      translatedAt: translation.translatedAt,
    },
  });

  console.log(
    `Russian title saved: ${translation.translatedTitle.length} characters`,
  );

  console.log(
    `Russian content saved: ${translation.translatedContent.length} characters`,
  );

  return updatedArticle;
}

async function main() {
  console.log("Starting collection run...");

  const run = await prisma.collectionRun.create({
    data: {
      status: "RUNNING",
      sourcesChecked: 0,
      articlesFound: 0,
      articlesNew: 0,
      articlesDuplicate: 0,
      articlesRelevant: 0,
      errorCount: 0,
    },
  });

  console.log(`Collection run: ${run.id}`);

  let articlesFound = 0;
  let articlesNew = 0;
  let articlesDuplicate = 0;
  let articlesRelevant = 0;
  let errorCount = 0;

  try {
    const source = await prisma.source.findUnique({
      where: {
        slug: SOURCE_SLUG,
      },
    });

    if (!source) {
      throw new Error(
        `Source "${SOURCE_SLUG}" not found.`,
      );
    }

    const sourceFeed = await prisma.sourceFeed.findFirst({
      where: {
        sourceId: source.id,
        url: BASE_URL,
        isActive: true,
      },
    });

    if (!sourceFeed) {
      throw new Error(
        `Active WEF feed not found: ${BASE_URL}`,
      );
    }

    const contentType =
      await prisma.contentType.findUnique({
        where: {
          code: "NEWS",
        },
      });

    if (!contentType) {
      throw new Error(
        "Content type NEWS not found.",
      );
    }

    const digest = await getTodayDigest();

    console.log("");
    console.log("--- TODAY'S DIGEST ---");
    console.log(`Digest ID: ${digest.id}`);
    console.log(`Digest title: ${digest.title}`);

    const cutoff = new Date(
      Date.now() -
        LOOKBACK_HOURS * 60 * 60 * 1000,
    );

    console.log("");
    console.log(
      `Looking for articles published since: ${cutoff.toISOString()}`,
    );

    const allArticles = new Map<
      string,
      Article
    >();

    for (
      let page = 1;
      page <= MAX_PAGES;
      page++
    ) {
      const articles = await fetchPage(page);

      console.log(
        `Found stories on page ${page}: ${articles.length}`,
      );

      for (const article of articles) {
        allArticles.set(article.url, article);
      }
    }

    console.log(
      `Unique stories found: ${allArticles.size}`,
    );

    let freshArticles = 0;

    for (const article of allArticles.values()) {
      try {
        const details =
          await fetchArticleDetails(article);

        if (
          !isFresh(
            details.publishedAt,
            cutoff,
          )
        ) {
          console.log(
            `Reached old article: ${details.title} (${details.publishedAt ?? "no date"})`,
          );

          break;
        }

        freshArticles++;

        console.log("");
        console.log("--- FRESH ARTICLE ---");
        console.log(`Title: ${details.title}`);
        console.log(
          `Author: ${details.author ?? "not found"}`,
        );
        console.log(
          `Published: ${details.publishedAt}`,
        );
        console.log(`URL: ${details.url}`);

        const canonicalUrl = details.url;

        const existingArticle =
          await prisma.article.findUnique({
            where: {
              canonicalUrl,
            },
          });

        /**
         * ---------------------------------------------------------
         * СУЩЕСТВУЮЩАЯ СТАТЬЯ
         * ---------------------------------------------------------
         */
        if (existingArticle) {
          console.log(
            `Existing article: ${existingArticle.id}`,
          );

          articlesDuplicate++;

          let articleRecord = existingArticle;

          /**
           * Если полного текста раньше не было,
           * дозаписываем его.
           */
          if (
            !existingArticle.originalContent &&
            details.originalContent
          ) {
            articleRecord =
              await prisma.article.update({
                where: {
                  id: existingArticle.id,
                },
                data: {
                  originalContent:
                    details.originalContent,
                },
              });

            console.log(
              `Original content saved for existing article: ${articleRecord.id}`,
            );
          }

          /**
           * Берём последний AI-анализ.
           */
          const latestAnalysis =
            await prisma.articleAnalysis.findFirst({
              where: {
                articleId: articleRecord.id,
              },
              orderBy: {
                analyzedAt: "desc",
              },
            });

          let isRelevant = false;

          if (latestAnalysis) {
            isRelevant =
              latestAnalysis.relevance === "HIGH" ||
              latestAnalysis.relevance === "MEDIUM";

            console.log(
              `Existing AI analysis: ${latestAnalysis.relevance} (${latestAnalysis.relevanceScore})`,
            );
          } else {
            console.log("");
            console.log(
              "--- AI ANALYSIS FOR EXISTING ARTICLE ---",
            );

            const analysis =
              await analyzeArticle(
                articleRecord.id,
              );

            isRelevant =
              analysis.relevance === "HIGH" ||
              analysis.relevance === "MEDIUM";

            console.log(
              `AI analysis completed: ${analysis.relevance} (${analysis.relevanceScore})`,
            );
          }

          if (isRelevant) {
            /**
             * Для нерусских материалов переводим статью,
             * если русский текст ещё не сохранён.
             *
             * WEF сейчас является англоязычным источником.
             */
            if (
              articleRecord.language?.toLowerCase() !== "ru" &&
              !articleRecord.translatedContent
            ) {
              try {
                articleRecord =
                  await translateAcceptedArticle(
                    articleRecord.id,
                    articleRecord.title,
                    articleRecord.originalContent ??
                      details.originalContent,
                  );
              } catch (error) {
                errorCount++;

                console.error(
                  `DeepL translation failed for existing article: ${articleRecord.id}`,
                );
                console.error(error);

                await prisma.collectionItem.create({
                  data: {
                    collectionRunId: run.id,
                    sourceFeedId: sourceFeed.id,
                    articleId: articleRecord.id,
                    status: "ERROR",
                    error:
                      error instanceof Error
                        ? error.message
                        : String(error),
                  },
                });

                continue;
              }
            }

            const added =
              await addArticleToDigest(
                digest.id,
                articleRecord.id,
              );

            if (added) {
              articlesRelevant++;
            }
          }

          await prisma.collectionItem.create({
            data: {
              collectionRunId: run.id,
              sourceFeedId: sourceFeed.id,
              articleId: articleRecord.id,
              status: isRelevant
                ? "RELEVANT"
                : "NOT_RELEVANT",
            },
          });

          console.log(
            `CollectionItem created: ${
              isRelevant
                ? "RELEVANT"
                : "NOT_RELEVANT"
            }`,
          );

          continue;
        }

        /**
         * ---------------------------------------------------------
         * НОВАЯ СТАТЬЯ
         * ---------------------------------------------------------
         *
         * Сначала создаём техническую запись.
         * Gemini определяет релевантность.
         * Если статья нерелевантна — удаляем её.
         * Если релевантна — переводим и публикуем.
         */
        const contentHash = crypto
          .createHash("sha256")
          .update(canonicalUrl)
          .digest("hex");

        let articleRecord =
          await prisma.article.create({
            data: {
              title: details.title,
              originalTitle: details.title,
              url: details.url,
              canonicalUrl,
              author: details.author,
              publishedAt:
                details.publishedAt
                  ? new Date(
                      details.publishedAt,
                    )
                  : null,
              language:
                source.language ?? "en",
              excerpt: details.excerpt,
              imageUrl: details.imageUrl,
              contentHash,
              originalContent:
                details.originalContent,
              status: "NEW",
              contentTypeId:
                contentType.id,
            },
          });

        console.log(
          `Temporary article created for AI filtering: ${articleRecord.id}`,
        );

        if (details.originalContent) {
          console.log(
            `Original content saved: ${details.originalContent.length} characters`,
          );
        } else {
          console.log(
            "Original content was not extracted.",
          );
        }

        articlesNew++;

        console.log("");
        console.log("--- AI ANALYSIS ---");

        let analysis;

        try {
          analysis = await analyzeArticle(
            articleRecord.id,
          );
        } catch (error) {
          errorCount++;

          console.error(
            `AI analysis failed for article: ${articleRecord.id}`,
          );
          console.error(error);

          await prisma.article.delete({
            where: {
              id: articleRecord.id,
            },
          });

          console.log(
            "Article removed because AI analysis failed.",
          );

          await prisma.collectionItem.create({
            data: {
              collectionRunId: run.id,
              sourceFeedId: sourceFeed.id,
              articleId: null,
              status: "AI_ERROR",
              error:
                error instanceof Error
                  ? error.message
                  : String(error),
            },
          });

          continue;
        }

        const isRelevant =
          analysis.relevance === "HIGH" ||
          analysis.relevance === "MEDIUM";

        console.log(
          `AI analysis completed: ${analysis.relevance} (${analysis.relevanceScore})`,
        );

        /**
         * ---------------------------------------------------------
         * НЕРЕЛЕВАНТНАЯ СТАТЬЯ
         * ---------------------------------------------------------
         */
        if (!isRelevant) {
          console.log(
            `Article is not relevant: ${analysis.relevance}`,
          );

          await prisma.articleAnalysis.deleteMany({
            where: {
              articleId: articleRecord.id,
            },
          });

          await prisma.article.delete({
            where: {
              id: articleRecord.id,
            },
          });

          console.log(
            "Irrelevant article removed.",
          );

          await prisma.collectionItem.create({
            data: {
              collectionRunId: run.id,
              sourceFeedId: sourceFeed.id,
              articleId: null,
              status: "NOT_RELEVANT",
            },
          });

          continue;
        }

        /**
         * ---------------------------------------------------------
         * РЕЛЕВАНТНАЯ СТАТЬЯ
         * ---------------------------------------------------------
         *
         * Только теперь запускаем DeepL.
         */
        if (
          articleRecord.language?.toLowerCase() !== "ru"
        ) {
          try {
            articleRecord =
              await translateAcceptedArticle(
                articleRecord.id,
                articleRecord.title,
                articleRecord.originalContent,
              );
          } catch (error) {
            errorCount++;

            console.error(
              `DeepL translation failed for article: ${articleRecord.id}`,
            );
            console.error(error);

            /**
             * Не публикуем статью без русского текста.
             */
            await prisma.articleAnalysis.deleteMany({
              where: {
                articleId: articleRecord.id,
              },
            });

            await prisma.article.delete({
              where: {
                id: articleRecord.id,
              },
            });

            console.log(
              "Article removed because translation failed.",
            );

            await prisma.collectionItem.create({
              data: {
                collectionRunId: run.id,
                sourceFeedId: sourceFeed.id,
                articleId: null,
                status: "ERROR",
                error:
                  error instanceof Error
                    ? error.message
                    : String(error),
              },
            });

            continue;
          }
        }

        articleRecord =
          await prisma.article.update({
            where: {
              id: articleRecord.id,
            },
            data: {
              status: "PUBLISHED",
            },
          });

        console.log(
          `Article accepted: ${articleRecord.id}`,
        );

        /**
         * Источник статьи.
         */
        const existingSource =
          await prisma.articleSource.findFirst({
            where: {
              articleId: articleRecord.id,
              sourceId: source.id,
              sourceUrl: details.url,
            },
          });

        if (!existingSource) {
          await prisma.articleSource.create({
            data: {
              articleId: articleRecord.id,
              sourceId: source.id,
              sourceFeedId: sourceFeed.id,
              sourceUrl: details.url,
            },
          });

          console.log(
            "ArticleSource created.",
          );
        }

        /**
         * Статья попадает в сегодняшний выпуск.
         */
        const added =
          await addArticleToDigest(
            digest.id,
            articleRecord.id,
          );

        if (added) {
          articlesRelevant++;
        }

        await prisma.collectionItem.create({
          data: {
            collectionRunId: run.id,
            sourceFeedId: sourceFeed.id,
            articleId: articleRecord.id,
            status: "RELEVANT",
          },
        });

        console.log(
          "CollectionItem created: RELEVANT",
        );
      } catch (error) {
        errorCount++;

        console.error(
          `Failed to process article: ${article.url}`,
        );
        console.error(error);

        await prisma.collectionItem.create({
          data: {
            collectionRunId: run.id,
            sourceFeedId: sourceFeed.id,
            status: "ERROR",
            error:
              error instanceof Error
                ? error.message
                : String(error),
          },
        });
      }
    }

    articlesFound = freshArticles;

    await prisma.collectionRun.update({
      where: {
        id: run.id,
      },
      data: {
        finishedAt: new Date(),
        status: "SUCCESS",
        sourcesChecked: 1,
        articlesFound,
        articlesNew,
        articlesDuplicate,
        articlesRelevant,
        errorCount,
      },
    });

    console.log("");
    console.log(
      "==============================",
    );
    console.log(
      "COLLECTION RUN COMPLETED",
    );
    console.log(
      "==============================",
    );
    console.log(`Run ID: ${run.id}`);
    console.log(`Digest ID: ${digest.id}`);
    console.log(`Sources checked: 1`);
    console.log(
      `Fresh articles: ${freshArticles}`,
    );
    console.log(
      `Articles new: ${articlesNew}`,
    );
    console.log(
      `Articles duplicate: ${articlesDuplicate}`,
    );
    console.log(
      `Articles relevant and added to digest: ${articlesRelevant}`,
    );
    console.log(`Errors: ${errorCount}`);
  } catch (error) {
    await prisma.collectionRun.update({
      where: {
        id: run.id,
      },
      data: {
        finishedAt: new Date(),
        status: "FAILED",
        sourcesChecked: 1,
        articlesFound,
        articlesNew,
        articlesDuplicate,
        articlesRelevant,
        errorCount: errorCount + 1,
        errorLog:
          error instanceof Error
            ? error.message
            : String(error),
      },
    });

    throw error;
  }
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