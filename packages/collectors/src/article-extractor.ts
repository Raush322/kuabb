import * as cheerio from "cheerio";

// pdf-parse v1.1.1 has a broken startup debug read of a missing test PDF.
// This fork keeps the same API with that debug mode disabled.
// @ts-ignore
import pdfParse from "pdf-parse-debugging-disabled";

export interface ExtractedArticle {
  title: string;
  author: string | null;
  publishedAt: string | null;
  imageUrl: string | null;
  text: string;
}

async function extractCbrPdfText(
  pageUrl: string,
  $: cheerio.CheerioAPI,
  headers: Record<string, string>,
): Promise<string | null> {
  const pdfLinks: string[] = [];

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href")?.trim();
    if (!href) return;

    const absolute = new URL(href, pageUrl).toString();
    const lower = absolute.toLowerCase();
    const linkText = normalizeText($(element).text()).toLowerCase();

    if (lower.includes(".pdf") || linkText.includes("августе 2026")) {
      if (!pdfLinks.includes(absolute)) pdfLinks.push(absolute);
    }
  });

  for (const pdfUrl of pdfLinks) {
    try {
      const response = await fetch(pdfUrl, {
        headers: {
          ...headers,
          Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
          Referer: pageUrl,
        },
      });

      if (!response.ok) continue;

      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      const buffer = Buffer.from(await response.arrayBuffer());

      if (!contentType.includes("pdf") && !buffer.subarray(0, 4).toString().startsWith("%PDF")) {
        continue;
      }

      const parsed = await pdfParse(buffer);
      const text = normalizeText(parsed.text ?? "");

      if (text.length >= 200) return text;
    } catch {
      // Try the next PDF link, if the page exposes more than one.
    }
  }

  return null;
}

function normalizeText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getMeta($: cheerio.CheerioAPI, selectors: string[]): string | null {
  for (const selector of selectors) {
    const value = $(selector).attr("content")?.trim();
    if (value) return value;
  }
  return null;
}

function getJsonLdObjects($: cheerio.CheerioAPI): unknown[] {
  const result: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).html()?.trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) result.push(...parsed);
      else result.push(parsed);
    } catch {
      // Ignore malformed JSON-LD.
    }
  });
  return result;
}

function findJsonLdValue(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== "object") return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJsonLdValue(item, keys);
      if (found) return found;
    }
    return null;
  }

  const object = value as Record<string, unknown>;

  for (const key of keys) {
    const candidate = object[key];

    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }

    if (candidate && typeof candidate === "object") {
      const valueCandidate = (candidate as Record<string, unknown>)["@value"];
      if (typeof valueCandidate === "string" && valueCandidate.trim()) {
        return valueCandidate.trim();
      }

      const nameCandidate = (candidate as Record<string, unknown>)["name"];
      if (typeof nameCandidate === "string" && nameCandidate.trim()) {
        return nameCandidate.trim();
      }
    }
  }

  for (const child of Object.values(object)) {
    const found = findJsonLdValue(child, keys);
    if (found) return found;
  }

  return null;
}

function getJsonLdArticleBody($: cheerio.CheerioAPI): string | null {
  return findJsonLdValue(getJsonLdObjects($), ["articleBody"]);
}

function getJsonLdPublishedAt($: cheerio.CheerioAPI): string | null {
  return findJsonLdValue(getJsonLdObjects($), ["datePublished", "dateCreated"]);
}

function findJsonLdImage(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJsonLdImage(item);
      if (found) return found;
    }
    return null;
  }

  const object = value as Record<string, unknown>;

  const image = object["image"];
  if (typeof image === "string" && image.trim()) {
    return image.trim();
  }

  if (image && typeof image === "object") {
    const imageObject = image as Record<string, unknown>;

    for (const key of ["url", "contentUrl"]) {
      const candidate = imageObject[key];
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
  }

  for (const child of Object.values(object)) {
    const found = findJsonLdImage(child);
    if (found) return found;
  }

  return null;
}

function getJsonLdImageUrl($: cheerio.CheerioAPI): string | null {
  return findJsonLdImage(getJsonLdObjects($));
}

function extractImageUrl(
  $: cheerio.CheerioAPI,
  pageUrl: string,
): string | null {
  const raw =
    getMeta($, [
      'meta[property="og:image"]',
      'meta[property="og:image:url"]',
      'meta[name="twitter:image"]',
      'meta[name="twitter:image:src"]',
    ]) || getJsonLdImageUrl($);

  if (!raw) return null;

  try {
    return new URL(raw, pageUrl).toString();
  } catch {
    return null;
  }
}

function getJsonLdAuthor($: cheerio.CheerioAPI): string | null {
  return findJsonLdValue(getJsonLdObjects($), ["author", "creator"]);
}

function getTimePublishedAt($: cheerio.CheerioAPI): string | null {
  const selectors = [
    "time[datetime]",
    '[itemprop="datePublished"][datetime]',
    '[itemprop="datePublished"]',
    "[data-date]",
    "[data-published]",
    "[data-published-at]",
    "[data-publishedAt]",
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

      if (value) return value;
    }
  }

  return null;
}

function cleanContainer(container: cheerio.Cheerio<any>): void {
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
        '[class*="cookie"]',
      ].join(","),
    )
    .remove();
}

function extractBlocks(
  $: cheerio.CheerioAPI,
  container: cheerio.Cheerio<any>,
): string {
  const blocks: string[] = [];
  const seen = new Set<string>();

  container
    .find("p, h2, h3, h4, blockquote, li")
    .each((_, element) => {
      const block = normalizeText($(element).text());
      if (!block || block.length < 3 || seen.has(block)) return;
      seen.add(block);
      blocks.push(block);
    });

  return blocks.join("\n\n");
}

function extractGenericText($: cheerio.CheerioAPI): string {
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
    ".article",
    ".article__body",
    ".article__content",
    ".news-content",
    ".news__content",
    ".content",
    ".page-content",
    "#content",
    "main",
  ];

  for (const selector of selectors) {
    const candidates = $(selector);

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates.eq(i);
      const rawText = candidate.text().trim();

      if (rawText.length < 400) continue;

      cleanContainer(candidate);
      const result = extractBlocks($, candidate);

      if (result.length >= 500) return result;
    }
  }

  // Последний fallback: собираем текстовые блоки со всей страницы.
  const blocks: string[] = [];
  const seen = new Set<string>();

  $("p, h2, h3, h4, blockquote").each((_, element) => {
    const node = $(element);

    if (
      node.closest(
        "header, footer, nav, aside, form, script, style, noscript"
      ).length
    ) {
      return;
    }

    const block = normalizeText(node.text());

    if (!block || block.length < 30 || seen.has(block)) return;

    seen.add(block);
    blocks.push(block);
  });

  return blocks.join("\n\n");
}

function extractHseMainText($: cheerio.CheerioAPI): string {
  return extractGenericText($);
}

function extractYandexMainText($: cheerio.CheerioAPI): string {
  const jsonLdBody = getJsonLdArticleBody($);
  if (jsonLdBody && normalizeText(jsonLdBody).length >= 500) {
    return normalizeText(jsonLdBody);
  }

  return extractGenericText($);
}

function extractSkolkovoMainText($: cheerio.CheerioAPI): string {
  const jsonLdBody = getJsonLdArticleBody($);
  if (jsonLdBody && normalizeText(jsonLdBody).length >= 500) {
    return normalizeText(jsonLdBody);
  }

  return extractGenericText($);
}

function extractTitle($: cheerio.CheerioAPI): string {
  return (
    getMeta($, [
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
    ]) ||
    $("h1").first().text().trim() ||
    $("title").first().text().trim()
  );
}

function extractAuthor($: cheerio.CheerioAPI): string | null {
  return (
    getMeta($, [
      'meta[name="author"]',
      'meta[property="article:author"]',
      'meta[name="byl"]',
    ]) || getJsonLdAuthor($)
  );
}

function extractPublishedAt($: cheerio.CheerioAPI): string | null {
  const metaValue = getMeta($, [
    'meta[property="article:published_time"]',
    'meta[property="og:published_time"]',
    'meta[itemprop="datePublished"]',
    'meta[name="date"]',
    'meta[name="publish-date"]',
    'meta[name="published"]',
    'meta[name="published_at"]',
  ]);

  if (metaValue) return metaValue;

  const timeValue = getTimePublishedAt($);
  if (timeValue) return timeValue;

  return getJsonLdPublishedAt($);
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
    return hostname === "skolkovo.ru" || hostname.endsWith(".skolkovo.ru");
  } catch {
    return false;
  }
}

function isRbcUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith("trends.rbc.ru");
  } catch {
    return false;
  }
}

function isNbjUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith("nbj.ru");
  } catch {
    return false;
  }
}

function isBankiUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return hostname === "banki.ru" || hostname === "www-1.banki.ru";
  } catch {
    return false;
  }
}

function toBankiMirrorUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.replace(/^www\./, "") === "banki.ru") {
      parsed.hostname = "www-1.banki.ru";
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function parseRussianDate(value: string): string | null {
  const months: Record<string, string> = {
    "января": "01", "февраля": "02", "марта": "03", "апреля": "04",
    "мая": "05", "июня": "06", "июля": "07", "августа": "08",
    "сентября": "09", "октября": "10", "ноября": "11", "декабря": "12",
  };
  const match = value.match(/\b(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(\d{4})\b/i);
  if (!match) return null;
  return `${match[3]}-${months[match[2].toLowerCase()]}-${match[1].padStart(2, "0")}T12:00:00+03:00`;
}

function extractVisibleRussianDate($: cheerio.CheerioAPI): string | null {
  const candidates = [
    $("header").first().text(),
    $("main").first().text(),
    $("body").text(),
  ];
  for (const text of candidates) {
    const parsed = parseRussianDate(normalizeText(text).slice(0, 5000));
    if (parsed) return parsed;
  }
  return null;
}

function isCbrUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith("cbr.ru");
  } catch {
    return false;
  }
}

function getRbcReferer(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const trendsIndex = parts.indexOf("trends");

    if (trendsIndex >= 0 && parts[trendsIndex + 1]) {
      return `https://trends.rbc.ru/trends/${parts[trendsIndex + 1]}`;
    }
  } catch {
    // Fall back to the main Trends page below.
  }

  return "https://trends.rbc.ru/";
}

async function fetchArticleHtml(
  url: string,
  headers: Record<string, string>,
): Promise<string> {
  const urls: string[] = [url];

  if (isRbcUrl(url)) {
    // РБК Тренды иногда отвечает 406 на канонический URL,
    // но принимает тот же материал с реальным параметром навигации from=copy.
    // Такой вариант встречается в индексируемых ссылках самого РБК.
    try {
      const parsed = new URL(url);
      parsed.searchParams.set("from", "copy");
      const copyUrl = parsed.toString();
      if (!urls.includes(copyUrl)) urls.push(copyUrl);
    } catch {
      // Keep the original URL if it cannot be parsed.
    }

    if (!url.endsWith("/")) {
      urls.push(`${url}/`);
    }
  }

  const rbcReferer = isRbcUrl(url) ? getRbcReferer(url) : undefined;

  const variants: Record<string, string>[] = [
    {
      ...headers,
      ...(rbcReferer ? { Referer: rbcReferer } : {}),
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
      "Sec-CH-UA": '\"Chromium\";v=\"146\", \"Google Chrome\";v=\"146\", \"Not_A Brand\";v=\"99\"',
      "Sec-CH-UA-Mobile": "?0",
      "Sec-CH-UA-Platform": '\"Windows\"',
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": rbcReferer ? "same-origin" : "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
      DNT: "1",
    },
    {
      ...headers,
      ...(rbcReferer ? { Referer: rbcReferer } : {}),
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": rbcReferer ? "same-origin" : "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
    },
    {
      ...headers,
      ...(rbcReferer ? { Referer: rbcReferer } : {}),
      Accept: "text/html,*/*;q=0.8",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Upgrade-Insecure-Requests": "1",
    },
  ];

  let lastError: Error | null = null;

  for (const candidateUrl of urls) {
    for (const candidateHeaders of variants) {
      const response = await fetch(candidateUrl, {
        headers: candidateHeaders,
      });

      if (response.ok) {
        return response.text();
      }

      lastError = new Error(
        `HTTP ${response.status}: ${response.statusText}`,
      );

      if (!isRbcUrl(url) || response.status !== 406) {
        throw lastError;
      }

      console.log(
        `[RBC] HTTP 406, trying fallback URL: ${candidateUrl}`,
      );
    }
  }

  throw lastError ?? new Error("Article request failed");
}

function extractCbrMainText($: cheerio.CheerioAPI): string {
  const selectors = [
    "main",
    '[role="main"]',
    ".content",
    ".content-block",
    ".article",
    '[class*="article"]',
    '[class*="content"]',
  ];

  for (const selector of selectors) {
    const candidates = $(selector);

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates.eq(i);
      const rawText = normalizeText(candidate.text());

      if (rawText.length < 400) continue;

      const blocks: string[] = [];
      const seen = new Set<string>();

      candidate.find("p, h2, h3, h4, li, td").each((_, element) => {
        const block = normalizeText($(element).text());
        if (!block || block.length < 20 || seen.has(block)) return;
        seen.add(block);
        blocks.push(block);
      });

      const result = blocks.join("\n\n");
      if (result.length >= 500) return result;
    }
  }

  const blocks: string[] = [];
  const seen = new Set<string>();

  $("p, h2, h3, h4, li, td").each((_, element) => {
    const node = $(element);
    if (node.closest("header, footer, nav, aside, script, style, noscript").length) {
      return;
    }

    const block = normalizeText(node.text());
    if (!block || block.length < 20 || seen.has(block)) return;

    seen.add(block);
    blocks.push(block);
  });

  return blocks.join("\n\n");
}

export async function extractArticle(url: string, fallbackTitle?: string): Promise<ExtractedArticle> {
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  };

  const fetchUrl = isBankiUrl(url) ? toBankiMirrorUrl(url) : url;

  if (isRbcUrl(url)) {
    headers.Referer = "https://trends.rbc.ru/";
  }

  if (isNbjUrl(url)) {
    headers.Referer = "https://nbj.ru/news/";
  }

  if (isCbrUrl(url)) {
    headers.Referer = "https://www.cbr.ru/";
  }

  if (isBankiUrl(url)) {
    headers.Referer = "https://www.banki.ru/webview/news/";
  }

  const html = await fetchArticleHtml(fetchUrl, headers);
  const $ = cheerio.load(html);

  const title = normalizeText(extractTitle($)) || normalizeText(fallbackTitle ?? "");

  if (!title) {
    throw new Error("Article title not found");
  }

  const author = extractAuthor($);
  const publishedAt =
    extractPublishedAt($) ||
    (isNbjUrl(url) || isBankiUrl(url) ? extractVisibleRussianDate($) : null);

  const jsonLdBody = getJsonLdArticleBody($);
  const normalizedJsonLdBody = jsonLdBody
    ? normalizeText(jsonLdBody)
    : null;

  let text: string;

  if (normalizedJsonLdBody && normalizedJsonLdBody.length >= 500) {
    text = normalizedJsonLdBody;
  } else if (isHseUrl(url)) {
    text = extractHseMainText($);
  } else if (isYandexPracticumUrl(url)) {
    text = extractYandexMainText($);
  } else if (isSkolkovoUrl(url)) {
    text = extractSkolkovoMainText($);
  } else if (isCbrUrl(url)) {
    text = extractCbrMainText($);

    if (text.length < 200) {
      const pdfText = await extractCbrPdfText(url, $, headers);
      if (pdfText) text = pdfText;
    }
  } else {
    text = extractGenericText($);
  }

  if (text.length < 200) {
    throw new Error(
      `Extracted article text is too short: ${text.length} characters`,
    );
  }

  const imageUrl = extractImageUrl($, url);

  return {
    title,
    author,
    publishedAt,
    imageUrl,
    text,
  };
}

export const extractWefArticle = extractArticle;
