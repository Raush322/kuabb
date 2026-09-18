import * as cheerio from "cheerio";

export interface ExtractedArticle {
  title: string;
  author: string | null;
  publishedAt: string | null;
  text: string;
}

function normalizeText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTextWithSpaces(
  $: cheerio.CheerioAPI,
  element: unknown,
): string {
  const parts: string[] = [];

  function walk(node: any) {
    if (node.type === "text") {
      const value = $(node).text();

      if (value.trim()) {
        parts.push(value);
      }

      return;
    }

    $(node)
      .contents()
      .each((_, child) => {
        if (child.type === "text") {
          const value = $(child).text();

          if (value.trim()) {
            parts.push(value);
          }
        } else if (child.type === "tag") {
          walk(child);
        }
      });
  }

  walk(element);

  return normalizeText(parts.join(" "));
}

export async function extractWefArticle(
  url: string,
): Promise<ExtractedArticle> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const html = await response.text();

  const $ = cheerio.load(html);

  $("script, style, noscript, nav, footer, header").remove();

  const articleElement = $("article").first();

  if (!articleElement.length) {
    throw new Error("Article element not found");
  }

  const contentContainer = articleElement.children("div").eq(1);

  if (!contentContainer.length) {
    throw new Error("Article content container not found");
  }

  contentContainer
    .find(
      [
        '[aria-label*="Have you read"]',
        '[class*="related"]',
        '[class*="share"]',
        '[class*="social"]',
        '[class*="republish"]',
        '[class*="recommend"]',
      ].join(","),
    )
    .remove();

  const blocks: string[] = [];

  contentContainer
    .find("p, h2, h3, h4, blockquote, li")
    .each((_, element) => {
      const block = extractTextWithSpaces($, element);

      if (!block) {
        return;
      }

      if (
        block === "License and Republishing" ||
        block.startsWith(
          "World Economic Forum articles may be republished",
        ) ||
        block.startsWith(
          "The views expressed in this article are those of the author",
        )
      ) {
        return;
      }

      const unwantedRecommendations = [
        "Why human connections are once again a hiring advantage",
        "Which skills will help people most in an AI-driven future?",
        "How is AI changing the skills for leadership",
      ];

      if (
        unwantedRecommendations.some((phrase) =>
          block.startsWith(phrase),
        )
      ) {
        return;
      }

      blocks.push(block);
    });

  const text = blocks.join("\n\n");

  const title =
    $("meta[property='og:title']").attr("content")?.trim() ||
    $("h1").first().text().trim() ||
    "";

  const author =
    $("meta[name='author']").attr("content")?.trim() ||
    null;

  const publishedAt =
    $("meta[property='article:published_time']").attr("content")?.trim() ||
    null;

  return {
    title,
    author,
    publishedAt,
    text,
  };
}