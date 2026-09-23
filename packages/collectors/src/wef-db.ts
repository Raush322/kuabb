import crypto from "node:crypto";

import { prisma } from "@learning-intelligence/database";

import { extractArticle } from "./article-extractor.js";
import { SOURCES } from "./sources.js";
import { translateArticle } from "./translate-article.js";

const LOOKBACK_HOURS = 24;
const ISSUE_TIME_ZONE = "Europe/Moscow";

type SourceConfig = (typeof SOURCES)[number];

type Candidate = {
  sourceSlug: string;
  title: string;
  url: string;
  publishedAt: string | null;
  description: string;
};

type ExtractedArticle = {
  title: string;
  author: string | null;
  publishedAt: string | null;
  imageUrl: string | null;
  text: string;
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

class SourceFetchError extends Error {
  readonly status: number | null;
  readonly url: string;

  constructor(message: string, url: string, status: number | null = null) {
    super(message);
    this.name = "SourceFetchError";
    this.status = status;
    this.url = url;
  }
}

function isPermanentHttpError(error: unknown): boolean {
  if (!(error instanceof SourceFetchError)) return false;
  return error.status === 401 || error.status === 403 || error.status === 404;
}

async function fetchFeed(url: string, mode: "RSS" | "HTML" = "RSS", referer?: string): Promise<string> {
  const MAX_ATTEMPTS = 3;
  const RETRY_DELAY_MS = 2000;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      console.log(`${mode === "HTML" ? "Fetching HTML page" : "Fetching RSS feed"}: ${url} (attempt ${attempt}/${MAX_ATTEMPTS})`);

      const response = await fetch(url, {
        headers: mode === "HTML"
          ? {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
              Accept: "text/html,application/xhtml+xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
              "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
              "Cache-Control": "no-cache",
              Pragma: "no-cache",
              ...(referer ? { Referer: referer } : {}),
            }
          : {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
              Accept: "application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.8,ru;q=0.7",
            },
      });

      if (!response.ok) {
        throw new SourceFetchError(
          `HTTP ${response.status}: ${response.statusText}`,
          url,
          response.status,
        );
      }

      return await response.text();
    } catch (error) {
      lastError = error;
      console.error(
        `${mode === "HTML" ? "HTML page request" : "RSS feed request"} failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${url}`,
      );
      console.error(error);

      // 401/403/404 are deterministic source-access failures.
      // Retrying them only creates duplicate log noise and obscures the
      // real collection error count.
      if (isPermanentHttpError(error)) {
        throw error;
      }

      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function normalizeUrl(url: string, baseUrl: string): string {
  try {
    const parsed = new URL(url, baseUrl);
    parsed.hash = "";

    // Банки.ру identifies news articles by the `id` query parameter:
    // /news/lenta/?id=11027456. Dropping the query would collapse every
    // article to the same section URL and make deduplication/collection fail.
    if (parsed.hostname.replace(/^www\./, "") !== "banki.ru" || !parsed.searchParams.has("id")) {
      parsed.search = "";
    }

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

function cleanXmlText(value: string | undefined): string {
  return cleanTitle(
    (value ?? "")
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]+>/g, " "),
  );
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPromotionalCandidate(title: string): boolean {
  const normalized = normalizeForMatch(title);

  const strongPromotionalPatterns = [
    /\bfinal \d+ hours?\b/,
    /\b\d+ hours? (left|to)\b/,
    /\b\d+ days? left to\b/,
    /\blast chance\b/,
    /\bregister now\b/,
    /\bregistration (is )?open\b/,
    /\btickets?\b/,
    /\bexhibit(ing|or|ors)?\b/,
    /\bsponsor(ing|ed|ship)?\b/,
    /\bapply now\b/,
    /\bapplications? (are )?open\b/,
    /\bcall for speakers\b/,
    /\bbook (a )?table\b/,
    /\bbooth\b/,
    /\bexpo hall\b/,
    /\bside event\b/,
    /\bконференц/,
    /\bвебинар/,
    /\bрегистрац/,
    /\bбилет(ы|ов)?\b/,
    /\bвыстав/,
    /\bэкспонент/,
    /\bспонсор/,
    /\bподать заявку\b/,
    /\bзаявки? (открыт|принима)/,
    /\bдедлайн\b/,
    /\bпоследн\w* (час|дн)/,
    /\bостал\w* (час|дн)/,
    /\bзабронировать\b/,
    /\bстенд\b/,
    /\bэкспозал\b/,
  ];

  if (strongPromotionalPatterns.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  const genericEventPatterns = [
    /\bconference\b/,
    /\bevent(s)?\b/,
    /\bмероприяти/,
    /\bконференци/,
  ];

  const callToActionPatterns = [
    /\bregister\b/,
    /\bregistration\b/,
    /\bticket/,
    /\battend\b/,
    /\bjoin us\b/,
    /\bsign up\b/,
    /\bapply\b/,
    /\bзапиш/,
    /\bзарегистр/,
    /\bпосет/,
    /\bучаств/,
  ];

  return (
    genericEventPatterns.some((pattern) => pattern.test(normalized)) &&
    callToActionPatterns.some((pattern) => pattern.test(normalized))
  );
}

function getSourceConfig(sourceSlug: string): SourceConfig | undefined {
  return SOURCES.find((source) => source.slug === sourceSlug);
}

function testPattern(pattern: RegExp, text: string): boolean {
  if (/[А-Яа-яЁё]/.test(pattern.source)) {
    const russianSafePattern = new RegExp(
      pattern.source.replace(/\\b/g, ""),
      pattern.flags,
    );
    return russianSafePattern.test(text);
  }

  return pattern.test(text);
}

function hasAnySignal(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => testPattern(pattern, text));
}

const LEARNING_PATTERNS = [
  /\bcorporate learning\b/,
  /\bworkplace learning\b/,
  /\blearning and development\b/,
  /\bl&d\b/,
  /\blearning technology\b/,
  /\blearning platform\b/,
  /\bemployee development\b/,
  /\bprofessional development\b/,
  /\bupskilling\b/,
  /\breskilling\b/,
  /\blifelong learning\b/,
  /\btraining\b/,
  /\blearning\b/,
  /\bобучен/,
  /\bразвития сотрудник/,
  /\bразвити[ея] персонал/,
  /\bкорпоративн.*обучен/,
  /\bобучен.*сотрудник/,
  /\bпереобучен/,
  /\bповышен.*квалификац/,
  /\bдополнительн.*образован/,
  /\bl&d\b/,
] as const;

const AI_PATTERNS = [
  /\bartificial intelligence\b/,
  /\bgenerative ai\b/,
  /\bgenai\b/,
  /\bai agent(s)?\b/,
  /\bagentic\b/,
  /\blarge language model(s)?\b/,
  /\bllm(s)?\b/,
  /\bfoundation model(s)?\b/,
  /\bmultimodal\b/,
  /\bmachine learning\b/,
  /\bneural network(s)?\b/,
  /\bneural network\b/,
  /\bclaude\b/,
  /\bgemini\b/,
  /\bgpt(?:-\d+(?:\.\d+)?)?\b/,
  /\bopenai\b/,
  /\banthropic\b/,
  /\bdeepmind\b/,
  /\bmidjourney\b/,
  /\bнейросет/,
  /\bискусственн.*интеллект/,
  /\bгенеративн.*ии/,
  /\bгенеративн.*интеллект/,
  /\bмашинн.*обучен/,
] as const;

const FINANCE_PATTERNS = [
  /\bbank(s|ing)?\b/,
  /\bfintech\b/,
  /\bfinancial (?:service|services|product|products|sector|market)\b/,
  /\bpayment(s)?\b/,
  /\bpaytech\b/,
  /\bdigital ruble\b/,
  /\bdigital finance\b/,
  /\bcentral bank\b/,
  /\bcredit\b/,
  /\blending\b/,
  /\bmortgage\b/,
  /\bкарты?\b/,
  /\bбанк(и|ов|ами|ах|овский|овская)?\b/,
  /\bбанковск/,
  /\bфинтех/,
  /\bфинансов(ый|ая|ое|ые|ых|ого|ому|ом)?\b/,
  /\bплатеж/,
  /\bэквайр/,
  /\bцифров(ой|ого) рубл/,
  /\bкредит/,
  /\bипотек/,
] as const;

const BANK_PRACTICE_PATTERNS = [
  /\bemployee(s)?\b/,
  /\bworkforce\b/,
  /\bhr\b/,
  /\bhuman resources\b/,
  /\btalent\b/,
  /\bmanager(s)?\b/,
  /\bleadership\b/,
  /\btraining\b/,
  /\blearning\b/,
  /\bautomation\b/,
  /\bworkflow\b/,
  /\bprocess(es)?\b/,
  /\bcompetenc(y|ies)\b/,
  /\bskills?\b/,
  /\bсотрудник/,
  /\bперсонал/,
  /\bкадр/,
  /\bталант/,
  /\bлидерств/,
  /\bкомпетенц/,
  /\bнавык/,
  /\bавтоматизац/,
  /\bпроцесс/,
  /\bобучен/,
  /\bуправлен/,
] as const;

const FUTURE_SKILLS_PATTERNS = [
  /\bfuture skills\b/,
  /\bskills of the future\b/,
  /\bworkforce skills\b/,
  /\bskill(s)? gap\b/,
  /\bskills? shortage\b/,
  /\bjob(s)? of the future\b/,
  /\bfuture of work\b/,
  /\blabor market\b/,
  /\bworkplace\b/,
  /\boccupations?\b/,
  /\bcompetenc(y|ies)\b/,
  /\bпрофесс/,
  /\bнавык/,
  /\bкомпетенц/,
  /\bрынок труда\b/,
  /\bзанятост/,
  /\bпрофесси(я|и|й|ям|ях)\b/,
  /\bкадр(ы|ов|ами|ах)?\b/,
  /\bбудущ.*работ/,
] as const;

function isRelevantCandidate(
  title: string,
  description = "",
  sourceSlug?: string,
): boolean {
  const text = normalizeForMatch(`${title} ${description}`);

  if (isPromotionalCandidate(title)) {
    return false;
  }

  const source = sourceSlug ? getSourceConfig(sourceSlug) : undefined;
  const focus = source?.focus ?? [];

  if (focus.includes("ai")) {
    return hasAnySignal(text, AI_PATTERNS);
  }

  if (focus.includes("learning")) {
    return hasAnySignal(text, LEARNING_PATTERNS);
  }

  if (focus.includes("finance")) {
    return hasAnySignal(text, FINANCE_PATTERNS);
  }

  if (focus.includes("future-skills")) {
    return hasAnySignal(text, FUTURE_SKILLS_PATTERNS);
  }

  if (focus.includes("bank-practice")) {
    return (
      hasAnySignal(text, FINANCE_PATTERNS) &&
      hasAnySignal(text, BANK_PRACTICE_PATTERNS)
    );
  }

  return (
    hasAnySignal(text, LEARNING_PATTERNS) ||
    hasAnySignal(text, AI_PATTERNS) ||
    hasAnySignal(text, FINANCE_PATTERNS) ||
    hasAnySignal(text, FUTURE_SKILLS_PATTERNS)
  );
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

function extractDateFromElement($: any, element: any): string | null {
  const dateSelectors = [
    "pubDate",
    "published",
    "updated",
    "time",
    "meta[property='article:published_time']",
    "meta[name='date']",
    "meta[itemprop='datePublished']",
  ];

  for (const selector of dateSelectors) {
    const node = $(element).find(selector).first();
    const value = node.attr("datetime") ?? node.attr("content") ?? node.text();
    if (value && !Number.isNaN(new Date(value.trim()).getTime())) {
      return value.trim();
    }
  }

  return null;
}

function shouldSkipCbrRssUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith("cbr.ru")) return false;
    const path = parsed.pathname.toLowerCase();
    const blockedPrefixes = [
      "/queries/",
      "/registries/",
      "/rbr/",
      "/hd_base/",
      "/dkp/",
      "/statistics/",
      "/project_na/",
      "/finorg/",
      "/cash_circulation/",
      "/ec_research/",
      "/about_br/publ/",
    ];
    return blockedPrefixes.some((prefix) => path.startsWith(prefix));
  } catch {
    return false;
  }
}

async function collectRssSource(
  source: SourceConfig,
): Promise<Candidate[]> {
  const xml = await fetchFeed(source.url);
  const { load } = await import("cheerio");
  const $ = load(xml, { xmlMode: true });
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  let feedItemsSeen = 0;
  let feedItemsWithUrl = 0;
  let feedItemsRejectedByRelevance = 0;

  $("item, entry").each((_, element) => {
    feedItemsSeen++;
    const title = cleanXmlText($(element).find("title").first().text());
    if (title.length < 10) return;

    const linkElement = $(element).find("link").first();
    let rawUrl = linkElement.attr("href") ?? null;
    if (!rawUrl) rawUrl = linkElement.text().trim() || null;
    if (!rawUrl) rawUrl = $(element).find("guid").first().text().trim() || null;
    if (!rawUrl) return;
    feedItemsWithUrl++;

    const url = normalizeUrl(rawUrl, source.url);
    if (source.slug.startsWith("cbr-") && shouldSkipCbrRssUrl(url)) return;
    if (seen.has(url)) return;

    const publishedAt =
      $(element).find("pubDate").first().text().trim() ||
      $(element).find("published").first().text().trim() ||
      $(element).find("updated").first().text().trim() ||
      $(element).find("dc\\:date").first().text().trim() ||
      null;

    const description = cleanXmlText(
      $(element).find("description").first().text() ||
        $(element).find("summary").first().text() ||
        $(element).find("content\\:encoded").first().text(),
    );

    if (!isRelevantCandidate(title, description, source.slug)) {
      feedItemsRejectedByRelevance++;
      return;
    }

    seen.add(url);
    candidates.push({ sourceSlug: source.slug, title, url, publishedAt, description });
  });

  console.log(`RSS diagnostics: items=${feedItemsSeen}, withUrl=${feedItemsWithUrl}, rejectedByRelevance=${feedItemsRejectedByRelevance}, accepted=${candidates.length}`);
  return candidates;
}


function cleanWorkLearningTitle(title: string): string {
  return cleanTitle(title)
    .replace(/^(?:\w{3}\s+\d{1,2},\s+\d{4}\s*[•·]\s*)?/i, "")
    .replace(/^\d{1,2}\s+min read/i, "")
    .replace(/Part of\s+the WorkLearning\.ai Series\s*\|.*$/i, "")
    .replace(/\bRK\s*Prasad\s*$/i, "")
    .replace(/\bRKPrasad\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

const htmlPageCache = new Map<string, string>();
const articleCache = new Map<string, ExtractedArticle>();

async function collectHtmlSource(
  source: SourceConfig,
): Promise<Candidate[]> {
  let html = htmlPageCache.get(source.url);

  if (html) {
    console.log(`HTML cache hit: ${source.url}`);
  } else {
    html = await fetchFeed(source.url, "HTML");
    htmlPageCache.set(source.url, html);
  }
  const { load } = await import("cheerio");
  const $ = load(html);
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  let htmlLinksSeen = 0;
  let htmlLinksWithLongText = 0;
  let htmlRejectedByRelevance = 0;
  const base = new URL(source.url);
  const host = base.hostname.replace(/^www\./, "");
  const sourcePath = base.pathname.replace(/\/$/, "") || "/";
  const pathPrefixes = source.htmlPathPrefixes ?? [];

  const isArticleUrl = (parsed: URL): boolean => {
    if (parsed.hostname.replace(/^www\./, "") !== host) return false;
    if (!/^https?:$/.test(parsed.protocol)) return false;

    const pathname = parsed.pathname.toLowerCase();
    const normalizedPath = pathname.replace(/\/$/, "") || "/";
    if (normalizedPath === sourcePath.toLowerCase()) return false;
    if (pathPrefixes.length && !pathPrefixes.some((prefix) => pathname.startsWith(prefix.toLowerCase()))) {
      return false;
    }

    if (source.slug === "banki-news") {
      return pathname === "/news/lenta/" && parsed.searchParams.has("id");
    }

    // Generic article heuristics remain as a fallback for sources without a path map.
    if (!pathPrefixes.length) {
      return (
        pathname.includes("/article") ||
        pathname.includes("/news/") ||
        pathname.includes("/trends/") ||
        pathname.includes("/tech/") ||
        pathname.includes("/economy/") ||
        pathname.includes("/education/") ||
        pathname.includes("/ai/") ||
        pathname.includes("/articles/") ||
        /\d{5,}/.test(pathname)
      );
    }

    return true;
  };

  const addCandidate = (titleRaw: string, rawUrl: string | undefined, descriptionRaw = "", publishedAt: string | null = null) => {
    const title = source.slug === "worklearning-ai"
      ? cleanWorkLearningTitle(titleRaw)
      : cleanTitle(titleRaw);
    if (title.length < 20 || title.length > 300) return;
    htmlLinksWithLongText++;
    if (!rawUrl) return;

    let parsed: URL;
    try {
      parsed = new URL(rawUrl, source.url);
    } catch {
      return;
    }

    if (!isArticleUrl(parsed)) return;

    const url = normalizeUrl(parsed.toString(), source.url);
    if (seen.has(url)) return;

    const description = cleanTitle(descriptionRaw);
    if (!isRelevantCandidate(title, description, source.slug)) {
      htmlRejectedByRelevance++;
      return;
    }

    seen.add(url);
    candidates.push({
      sourceSlug: source.slug,
      title,
      url,
      publishedAt,
      description,
    });
  };

  // 1. Prefer semantic article/card containers. The anchor text is the primary title source.
  $("article, [itemtype*='Article'], [class*='article'], [class*='Article'], [class*='card'], [class*='Card']").each((_, element) => {
    const container = $(element);
    const link = container.find("a[href]").first();
    if (!link.length) return;

    const anchorTitle = cleanTitle(link.text());
    const heading = container.find("h1, h2, h3, h4, [itemprop='headline'], [class*='title'], [class*='Title']").first();
    const headingTitle = cleanTitle(heading.text());
    const ariaTitle = cleanTitle(link.attr("aria-label") || "");
    const title = anchorTitle.length >= 20 ? anchorTitle : headingTitle.length >= 20 ? headingTitle : ariaTitle;
    const description = cleanTitle(container.find("p, [itemprop='description'], [class*='excerpt'], [class*='summary'], [class*='description']").first().text());
    const publishedAt = extractDateFromElement($, element);
    addCandidate(title, link.attr("href"), description, publishedAt);
  });

  // 2. JSON-LD ItemList / Article data is common on modern editorial sites.
  $("script[type='application/ld+json']").each((_, element) => {
    const raw = $(element).html();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const visit = (value: any) => {
        if (!value || typeof value !== "object") return;
        if (Array.isArray(value)) {
          for (const item of value) visit(item);
          return;
        }
        if (Array.isArray(value.itemListElement)) {
          for (const item of value.itemListElement) visit(item);
        }
        const item = value.item ?? value;
        if (item && typeof item === "object") {
          const title = item.headline ?? item.name;
          const url = item.url ?? item.mainEntityOfPage?.['@id'];
          const description = item.description ?? "";
          const publishedAt = item.datePublished ?? item.dateModified ?? null;
          if (title && url) addCandidate(String(title), String(url), String(description), publishedAt ? String(publishedAt) : null);
        }
      };
      visit(parsed);
    } catch {
      // Some publishers embed JSON-LD with HTML entities or non-standard JSON.
    }
  });

  // 3. Final fallback: ordinary links, using the anchor text before any parent heading.
  $("a[href]").each((_, element) => {
    htmlLinksSeen++;
    const anchor = $(element);
    const container = anchor.closest("article, li, div").first();
    const anchorTitle = cleanTitle(anchor.text());
    const heading = container.find("h1, h2, h3, h4").first();
    const headingTitle = cleanTitle(heading.text());
    const ariaTitle = cleanTitle(anchor.attr("aria-label") || "");
    const title = anchorTitle.length >= 20 ? anchorTitle : headingTitle.length >= 20 ? headingTitle : ariaTitle;
    const description = cleanTitle(container.find("p").first().text());
    const publishedAt = extractDateFromElement($, container);
    addCandidate(title, anchor.attr("href"), description, publishedAt);
  });

  const limitedCandidates = candidates.slice(0, source.maxHtmlCandidates ?? 30);
  console.log(`HTML diagnostics: links=${htmlLinksSeen}, candidateTitles=${htmlLinksWithLongText}, rejectedByRelevance=${htmlRejectedByRelevance}, accepted=${limitedCandidates.length}`);
  return limitedCandidates;
}

async function collectSource(
  source: SourceConfig,
): Promise<Candidate[]> {
  console.log("");
  console.log(`--- SOURCE: ${source.name} ---`);

  // RBC blocks direct requests to the Education section with HTTP 406.
  // The Neural Network listing is accessible and already contains links to
  // /trends/education/ articles. Reuse the same cached HTML instead of
  // requesting the RBC listing page a second time.
  if (source.slug === "rbc-education-ai") {
    const neuralSource = SOURCES.find(
      (item) => item.slug === "rbc-neural-network",
    );

    if (!neuralSource) {
      throw new Error(
        "RBC education fallback requires rbc-neural-network source configuration.",
      );
    }

    console.log(
      `RBC education fallback: reusing ${neuralSource.url}`,
    );

    const neuralCandidates = await collectHtmlSource(neuralSource);

    const educationCandidates = neuralCandidates
      .filter((candidate) => {
        try {
          return new URL(candidate.url).pathname
            .toLowerCase()
            .startsWith("/trends/education/");
        } catch {
          return false;
        }
      })
      .map((candidate) => ({
        ...candidate,
        sourceSlug: source.slug,
      }));

    console.log(
      `RBC education fallback diagnostics: educationCandidates=${educationCandidates.length}`,
    );

    return educationCandidates;
  }

  console.log(`URL: ${source.url}`);

  const candidates = source.collectionType === "HTML"
    ? await collectHtmlSource(source)
    : await collectRssSource(source);

  return candidates;
}

const TOPIC_DEFINITIONS = [
  {
    slug: "learning-trends",
    name: "Тренды обучения",
    description:
      "Изменения в корпоративном обучении, L&D, learning technology, форматах и подходах к развитию сотрудников.",
    sortOrder: 1,
  },
  {
    slug: "ai",
    name: "ИИ",
    description:
      "Новые модели, агенты, AI-продукты, исследования, применение ИИ и влияние ИИ на работу и бизнес.",
    sortOrder: 2,
  },
  {
    slug: "finance-russia",
    name: "Финансовый сектор РФ",
    description:
      "Банки, финтех, платежи, финансовые продукты, банковские технологии и регулирование финансового сектора России.",
    sortOrder: 3,
  },
  {
    slug: "future-skills",
    name: "Навыки будущего",
    description:
      "Навыки, компетенции, профессии, рынок труда и изменения требований к специалистам.",
    sortOrder: 4,
  },
  {
    slug: "bank-practice",
    name: "Практика банков",
    description:
      "Практика банков как организаций и работодателей: сотрудники, обучение, HR, автоматизация, компетенции и организационные изменения.",
    sortOrder: 5,
  },
] as const;

type TopicDefinition = (typeof TOPIC_DEFINITIONS)[number];

function countMatches(text: string, patterns: readonly RegExp[]): number {
  return patterns.reduce(
    (total, pattern) => total + (testPattern(pattern, text) ? 1 : 0),
    0,
  );
}

function classifyArticleTopic(
  title: string,
  content: string,
  sourceSlug: string,
): { topic: TopicDefinition; confidence: number } {
  const text = normalizeForMatch(`${title} ${content.slice(0, 16000)}`);
  const titleText = normalizeForMatch(title);
  const source = getSourceConfig(sourceSlug);
  const focus = source?.focus ?? [];

  const ai = countMatches(text, AI_PATTERNS);
  const learning = countMatches(text, LEARNING_PATTERNS);
  const finance = countMatches(text, FINANCE_PATTERNS);
  const bankPractice = countMatches(text, BANK_PRACTICE_PATTERNS);
  const futureSkills = countMatches(text, FUTURE_SKILLS_PATTERNS);

  const titleAi = countMatches(titleText, AI_PATTERNS);
  const titleLearning = countMatches(titleText, LEARNING_PATTERNS);
  const titleFinance = countMatches(titleText, FINANCE_PATTERNS);
  const titleBank = countMatches(titleText, BANK_PRACTICE_PATTERNS);
  const titleSkills = countMatches(titleText, FUTURE_SKILLS_PATTERNS);

  // Source focus is a strong prior, but article content can override it when
  // another topic is clearly dominant.
  if (focus.includes("bank-practice") && titleBank + titleFinance >= 2 && bankPractice >= 2) {
    return { topic: TOPIC_DEFINITIONS[4], confidence: 0.95 };
  }

  if (focus.includes("finance") && finance >= 2 && bankPractice < 2) {
    return { topic: TOPIC_DEFINITIONS[2], confidence: 0.92 };
  }

  // AI is intentionally broad in this project. Learning-related AI stories
  // remain AI unless the article is primarily about an internal bank practice.
  if (ai >= 2 || titleAi > 0 || focus.includes("ai")) {
    if (focus.includes("learning") && titleLearning > 0 && titleAi > 0) {
      return { topic: TOPIC_DEFINITIONS[1], confidence: 0.95 };
    }
    return { topic: TOPIC_DEFINITIONS[1], confidence: titleAi > 0 ? 0.95 : 0.88 };
  }

  if (focus.includes("learning") || learning >= 3 || titleLearning >= 1) {
    return { topic: TOPIC_DEFINITIONS[0], confidence: titleLearning > 0 ? 0.94 : 0.85 };
  }

  if (futureSkills >= 2 || titleSkills > 0 || focus.includes("future-skills")) {
    return { topic: TOPIC_DEFINITIONS[3], confidence: titleSkills > 0 ? 0.94 : 0.85 };
  }

  if (bankPractice >= 2 && finance >= 2) {
    return { topic: TOPIC_DEFINITIONS[4], confidence: 0.88 };
  }

  if (finance >= 2 || titleFinance > 0 || focus.includes("finance")) {
    return { topic: TOPIC_DEFINITIONS[2], confidence: titleFinance > 0 ? 0.9 : 0.8 };
  }

  if (bankPractice >= 2 && finance > 0) {
    return { topic: TOPIC_DEFINITIONS[4], confidence: 0.82 };
  }

  if (futureSkills > learning) {
    return { topic: TOPIC_DEFINITIONS[3], confidence: 0.75 };
  }

  return { topic: TOPIC_DEFINITIONS[0], confidence: 0.65 };
}

async function ensureTopics(): Promise<void> {
  for (const definition of TOPIC_DEFINITIONS) {
    await prisma.topic.upsert({
      where: {
        slug: definition.slug,
      },
      update: {
        name: definition.name,
        description: definition.description,
        isActive: true,
        sortOrder: definition.sortOrder,
      },
      create: {
        name: definition.name,
        slug: definition.slug,
        description: definition.description,
        isActive: true,
        sortOrder: definition.sortOrder,
      },
    });
  }
}

async function assignPrimaryTopic(
  articleId: string,
  title: string,
  content: string,
  sourceSlug: string,
): Promise<void> {
  const classification = classifyArticleTopic(title, content, sourceSlug);

  const topic = await prisma.topic.findUnique({
    where: {
      slug: classification.topic.slug,
    },
  });

  if (!topic) {
    throw new Error(
      `Topic not found after initialization: ${classification.topic.slug}`,
    );
  }

  const currentPrimary = await prisma.articleTopic.findFirst({
    where: {
      articleId,
      isPrimary: true,
    },
    include: {
      topic: true,
    },
  });

  if (currentPrimary?.topic.slug === topic.slug) {
    await prisma.articleTopic.update({
      where: {
        articleId_topicId: {
          articleId,
          topicId: topic.id,
        },
      },
      data: {
        confidence: classification.confidence,
        isPrimary: true,
      },
    });
  } else {
    await prisma.articleTopic.deleteMany({
      where: {
        articleId,
      },
    });

    await prisma.articleTopic.create({
      data: {
        articleId,
        topicId: topic.id,
        confidence: classification.confidence,
        isPrimary: true,
      },
    });
  }

  console.log(
    `Topic assigned: ${classification.topic.name} (${classification.confidence})`,
  );
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
  const lastArticle =
    await prisma.digestArticle.findFirst({
      where: { digestId },
      orderBy: { position: "desc" },
    });

  return (lastArticle?.position ?? 0) + 1;
}

async function addArticleToDigest(
  digestId: string,
  articleId: string,
): Promise<boolean> {
  const existing =
    await prisma.digestArticle.findUnique({
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

  const position =
    await getNextDigestPosition(digestId);

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

async function getOrCreateSource(
  sourceConfig: SourceConfig,
) {
  const source = await prisma.source.upsert({
    where: {
      slug: sourceConfig.slug,
    },
    update: {
      name: sourceConfig.name,
      url: sourceConfig.url,
      language: sourceConfig.language,
      country:
        sourceConfig.language === "ru" ? "RU" : null,
      sourceType: sourceConfig.sourceType,
      isActive: true,
    },
    create: {
      slug: sourceConfig.slug,
      name: sourceConfig.name,
      url: sourceConfig.url,
      language: sourceConfig.language,
      country:
        sourceConfig.language === "ru" ? "RU" : null,
      sourceType: sourceConfig.sourceType,
      isActive: true,
    },
  });

  const sourceFeed = await prisma.sourceFeed.upsert({
    where: {
      sourceId_url: {
        sourceId: source.id,
        url: sourceConfig.url,
      },
    },
    update: {
      feedType: sourceConfig.feedType,
      isActive: true,
    },
    create: {
      sourceId: source.id,
      feedType: sourceConfig.feedType,
      url: sourceConfig.url,
      isActive: true,
    },
  });

  return {
    source,
    sourceFeed,
  };
}

async function saveAcceptedArticleSource(
  articleId: string,
  sourceId: string,
  sourceFeedId: string,
  sourceUrl: string,
): Promise<void> {
  const existing =
    await prisma.articleSource.findFirst({
      where: {
        articleId,
        sourceId,
        sourceUrl,
      },
    });

  if (existing) {
    return;
  }

  await prisma.articleSource.create({
    data: {
      articleId,
      sourceId,
      sourceFeedId,
      sourceUrl,
    },
  });
}

async function translateAcceptedArticle(
  articleId: string,
  title: string,
  originalContent: string,
) {
  console.log("");
  console.log("--- DEEPL TRANSLATION ---");

  const translation = await translateArticle(
    title,
    originalContent,
  );

  const updatedArticle = await prisma.article.update({
    where: { id: articleId },
    data: {
      translatedTitle: translation.translatedTitle,
      translatedContent: translation.translatedContent,
      translationLanguage:
        translation.translationLanguage,
      translationProvider:
        translation.translationProvider,
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

async function createCollectionItem(
  runId: string,
  sourceFeedId: string,
  articleId: string | null,
  status: string,
  error?: string,
) {
  return prisma.collectionItem.create({
    data: {
      collectionRunId: runId,
      sourceFeedId,
      articleId,
      status,
      error,
    },
  });
}

async function processCandidate(params: {
  candidate: Candidate;
  sourceConfig: SourceConfig;
  source: Awaited<
    ReturnType<typeof getOrCreateSource>
  >["source"];
  sourceFeed: Awaited<
    ReturnType<typeof getOrCreateSource>
  >["sourceFeed"];
  digest: Awaited<ReturnType<typeof getTodayDigest>>;
  runId: string;
  cutoff: Date;
}) {
  const {
    candidate,
    sourceConfig,
    source,
    sourceFeed,
    digest,
    runId,
    cutoff,
  } = params;

  console.log("");
  console.log("--- CANDIDATE ---");
  console.log(`Source: ${source.name}`);
  console.log(`Title: ${candidate.title}`);
  console.log(`URL: ${candidate.url}`);
  console.log(
    `RSS published: ${candidate.publishedAt ?? "not found"}`,
  );

  const sourceIsHtml = sourceConfig.collectionType === "HTML";

  if (!sourceIsHtml && !isFresh(candidate.publishedAt, cutoff)) {
    console.log(
      "Article skipped: RSS publication date is missing or older than 24 hours.",
    );

    await createCollectionItem(
      runId,
      sourceFeed.id,
      null,
      "NOT_RELEVANT",
      "Article is outside the 24-hour collection window or has no RSS publication date.",
    );

    return {
      fresh: false,
      newArticle: false,
      duplicate: false,
      relevant: false,
      error: false,
    };
  }

  let details: ExtractedArticle;

  const cachedArticle = articleCache.get(candidate.url);

  if (cachedArticle) {
    console.log(`Article cache hit: ${candidate.url}`);
    details = cachedArticle;
  } else {
    try {
      details = await extractArticle(candidate.url, candidate.title);
      articleCache.set(candidate.url, details);
    } catch (error) {
    console.error(
      `Article extraction failed: ${candidate.url}`,
    );
    console.error(error);

      await createCollectionItem(
        runId,
        sourceFeed.id,
        null,
        "ERROR",
        error instanceof Error
          ? error.message
          : String(error),
      );

      return {
        fresh: false,
        newArticle: false,
        duplicate: false,
        relevant: false,
        error: true,
      };
    }
  }

  // Some homepage cards (notably WorkLearning.ai) concatenate metadata into the
  // anchor text. The article extractor has the clean page title, so prefer it.
  if (sourceConfig.slug === "worklearning-ai" && details.title) {
    candidate.title = cleanWorkLearningTitle(details.title);
  }

  console.log(
    `Extracted article text: ${details.text.length} characters`,
  );
  console.log(
    `Published in article: ${details.publishedAt ?? "not found"}`,
  );

  const effectivePublishedAt = details.publishedAt ?? candidate.publishedAt;

  if (sourceIsHtml && !isFresh(effectivePublishedAt, cutoff)) {
    console.log(
      "Article skipped: extracted publication date is missing or older than 24 hours.",
    );

    await createCollectionItem(
      runId,
      sourceFeed.id,
      null,
      "NOT_RELEVANT",
      "HTML article is outside the 24-hour collection window or has no publication date.",
    );

    return {
      fresh: false,
      newArticle: false,
      duplicate: false,
      relevant: false,
      error: false,
    };
  }

  const canonicalUrl = normalizeUrl(
    candidate.url,
    sourceConfig.url,
  );

  const existingArticle =
    await prisma.article.findUnique({
      where: { canonicalUrl },
    });

  if (existingArticle) {
    console.log(
      `Existing article: ${existingArticle.id}`,
    );

    if (
      !isRelevantCandidate(
        existingArticle.title,
        (existingArticle.originalContent ?? "").slice(0, 12000),
        sourceConfig.slug,
      )
    ) {
      console.log(
        "Existing article skipped: current editorial relevance rules do not accept it.",
      );

      await createCollectionItem(
        runId,
        sourceFeed.id,
        existingArticle.id,
        "NOT_RELEVANT",
        "Existing article failed the current deterministic editorial relevance filter.",
      );

      return {
        fresh: true,
        newArticle: false,
        duplicate: true,
        relevant: false,
        error: false,
      };
    }

    await saveAcceptedArticleSource(
      existingArticle.id,
      source.id,
      sourceFeed.id,
      candidate.url,
    );

    if (!existingArticle.imageUrl && details.imageUrl) {
      await prisma.article.update({
        where: { id: existingArticle.id },
        data: { imageUrl: details.imageUrl },
      });
      console.log("Article image saved:", details.imageUrl);
    }

    await assignPrimaryTopic(
      existingArticle.id,
      existingArticle.title,
      (existingArticle.originalContent ?? "").slice(0, 12000),
      source.slug,
    );

    const added = await addArticleToDigest(
      digest.id,
      existingArticle.id,
    );

    await createCollectionItem(
      runId,
      sourceFeed.id,
      existingArticle.id,
      "RELEVANT",
    );

    return {
      fresh: true,
      newArticle: false,
      duplicate: true,
      relevant: added,
      error: false,
    };
  }

  const contentHash = crypto
    .createHash("sha256")
    .update(canonicalUrl)
    .digest("hex");

  const contentType =
    await prisma.contentType.findUnique({
      where: { code: "NEWS" },
    });

  if (!contentType) {
    throw new Error(
      "Content type NEWS not found.",
    );
  }

  const articleRecord = await prisma.article.create({
    data: {
      title: details.title || candidate.title,
      originalTitle:
        details.title || candidate.title,
      url: candidate.url,
      canonicalUrl,
      author: details.author,
      publishedAt: effectivePublishedAt
        ? new Date(effectivePublishedAt)
        : null,
      language: sourceConfig.language,
      excerpt: null,
      imageUrl: details.imageUrl,
      contentHash,
      originalContent: details.text,
      status: "NEW",
      contentTypeId: contentType.id,
    },
  });

  console.log(
    `Article created: ${articleRecord.id}`,
  );

  await saveAcceptedArticleSource(
    articleRecord.id,
    source.id,
    sourceFeed.id,
    candidate.url,
  );

  let publishedArticle = articleRecord;

  if (sourceConfig.language !== "ru") {
    try {
      publishedArticle =
        await translateAcceptedArticle(
          articleRecord.id,
          articleRecord.title,
          articleRecord.originalContent ?? "",
        );
    } catch (error) {
      console.error(
        `DeepL translation failed for article: ${articleRecord.id}`,
      );
      console.error(error);

      await prisma.article.delete({
        where: { id: articleRecord.id },
      });

      await createCollectionItem(
        runId,
        sourceFeed.id,
        null,
        "ERROR",
        error instanceof Error
          ? error.message
          : String(error),
      );

      return {
        fresh: true,
        newArticle: true,
        duplicate: false,
        relevant: false,
        error: true,
      };
    }
  } else {
    publishedArticle =
      await prisma.article.update({
        where: { id: articleRecord.id },
        data: {
          translatedTitle: articleRecord.title,
          translatedContent:
            articleRecord.originalContent,
          translationLanguage: "ru",
          translationProvider: null,
          translatedAt: null,
        },
      });

    console.log(
      "Russian source detected: DeepL translation skipped.",
    );
  }

  await assignPrimaryTopic(
    publishedArticle.id,
    publishedArticle.title,
    (publishedArticle.originalContent ?? "").slice(0, 12000),
    source.slug,
  );

  publishedArticle =
    await prisma.article.update({
      where: { id: publishedArticle.id },
      data: { status: "PUBLISHED" },
    });

  const added = await addArticleToDigest(
    digest.id,
    publishedArticle.id,
  );

  await createCollectionItem(
    runId,
    sourceFeed.id,
    publishedArticle.id,
    "RELEVANT",
  );

  console.log(
    `Article accepted: ${publishedArticle.id}`,
  );

  return {
    fresh: true,
    newArticle: true,
    duplicate: false,
    relevant: added,
    error: false,
  };
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

  let sourcesChecked = 0;
  let articlesFound = 0;
  let articlesNew = 0;
  let articlesDuplicate = 0;
  let articlesRelevant = 0;
  let errorCount = 0;
  let unavailableSourceCount = 0;

  try {
    await ensureTopics();

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

    for (const sourceConfig of SOURCES) {
      try {
        const { source, sourceFeed } =
          await getOrCreateSource(sourceConfig);

        sourcesChecked++;

        const candidates =
          await collectSource(sourceConfig);

        for (const candidate of candidates) {
          const result = await processCandidate({
            candidate,
            sourceConfig,
            source,
            sourceFeed,
            digest,
            runId: run.id,
            cutoff,
          });

          if (result.fresh) {
            articlesFound++;
          }

          if (result.newArticle) {
            articlesNew++;
          }

          if (result.duplicate) {
            articlesDuplicate++;
          }

          if (result.relevant) {
            articlesRelevant++;
          }

          if (result.error) {
            errorCount++;
          }
        }

        await prisma.sourceFeed.update({
          where: { id: sourceFeed.id },
          data: {
            lastCheckedAt: new Date(),
            lastSuccessAt: new Date(),
            lastError: null,
          },
        });
      } catch (error) {
        const isUnavailable = isPermanentHttpError(error);

        if (isUnavailable) {
          unavailableSourceCount++;
          console.warn(
            `Source unavailable: ${sourceConfig.name}`,
          );
        } else {
          errorCount++;
          console.error(
            `Failed to process source: ${sourceConfig.name}`,
          );
          console.error(error);
        }

        try {
          const { sourceFeed } =
            await getOrCreateSource(sourceConfig);

          await prisma.sourceFeed.update({
            where: { id: sourceFeed.id },
            data: {
              lastCheckedAt: new Date(),
              lastError:
                error instanceof Error
                  ? error.message
                  : String(error),
            },
          });
        } catch (sourceError) {
          console.error(
            "Failed to update source feed error state.",
          );
          console.error(sourceError);
        }
      }
    }

    await prisma.collectionRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: "SUCCESS",
        sourcesChecked,
        articlesFound,
        articlesNew,
        articlesDuplicate,
        articlesRelevant,
        errorCount,
      },
    });

    console.log("");
    console.log("==============================");
    console.log("COLLECTION RUN COMPLETED");
    console.log("==============================");
    console.log(`Run ID: ${run.id}`);
    console.log(`Digest ID: ${digest.id}`);
    console.log(`Sources checked: ${sourcesChecked}`);
    console.log(`Fresh articles: ${articlesFound}`);
    console.log(`Articles new: ${articlesNew}`);
    console.log(`Articles duplicate: ${articlesDuplicate}`);
    console.log(
      `Articles accepted and added to digest: ${articlesRelevant}`,
    );
    console.log(`Unavailable sources: ${unavailableSourceCount}`);
    console.log(`Errors: ${errorCount}`);
  } catch (error) {
    await prisma.collectionRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: "FAILED",
        sourcesChecked,
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
