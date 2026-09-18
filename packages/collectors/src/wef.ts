import * as cheerio from "cheerio";

const BASE_URL = "https://www.weforum.org/sitemap/articles/";

const MAX_PAGES = 3;

// Для теста: материалы, опубликованные за последние 24 часа.
const LOOKBACK_HOURS = 24;

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
};

async function fetchHtml(url: string): Promise<string> {
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

  return response.text();
}

async function fetchPage(page: number): Promise<Article[]> {
  const url = page === 1 ? BASE_URL : `${BASE_URL}?page=${page}`;

  console.log(`\nFetching sitemap page ${page}: ${url}`);

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

    if (!articleUrl.href.startsWith("https://www.weforum.org/stories/")) {
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
    title,
    url,
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
    /"image":"(https:\/\/assets\.weforum\.org\/[^"]+)"/,
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

async function fetchArticleDetails(
  article: Article,
): Promise<ArticleDetails> {
  const html = await fetchHtml(article.url);

  const publishedAt =
    findStructuredData(html, "datePublished") ??
    findStructuredData(html, "publishedAt");

  const updatedAt =
    findStructuredData(html, "dateModified");

  return {
    ...article,
    author: findAuthor(html),
    publishedAt,
    updatedAt,
    excerpt: findDescription(html),
    imageUrl: findImage(html),
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

async function main() {
  const cutoff = new Date(
    Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000,
  );

  console.log(
    `Looking for articles published since: ${cutoff.toISOString()}`,
  );

  const allArticles = new Map<string, Article>();

  for (let page = 1; page <= MAX_PAGES; page++) {
    const articles = await fetchPage(page);

    console.log(
      `Found stories on page ${page}: ${articles.length}`,
    );

    for (const article of articles) {
      allArticles.set(article.url, article);
    }
  }

  console.log(
    `\nUnique stories found: ${allArticles.size}`,
  );

  const results: ArticleDetails[] = [];

  for (const article of allArticles.values()) {
    try {
      const details = await fetchArticleDetails(article);

      if (!isFresh(details.publishedAt, cutoff)) {
        continue;
      }

      results.push(details);

      console.log("\n--- FRESH ARTICLE ---");
      console.log(`Title: ${details.title}`);
      console.log(`Author: ${details.author ?? "not found"}`);
      console.log(`Published: ${details.publishedAt}`);
      console.log(`Updated: ${details.updatedAt ?? "not found"}`);
      console.log(`URL: ${details.url}`);
    } catch (error) {
      console.error(
        `Failed to fetch article: ${article.url}`,
      );
      console.error(error);
    }
  }

  console.log("\n==============================");
  console.log(`Fresh articles: ${results.length}`);
  console.log("==============================");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});