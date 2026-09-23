export type SourceFocus =
  | "learning"
  | "ai"
  | "finance"
  | "future-skills"
  | "bank-practice";

export type SourceConfig = {
  slug: string;
  name: string;
  url: string;
  feedType: "RSS" | "WEB";
  collectionType: "RSS" | "HTML";
  language: "ru" | "en";
  sourceType: "MEDIA" | "RESEARCH" | "ORGANIZATION";
  focus: SourceFocus[];
  maxHtmlCandidates?: number;
  htmlPathPrefixes?: string[];
};

export const SOURCES: SourceConfig[] = [
  {
    slug: "nbj-news",
    name: "НБЖ — Новости",
    url: "https://nbj.ru/news/",
    feedType: "WEB",
    collectionType: "HTML",
    language: "ru",
    sourceType: "MEDIA",
    focus: ["finance", "bank-practice"],
    htmlPathPrefixes: ["/news/"],
    maxHtmlCandidates: 35,
  },
  {
    slug: "banki-news",
    name: "Банки.ру — Новости",
    url: "https://www.banki.ru/webview/news/",
    feedType: "WEB",
    collectionType: "HTML",
    language: "ru",
    sourceType: "MEDIA",
    focus: ["finance", "bank-practice"],
    htmlPathPrefixes: ["/news/", "/webview/news/"],
    maxHtmlCandidates: 35,
  },
  {
    slug: "cbr-news",
    name: "Банк России — Новости",
    url: "https://www.cbr.ru/rss/RssNews",
    feedType: "RSS",
    collectionType: "RSS",
    language: "ru",
    sourceType: "ORGANIZATION",
    focus: ["finance"],
  },
  {
    slug: "cbr-events",
    name: "Банк России — Интервью и выступления",
    url: "https://www.cbr.ru/rss/eventrss",
    feedType: "RSS",
    collectionType: "RSS",
    language: "ru",
    sourceType: "ORGANIZATION",
    focus: ["finance"],
  },
  {
    slug: "cbr-press",
    name: "Банк России — Пресс-релизы",
    url: "https://www.cbr.ru/rss/RssPress",
    feedType: "RSS",
    collectionType: "RSS",
    language: "ru",
    sourceType: "ORGANIZATION",
    focus: ["finance"],
  },
  {
    slug: "rbc-neural-network",
    name: "РБК Тренды — Нейросети",
    url: "https://trends.rbc.ru/trends/tag/neural_network",
    feedType: "WEB",
    collectionType: "HTML",
    language: "ru",
    sourceType: "MEDIA",
    focus: ["ai"],
    htmlPathPrefixes: ["/trends/"],
    maxHtmlCandidates: 40,
  },
  {
    slug: "rbc-education-ai",
    name: "РБК Тренды — Образование",
    url: "https://trends.rbc.ru/trends/education",
    feedType: "WEB",
    collectionType: "HTML",
    language: "ru",
    sourceType: "MEDIA",
    focus: ["ai", "learning"],
    htmlPathPrefixes: ["/trends/"],
    maxHtmlCandidates: 40,
  },
  {
    slug: "the-decoder",
    name: "The Decoder",
    url: "https://the-decoder.com/feed/",
    feedType: "RSS",
    collectionType: "RSS",
    language: "en",
    sourceType: "MEDIA",
    focus: ["ai"],
  },
  {
    slug: "the-verge-ai",
    name: "The Verge — AI",
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    feedType: "RSS",
    collectionType: "RSS",
    language: "en",
    sourceType: "MEDIA",
    focus: ["ai"],
  },
  {
    slug: "wired-ai",
    name: "WIRED — AI",
    url: "https://www.wired.com/feed/tag/ai/latest/rss",
    feedType: "RSS",
    collectionType: "RSS",
    language: "en",
    sourceType: "MEDIA",
    focus: ["ai"],
  },
  {
    slug: "training-industry",
    name: "Training Industry",
    url: "https://trainingindustry.com/learning-and-development/",
    feedType: "WEB",
    collectionType: "HTML",
    language: "en",
    sourceType: "MEDIA",
    focus: ["learning"],
    htmlPathPrefixes: ["/articles/"],
    maxHtmlCandidates: 30,
  },
  {
    slug: "worklearning-ai",
    name: "WorkLearning.ai",
    url: "https://worklearning.ai/",
    feedType: "WEB",
    collectionType: "HTML",
    language: "en",
    sourceType: "MEDIA",
    focus: ["learning"],
    htmlPathPrefixes: ["/"],
    maxHtmlCandidates: 25,
  },
  {
    slug: "microsoft-work-trend-index",
    name: "Microsoft Work Trend Index",
    url: "https://www.microsoft.com/en-us/worklab/work-trend-index",
    feedType: "WEB",
    collectionType: "HTML",
    language: "en",
    sourceType: "ORGANIZATION",
    focus: ["future-skills"],
    maxHtmlCandidates: 25,
  },
  {
    slug: "wef-future-jobs",
    name: "World Economic Forum — Future of Jobs",
    url: "https://www.weforum.org/publications/the-future-of-jobs-report-2025/",
    feedType: "WEB",
    collectionType: "HTML",
    language: "en",
    sourceType: "RESEARCH",
    focus: ["future-skills"],
    maxHtmlCandidates: 20,
  },
];
