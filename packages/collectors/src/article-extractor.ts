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

function getMeta(
  $: cheerio.CheerioAPI,
  selectors: string[],
): string | null {
  for (const selector of selectors) {
    const value = $(selector).attr("content")?.trim();

    if (value) {
      return value;
    }
  }

  return null;
}

function getJsonLdObjects(
  $: cheerio.CheerioAPI,
): unknown[] {
  const result: unknown[] = [];

  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).html()?.trim();

    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed)) {
        result.push(...parsed);
      } else {
        result.push(parsed);
      }
    } catch {
      // Некорректный JSON-LD просто пропускаем.
    }
  });

  return result;
}

function findJsonLdValue(
  value: unknown,
  keys: string[],
): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findJsonLdValue(item, keys);

      if (result) {
        return result;
      }
    }

    return null;
  }

  const object = value as Record<string, unknown>;

  for (const key of keys) {
    const candidate = object[key];

    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }

    if (
      candidate &&
      typeof candidate === "object" &&
      "@value" in (candidate as Record<string, unknown>)
    ) {
      const valueCandidate = (candidate as Record<string, unknown>)[
        "@value"
      ];

      if (
        typeof valueCandidate === "string" &&
        valueCandidate.trim()
      ) {
        return valueCandidate.trim();
      }
    }
  }

  for (const child of Object.values(object)) {
    const result = findJsonLdValue(child, keys);

    if (result) {
      return result;
    }
  }

  return null;
}

function getJsonLdArticleBody(
  $: cheerio.CheerioAPI,
): string | null {
  return findJsonLdValue(getJsonLdObjects($), [
    "articleBody",
  ]);
}

function getJsonLdPublishedAt(
  $: cheerio.CheerioAPI,
): string | null {
  return findJsonLdValue(getJsonLdObjects($), [
    "datePublished",
    "dateCreated",
  ]);
}

function getJsonLdAuthor(
  $: cheerio.CheerioAPI,
): string | null {
  const objects = getJsonLdObjects($);

  const direct = findJsonLdValue(objects, [
    "author",
  ]);

  if (direct) {
    return direct;
  }

  return findJsonLdValue(objects, [
    "creator",
  ]);
}

function getTimePublishedAt(
  $: cheerio.CheerioAPI,
): string | null {
  const selectors = [
    'time[datetime]',
    '[itemprop="datePublished"][datetime]',
    '[itemprop="datePublished"]',
    '[data-date]',
    '[data-published]',
    '[data-published-at]',
    '[data-publishedAt]',
  ];

  for (const selector of selectors) {
    const elements = $(selector);

    for (let i = 0; i < elements.length; i++) {
      const element = elements.eq(i);

      const value =
        element.attr("datetime")?.trim() ||
        element.attr("data-date")?.trim() ||
        element.attr("data-published")?.trim() ||
        element.attr("data-published-at")?.trim() ||
        element.attr("data-publishedAt")?.trim() ||
        element.attr("content")?.trim() ||
        element.text().trim();

      if (value) {
        return value;
      }
    }
  }

  return null;
}

function cleanContainer(
  container: cheerio.Cheerio<any>,
): void {
  container
    .find(
      [
        "script",
        "style",
        "noscript",
        "nav",
        "footer",
        "header",
        "form",
        "button",
        "aside",
        '[class*="share"]',
        '[class*="social"]',
        '[class*="related"]',
        '[class*="recommend"]',
        '[class*="newsletter"]',
        '[class*="subscription"]',
        '[class*="comment"]',
        '[class*="advert"]',
        '[class*="banner"]',
        '[class*="menu"]',
        '[class*="sidebar"]',
        '[class*="breadcrumb"]',
      ].join(","),
    )
    .remove();
}

function extractBlocks(
  $: cheerio.CheerioAPI,
  container: cheerio.Cheerio<any>,
): string {
  const blocks: string[] = [];

  container
    .find("p, h2, h3, h4, blockquote, li")
    .each((_, element) => {
      const block = normalizeText($(element).text());

      if (!block || block.length < 3) {
        return;
      }

      blocks.push(block);
    });

  return blocks.join("\n\n");
}

function extractStandardMainText(
  $: cheerio.CheerioAPI,
): string {
  const selectors = [
    "article",
    "main article",
    '[itemprop="articleBody"]',
    '[class*="article-body"]',
    '[class*="articleBody"]',
    '[class*="article-content"]',
    '[class*="articleContent"]',
    '[class*="post-content"]',
    '[class*="postContent"]',
    "main",
  ];

  for (const selector of selectors) {
    const candidates = $(selector);

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates.eq(i);

      const rawText = candidate.text().trim();

      if (rawText.length < 500) {
        continue;
      }

      cleanContainer(candidate);

      const result = extractBlocks($, candidate);

      if (result.length >= 500) {
        return result;
      }
    }
  }

  throw new Error("Article content container not found");
}

function extractHseMainText(
  $: cheerio.CheerioAPI,
): string {
  const selectors = [
    ".content",
    ".page-content",
    ".article",
    ".article-content",
    ".news-content",
    ".content-block",
    "main",
  ];

  for (const selector of selectors) {
    const candidates = $(selector);

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates.eq(i);

      const rawText = candidate.text().trim();

      if (rawText.length < 500) {
        continue;
      }

      cleanContainer(candidate);

      const result = extractBlocks($, candidate);

      if (result.length >= 500) {
        return result;
      }
    }
  }

  const blocks: string[] = [];

  $("p, h2, h3, h4, blockquote, li").each((_, element) => {
    const block = normalizeText($(element).text());

    if (!block || block.length < 3) {
      return;
    }

    blocks.push(block);
  });

  const result = blocks.join("\n\n");

  if (result.length >= 500) {
    return result;
  }

  throw new Error(
    "HSE article content container not found",
  );
}

function extractYandexMainText(
  $: cheerio.CheerioAPI,
): string {
  const blocks: string[] = [];
  const seen = new Set<string>();

  function addBlock(text: string): void {
    const normalized = normalizeText(text);

    if (!normalized || normalized.length < 30) {
      return;
    }

    if (seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    blocks.push(normalized);
  }

  const keypoints = $("#keypoints-content").first();

  if (keypoints.length) {
    addBlock(keypoints.text());
  }

  $(".interview-item").each((_, element) => {
    addBlock($(element).text());
  });

  $(".interview-paragraph").each((_, element) => {
    const node = $(element);

    if (node.closest(".interview-item").length) {
      return;
    }

    addBlock(node.text());
  });

  $(".interview-answer").each((_, element) => {
    const node = $(element);

    if (node.closest(".interview-item").length) {
      return;
    }

    addBlock(node.text());
  });

  const fallbackSelectors = [
    ".article-content",
    ".article-body",
    '[class*="article-content"]',
    '[class*="article-body"]',
    "main",
  ];

  for (const selector of fallbackSelectors) {
    const candidates = $(selector);

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates.eq(i);

      if (!candidate.length) {
        continue;
      }

      candidate
        .find(
          [
            "script",
            "style",
            "noscript",
            "nav",
            "footer",
            "header",
            "form",
            "button",
            "aside",
            '[class*="share"]',
            '[class*="social"]',
            '[class*="related"]',
            '[class*="recommend"]',
            '[class*="newsletter"]',
            '[class*="subscription"]',
            '[class*="comment"]',
            '[class*="advert"]',
            '[class*="banner"]',
            '[class*="menu"]',
            '[class*="sidebar"]',
            '[class*="breadcrumb"]',
          ].join(","),
        )
        .remove();

      candidate
        .find("p, h2, h3, h4, blockquote, li")
        .each((_, element) => {
          const node = $(element);

          if (
            node.closest(
              "#keypoints-content, .interview-item, .interview-paragraph, .interview-answer",
            ).length
          ) {
            return;
          }

          addBlock(node.text());
        });
    }
  }

  /*
   * Иногда основной текст Яндекс Практикума находится
   * только в JSON-LD.
   */
  const jsonLdBody = getJsonLdArticleBody($);

  if (jsonLdBody) {
    addBlock(jsonLdBody);
  }

  const result = blocks.join("\n\n");

  if (result.length >= 500) {
    return result;
  }

  throw new Error(
    `Yandex article content not found: ${result.length} characters`,
  );
}

function extractSkolkovoMainText(
  $: cheerio.CheerioAPI,
): string {
  /*
   * Сначала проверяем JSON-LD.
   *
   * Это важно для СКОЛКОВО: часть материалов может отдавать
   * полный articleBody в структурированных данных, даже если
   * визуальный контейнер страницы не имеет стандартной разметки.
   */
  const jsonLdBody = getJsonLdArticleBody($);

  if (jsonLdBody) {
    const normalized = normalizeText(jsonLdBody);

    if (normalized.length >= 500) {
      return normalized;
    }
  }

  const selectors = [
    '[itemprop="articleBody"]',
    "article",
    ".article-content",
    ".article__content",
    ".research-content",
    ".research__content",
    ".research-detail",
    ".research-detail__content",
    ".research-detail-content",
    '[class*="research"][class*="content"]',
    '[class*="article"][class*="content"]',
    '[class*="detail"][class*="content"]',
    "main",
  ];

  for (const selector of selectors) {
    const candidates = $(selector);

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates.eq(i);

      const rawText = candidate.text().trim();

      if (rawText.length < 500) {
        continue;
      }

      cleanContainer(candidate);

      const result = extractBlocks($, candidate);

      if (result.length >= 500) {
        return result;
      }
    }
  }

  /*
   * Дополнительный вариант для страниц, где текст разбит
   * на крупные текстовые блоки без article/main-контейнера.
   */
  const blocks: string[] = [];
  const seen = new Set<string>();

  $(
    'p, h2, h3, h4, blockquote, [class*="text"], [class*="paragraph"], [class*="description"]',
  ).each((_, element) => {
    const node = $(element);

    if (
      node.closest(
        "header, footer, nav, aside, form, script, style, noscript",
      ).length
    ) {
      return;
    }

    const block = normalizeText(node.text());

    if (!block || block.length < 30 || seen.has(block)) {
      return;
    }

    seen.add(block);
    blocks.push(block);
  });

  const result = blocks.join("\n\n");

  if (result.length >= 500) {
    return result;
  }

  throw new Error(
    `Skolkovo article content not found: ${result.length} characters`,
  );
}

function extractTitle(
  $: cheerio.CheerioAPI,
): string {
  return (
    getMeta($, [
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
    ]) ||
    $("h1").first().text().trim() ||
    $("title").first().text().trim()
  );
}

function extractAuthor(
  $: cheerio.CheerioAPI,
): string | null {
  return (
    getMeta($, [
      'meta[name="author"]',
      'meta[property="article:author"]',
      'meta[name="byl"]',
    ]) ||
    getJsonLdAuthor($)
  );
}

function extractPublishedAt(
  $: cheerio.CheerioAPI,
): string | null {
  /*
   * Сначала обычные meta-теги.
   */
  const metaValue = getMeta($, [
    'meta[property="article:published_time"]',
    'meta[property="og:published_time"]',
    'meta[itemprop="datePublished"]',
    'meta[name="date"]',
    'meta[name="publish-date"]',
    'meta[name="published"]',
    'meta[name="published_at"]',
  ]);

  if (metaValue) {
    return metaValue;
  }

  /*
   * Затем <time datetime> и data-* атрибуты.
   */
  const timeValue = getTimePublishedAt($);

  if (timeValue) {
    return timeValue;
  }

  /*
   * Затем JSON-LD.
   *
   * Это основной дополнительный источник дат для Skillbox,
   * Яндекс Практикума и ВШЭ.
   */
  const jsonLdValue = getJsonLdPublishedAt($);

  if (jsonLdValue) {
    return jsonLdValue;
  }

  return null;
}

function isHseUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith("hse.ru");
  } catch {
    return false;
  }
}

function isYandexPracticumUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;

    return (
      hostname === "practicum.yandex.ru" ||
      hostname.endsWith(".practicum.yandex.ru")
    );
  } catch {
    return false;
  }
}

function isSkolkovoUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;

    return (
      hostname === "skolkovo.ru" ||
      hostname.endsWith(".skolkovo.ru")
    );
  } catch {
    return false;
  }
}

export async function extractArticle(
  url: string,
): Promise<ExtractedArticle> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${response.statusText}`,
    );
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  /*
   * ВАЖНО:
   * script не удаляем до извлечения metadata.
   * JSON-LD внутри script содержит дату, автора и иногда
   * полный текст статьи.
   */

  const title = normalizeText(extractTitle($));

  if (!title) {
    throw new Error("Article title not found");
  }

  const author = extractAuthor($);
  const publishedAt = extractPublishedAt($);

  /*
   * Теперь удаляем служебные элементы перед извлечением текста.
   */
  $("script, style, noscript").remove();

  let text: string;

  if (isHseUrl(url)) {
    text = extractHseMainText($);
  } else if (isYandexPracticumUrl(url)) {
    text = extractYandexMainText($);
  } else if (isSkolkovoUrl(url)) {
    text = extractSkolkovoMainText($);
  } else {
    text = extractStandardMainText($);
  }

  if (text.length < 200) {
    throw new Error(
      `Extracted article text is too short: ${text.length} characters`,
    );
  }

  return {
    title,
    author,
    publishedAt,
    text,
  };
}

// Совместимость со старыми файлами проекта.
export const extractWefArticle = extractArticle;