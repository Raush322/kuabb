import * as cheerio from "cheerio";
import type { Element } from "domhandler";

import { SOURCES } from "./sources.js";

type Candidate = {
  sourceSlug: string;
  title: string;
  url: string;
  publishedAt?: string;
};

const MONTHS: Record<string, number> = {
  января: 0,
  февраля: 1,
  марта: 2,
  апреля: 3,
  мая: 4,
  июня: 5,
  июля: 6,
  августа: 7,
  сентября: 8,
  октября: 9,
  ноября: 10,
  декабря: 11,
};

function normalizeUrl(url: string, baseUrl: string): string {
  try {
    const parsed = new URL(url, baseUrl);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function cleanTitle(title: string): string {
  return title
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRussianDate(text: string): string | undefined {
  const match = text.match(
    /\b(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(\d{4})\b/i,
  );

  if (!match) {
    return undefined;
  }

  const day = Number(match[1]);
  const monthName = match[2].toLowerCase();
  const year = Number(match[3]);
  const month = MONTHS[monthName];

  if (month === undefined) {
    return undefined;
  }

  const date = new Date(Date.UTC(year, month, day));

  return date.toISOString();
}

function extractDateFromElement(
  $: cheerio.CheerioAPI,
  element: Element,
): string | undefined {
  const link = $(element);

  const candidates: string[] = [];

  const parent = link.parent();
  const grandParent = parent.parent();
  const greatGrandParent = grandParent.parent();

  candidates.push(link.text());
  candidates.push(parent.text());
  candidates.push(grandParent.text());
  candidates.push(greatGrandParent.text());

  for (const text of candidates) {
    const parsed = parseRussianDate(text);

    if (parsed) {
      return parsed;
    }
  }

  return undefined;
}

function isAllowedUrl(
  url: string,
  source: (typeof SOURCES)[number],
): boolean {
  const parsed = new URL(url);
  const pathname = parsed.pathname;

  if (pathname.endsWith(".pdf")) {
    return false;
  }

  if (
    pathname.includes("/privacy") ||
    pathname.includes("/terms") ||
    pathname.includes("/legal-docs") ||
    pathname.includes("/upload/")
  ) {
    return false;
  }

  if (source.allowedPathPrefixes.length === 0) {
    return false;
  }

  const allowed = source.allowedPathPrefixes.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (!allowed) {
    return false;
  }

  const sourcePath = new URL(source.url).pathname;

  if (pathname === sourcePath) {
    return false;
  }

  const excludedPrefixes = source.excludedPathPrefixes ?? [];

  for (const excludedPrefix of excludedPrefixes) {
    if (
      pathname === excludedPrefix ||
      pathname.startsWith(`${excludedPrefix}/`)
    ) {
      return false;
    }
  }

  return true;
}

function extractHhTitle(
  $: cheerio.CheerioAPI,
  element: Element,
): string {
  const link = $(element);

  const heading = link
    .find("h1, h2, h3, h4, h5, h6")
    .first();

  if (heading.length) {
    const headingText = cleanTitle(heading.text());

    if (headingText.length >= 10) {
      return headingText;
    }
  }

  let title = cleanTitle(link.text());

  const descriptionPatterns = [
    /Как компания использует отзывы сотрудников/i,
    /Кейс о том, как навыкоцентричный найм/i,
    /Рассказываем, как на самом деле устроен найм/i,
    /Рассказываем, кто и когда вправе/i,
    /Да[её]м инструкцию/i,
  ];

  for (const pattern of descriptionPatterns) {
    const match = title.match(pattern);

    if (match?.index !== undefined && match.index > 0) {
      title = title.slice(0, match.index);
      break;
    }
  }

  title = title.replace(/([^\d])\d{1,6}$/, "$1");

  return cleanTitle(title);
}

function extractSkillboxTitle(
  $: cheerio.CheerioAPI,
  element: Element,
): string {
  return cleanTitle($(element).text());
}

function extractYandexTitle(
  $: cheerio.CheerioAPI,
  element: Element,
): string {
  let title = cleanTitle($(element).text());

  const authorMarkers = [
    "Ксения Филиппова",
    "Александра Горбунова",
    "Елена Сорочан",
    "Ольга Жданова",
    "Анна",
    "Мария",
  ];

  for (const marker of authorMarkers) {
    const index = title.indexOf(marker);

    if (index > 0) {
      title = title.slice(0, index);
      break;
    }
  }

  return cleanTitle(title);
}

function extractUpravTitle(
  $: cheerio.CheerioAPI,
  element: Element,
): string {
  let title = cleanTitle($(element).text());

  title = title.replace(
    /\s+\d{2}\.\d{2}\.\d{4}\s+\d+\s*$/,
    "",
  );

  title = title.replace(
    /\s+\d{2}\.\d{2}\.\d{4}\s*$/,
    "",
  );

  return cleanTitle(title);
}

function extractSkolkovoTitle(
  $: cheerio.CheerioAPI,
  element: Element,
): string {
  let title = cleanTitle($(element).text());

  title = title.replace(
    /^\d{1,2}\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+\d{4}\s+/i,
    "",
  );

  return cleanTitle(title);
}

function extractHseTitle(
  $: cheerio.CheerioAPI,
  element: Element,
): string {
  return cleanTitle($(element).text());
}

function isValidHseTitle(
  title: string,
  url: string,
): boolean {
  if (!title || title.length < 10) {
    return false;
  }

  const parsed = new URL(url);
  const pathname = parsed.pathname.toLowerCase();

  if (
    pathname.includes("/news/tags/") ||
    pathname.includes("/news/keywords/")
  ) {
    return false;
  }

  const invalidTitles = [
    "мониторинги",
    "публикации",
    "исследования и аналитика",
    "статистические данные",
    "международные сопоставления",
    "финансирование науки",
    "ии-компетенции",
    "образование",
    "свободное общение",
    "спецпроекты",
    "интерактив",
    "москва: наука и инновации",
    "будущее мировой науки",
  ];

  if (invalidTitles.includes(title.toLowerCase())) {
    return false;
  }

  const lowerTitle = title.toLowerCase();

  if (
    lowerTitle.startsWith("статистические сборники за") ||
    lowerTitle.startsWith("доклады и монографии:")
  ) {
    return false;
  }

  if (title.includes(" | «Индикаторы")) {
    return false;
  }

  if (title.includes(" | «Будущее мировой науки»")) {
    return false;
  }

  return true;
}

function extractTitle(
  $: cheerio.CheerioAPI,
  element: Element,
  sourceSlug: string,
): string {
  switch (sourceSlug) {
    case "hh-blog":
      return extractHhTitle($, element);

    case "skillbox-corptrain":
      return extractSkillboxTitle($, element);

    case "yandex-practicum-b2b":
      return extractYandexTitle($, element);

    case "uprav-blog":
      return extractUpravTitle($, element);

    case "skolkovo-research":
      return extractSkolkovoTitle($, element);

    case "hse-isec":
      return extractHseTitle($, element);

    default:
      return cleanTitle($(element).text());
  }
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${response.statusText}`,
    );
  }

  return response.text();
}

async function collectSource(
  source: (typeof SOURCES)[number],
): Promise<Candidate[]> {
  console.log(`\nCollecting: ${source.name}`);
  console.log(`URL: ${source.url}`);

  if (source.allowedPathPrefixes.length === 0) {
    console.log("Skipped: source temporarily disabled.");
    return [];
  }

  const html = await fetchHtml(source.url);
  const $ = cheerio.load(html);

  const candidates: Candidate[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");

    if (!href) {
      return;
    }

    const url = normalizeUrl(href, source.url);

    if (!isAllowedUrl(url, source)) {
      return;
    }

    if (seen.has(url)) {
      return;
    }

    const sourceHost = new URL(source.url).hostname;
    const articleHost = new URL(url).hostname;

    if (sourceHost !== articleHost) {
      return;
    }

    const title = extractTitle(
      $,
      element,
      source.slug,
    );

    if (title.length < 10) {
      return;
    }

    if (
      source.slug === "skolkovo-research" &&
      title.toLowerCase() === "читать далее"
    ) {
      return;
    }

    if (
      source.slug === "hse-isec" &&
      !isValidHseTitle(title, url)
    ) {
      return;
    }

    const publishedAt =
      source.slug === "skolkovo-research" ||
      source.slug === "hse-isec"
        ? extractDateFromElement($, element)
        : undefined;

    seen.add(url);

    candidates.push({
      sourceSlug: source.slug,
      title,
      url,
      publishedAt,
    });
  });

  return candidates;
}

async function main() {
  console.log("=================================");
  console.log("SOURCE COLLECTION TEST");
  console.log("=================================");

  for (const source of SOURCES) {
    try {
      const candidates = await collectSource(source);

      console.log(
        `Found ${candidates.length} candidate links.`,
      );

      for (const candidate of candidates.slice(0, 15)) {
        console.log(`- ${candidate.title}`);
        console.log(`  ${candidate.url}`);

        if (candidate.publishedAt) {
          console.log(
            `  Published: ${candidate.publishedAt}`,
          );
        }
      }
    } catch (error) {
      console.error(
        `Failed to collect ${source.name}:`,
        error,
      );
    }
  }
}

await main();