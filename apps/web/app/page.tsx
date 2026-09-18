import Link from "next/link";

import { prisma } from "@learning-intelligence/database";

function Arrow() {
  return (
    <svg
      aria-hidden="true"
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M5 12h13M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatDate(date: Date | null) {
  if (!date) return "";

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function getTags(
  tags: Array<{
    tag: {
      name: string;
    };
  }>,
) {
  return tags.slice(0, 4).map((item) => item.tag.name);
}

const TOPICS = [
  {
    slug: "ai-tech",
    name: "AI и технологии",
  },
  {
    slug: "business-innovation",
    name: "Бизнес и инновации",
  },
  {
    slug: "research",
    name: "Исследования",
  },
];

type HomeProps = {
  searchParams: Promise<{
    topic?: string;
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const activeTopic = params.topic;

  const issueDate = new Date(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Moscow",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()) + "T00:00:00.000Z",
  );

  const digest = await prisma.digest.findUnique({
    where: {
      periodStart: issueDate,
    },
    include: {
      articles: {
        orderBy: {
          position: "asc",
        },
        include: {
          article: {
            include: {
              contentType: true,
              articleSources: {
                include: {
                  source: true,
                },
                take: 1,
              },
              articleTags: {
                include: {
                  tag: true,
                },
                take: 5,
              },
              articleTopics: {
                where: {
                  isPrimary: true,
                },
                include: {
                  topic: true,
                },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  let articles =
    digest?.articles.map((item) => item.article) ?? [];

  if (activeTopic) {
    articles = articles.filter(
      (article) =>
        article.articleTopics[0]?.topic.slug === activeTopic,
    );
  }

  const activeTopicName =
    TOPICS.find((topic) => topic.slug === activeTopic)?.name ??
    null;

  const heroArticle = articles[0];
  const latestArticles = articles.slice(1, 5);
  const attentionArticles = articles.slice(5, 8);

  return (
    <main className="min-h-screen bg-[#071016]">
      {/* HEADER */}
      <header className="relative z-20 border-b border-[#c99a4a]/25 bg-[#071016]/95">
        <div className="mx-auto max-w-[1450px] px-6 sm:px-8 lg:px-12">
          <div className="flex min-h-[110px] items-center">
            <Link href="/" className="shrink-0">
              <div className="text-[34px] leading-none tracking-[-0.045em] text-[#e4bd72]">
                <span className="text-[#f0e8d8]">Мир</span>
                <span className="text-[#e4bd72]">AI</span>
                <span className="ml-4 align-middle text-[24px] text-[#d4aa5d]">
                  ✦
                </span>
              </div>

              <div className="mt-3 text-[11px] uppercase tracking-[0.32em] text-[#b5ae9f]">
                Главное сегодня
              </div>
            </Link>
          </div>

          <nav className="flex overflow-x-auto border-t border-[#c99a4a]/15">
            <Link
              href="/"
              className={`shrink-0 border-b-2 px-5 py-5 text-sm transition-colors ${
                !activeTopic
                  ? "border-[#d2a453] bg-[#c99a4a]/10 text-[#e3bc70]"
                  : "border-transparent text-[#c1baad] hover:text-[#e3bc70]"
              }`}
            >
              Главная
            </Link>

            {TOPICS.map((topic) => (
              <Link
                key={topic.slug}
                href={`/?topic=${topic.slug}`}
                className={`shrink-0 border-b-2 px-5 py-5 text-sm transition-colors ${
                  activeTopic === topic.slug
                    ? "border-[#d2a453] bg-[#c99a4a]/10 text-[#e3bc70]"
                    : "border-transparent text-[#c1baad] hover:text-[#e3bc70]"
                }`}
              >
                {topic.name}
              </Link>
            ))}

            <Link
              href="/archive"
              className="shrink-0 border-b-2 border-transparent px-5 py-5 text-sm text-[#c1baad] transition-colors hover:text-[#e3bc70]"
            >
              Архив
            </Link>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden border-b border-[#c99a4a]/30 bg-[#080f14]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_50%,rgba(106,78,39,0.25),transparent_38%)]" />

        <div className="relative mx-auto max-w-[1450px] px-6 sm:px-8 lg:px-12">
          <div className="relative min-h-[500px]">
            <div className="relative z-10 flex min-h-[500px] max-w-[1100px] flex-col justify-center py-16 lg:py-20">
              <div className="mb-5 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#d0a55a]">
                {digest
                  ? `Выпуск от ${formatDate(digest.periodStart)}`
                  : "Сегодняшний выпуск"}
              </div>

              {activeTopicName && (
                <div className="mb-4 text-sm text-[#a89a81]">
                  Рубрика: {activeTopicName}
                </div>
              )}

              {heroArticle ? (
                <>
                  <h1 className="max-w-[1250px] text-4xl leading-[1.03] tracking-[-0.045em] text-[#f2e9d6] sm:text-5xl lg:text-[56px]">
                    {heroArticle.translatedTitle ||
                      heroArticle.title}
                  </h1>

                  {heroArticle.excerpt && (
                    <p className="mt-6 max-w-[650px] text-base leading-7 text-[#bdb5a6]">
                      {heroArticle.excerpt}
                    </p>
                  )}

                  <div className="mt-6 flex flex-wrap gap-2">
                    {getTags(heroArticle.articleTags).map(
                      (tag) => (
                        <span
                          key={tag}
                          className="rounded-md border border-[#6d644f] bg-[#111a20]/80 px-3 py-1.5 text-xs text-[#d0c5af]"
                        >
                          #{tag}
                        </span>
                      ),
                    )}
                  </div>

                  <div className="mt-7">
                    <Link
                      href={`/articles/${heroArticle.id}`}
                      className="inline-flex items-center gap-3 rounded-sm bg-[#d4aa5d] px-5 py-3 text-sm font-semibold text-[#16110a] transition hover:bg-[#e1bd73]"
                    >
                      Читать статью
                      <Arrow />
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <h1 className="max-w-[720px] text-5xl leading-[1.03] tracking-[-0.045em] text-[#f2e9d6]">
                    {activeTopicName ?? "МирAI"}
                  </h1>

                  <p className="mt-6 max-w-[650px] text-base leading-7 text-[#bdb5a6]">
                    {activeTopicName
                      ? "Материалы этой рубрики в сегодняшнем выпуске."
                      : "Главное о том, что нового появляется в мире искусственного интеллекта и технологий."}
                  </p>
                </>
              )}
            </div>

            <div className="absolute inset-0">
              {heroArticle?.imageUrl ? (
                <img
                  src={heroArticle.imageUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover opacity-90"
                />
              ) : (
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_55%_40%,#554328,transparent_22%),linear-gradient(120deg,#17242a,#080e13)]" />
              )}

              <div className="absolute inset-0 bg-gradient-to-r from-[#080f14] via-transparent to-[#080f14]/15" />

              <div className="absolute inset-0 bg-gradient-to-t from-[#080f14] via-transparent to-transparent" />

              <div className="absolute right-8 top-8 hidden w-36 border border-[#6b5230] bg-[#d9bd82] px-5 py-6 text-center text-[#2c2113] shadow-2xl lg:block">
                <div className="text-3xl">✦</div>

                <div className="my-3 border-t border-[#73572e]/40" />

                <div className="font-serif text-sm italic leading-5">
                  Новое появляется каждый день
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* LATEST */}
      <section className="parchment-section">
        <div className="relative mx-auto max-w-[1450px] px-6 py-12 sm:px-8 lg:px-12">
          <div className="mb-7 flex items-end justify-between">
            <div>
              <h2 className="text-3xl tracking-[-0.03em] text-[#21190f]">
                {activeTopicName
                  ? activeTopicName
                  : "Материалы выпуска"}
              </h2>

              <div className="mt-2 h-px w-28 bg-[#8e6b37]/50" />
            </div>

            <Link
              href="/archive"
              className="hidden items-center gap-2 text-sm text-[#5c4930] transition hover:text-[#2f2518] md:flex"
            >
              Архив выпусков
              <Arrow />
            </Link>
          </div>

          {latestArticles.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {latestArticles.map((article) => {
                const source =
                  article.articleSources[0]?.source;
                const tags = getTags(article.articleTags);

                return (
                  <Link
                    key={article.id}
                    href={`/articles/${article.id}`}
                    className="article-card flex flex-col"
                  >
                    <div className="article-image h-36">
                      {article.imageUrl ? (
                        <img
                          src={article.imageUrl}
                          alt=""
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-5xl text-[#c99a4a]/35">
                          ✦
                        </div>
                      )}

                      {article.contentType && (
                        <span className="absolute bottom-0 left-0 bg-[#d4aa5d] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#251a0c]">
                          {article.contentType.name}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-1 flex-col p-4">
                      <h3 className="text-[18px] font-semibold leading-[1.15] tracking-[-0.02em] text-[#22190e]">
                        {article.translatedTitle ||
                          article.title}
                      </h3>

                      {article.excerpt && (
                        <p className="mt-3 line-clamp-3 text-sm leading-5 text-[#766a58]">
                          {article.excerpt}
                        </p>
                      )}

                      <div className="mt-auto pt-5 text-xs text-[#4f4638]">
                        <div className="flex justify-between gap-2">
                          <span>
                            {source?.name ?? "Источник"}
                          </span>

                          <span>
                            {formatDate(
                              article.publishedAt,
                            )}
                          </span>
                        </div>

                        {tags.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {tags.map((tag) => (
                              <span
                                className="tag"
                                key={tag}
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="border border-[#6d5835]/25 bg-[#f1dfb9]/50 p-8 text-[#5f513d]">
              В этой рубрике пока нет материалов
              сегодняшнего выпуска.
            </div>
          )}
        </div>
      </section>

      {/* ATTENTION + COLLECTIONS */}
      <section className="dark-section">
        <div className="mx-auto max-w-[1450px] px-6 py-12 sm:px-8 lg:px-12">
          <div className="grid gap-10 lg:grid-cols-[1.08fr_0.92fr]">
            <div>
              <div className="mb-6 flex items-center gap-4">
                <h2 className="section-heading text-3xl">
                  Ещё в выпуске
                </h2>

                <div className="h-px flex-1 bg-[#8b6b38]/40" />
              </div>

              <div className="overflow-hidden rounded-sm border border-[#765a32]/45">
                {attentionArticles.length > 0 ? (
                  attentionArticles.map(
                    (article, index) => (
                      <Link
                        key={article.id}
                        href={`/articles/${article.id}`}
                        className="flex gap-5 border-b border-[#765a32]/25 px-5 py-5 last:border-0 transition hover:bg-[#c99a4a]/5"
                      >
                        <div className="w-10 shrink-0 text-2xl text-[#d3a24f]">
                          {String(index + 1).padStart(
                            2,
                            "0",
                          )}
                        </div>

                        <div>
                          <h3 className="text-base text-[#e5dcc9]">
                            {article.translatedTitle ||
                              article.title}
                          </h3>

                          {article.excerpt && (
                            <p className="mt-1 text-sm leading-5 text-[#999287]">
                              {article.excerpt}
                            </p>
                          )}
                        </div>
                      </Link>
                    ),
                  )
                ) : (
                  <div className="px-5 py-6 text-sm leading-6 text-[#999287]">
                    Здесь будут остальные материалы
                    сегодняшнего выпуска.
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="mb-6 flex items-center gap-4">
                <h2 className="section-heading text-3xl">
                  Темы
                </h2>

                <div className="h-px flex-1 bg-[#8b6b38]/40" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  [
                    "Модели и агенты",
                    "Новые модели, AI-агенты и методы",
                    "ai-tech",
                  ],
                  [
                    "Продукты и инструменты",
                    "Сервисы, функции и применения",
                    "ai-tech",
                  ],
                  [
                    "Бизнес и инновации",
                    "Компании, рынки и новые сценарии",
                    "business-innovation",
                  ],
                  [
                    "Исследования",
                    "Научные результаты и эксперименты",
                    "research",
                  ],
                ].map(([title, subtitle, topic]) => (
                  <Link
                    key={title}
                    href={`/?topic=${topic}`}
                    className="group relative min-h-[125px] overflow-hidden rounded-sm border border-[#765a32]/50 bg-[#101a20] p-5 transition hover:border-[#c99a4a]"
                  >
                    <div className="absolute right-4 top-2 text-5xl text-[#c99a4a]/10 transition group-hover:text-[#c99a4a]/20">
                      ✦
                    </div>

                    <div className="relative">
                      <div className="text-lg text-[#e3d9c7]">
                        {title}
                      </div>

                      <div className="mt-2 text-xs leading-5 text-[#a19a8d]">
                        {subtitle}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ARCHIVE LINK */}
      <section className="parchment-section border-t border-[#8e6b37]/40">
        <div className="relative mx-auto max-w-[1450px] px-6 py-12 sm:px-8 lg:px-12">
          <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
            <div className="max-w-2xl">
              <div className="text-xs uppercase tracking-[0.18em] text-[#75603d]">
                Архив
              </div>

              <blockquote className="mt-3 text-2xl leading-9 text-[#302417]">
                Прошлые выпуски остаются доступными
                для чтения.
              </blockquote>
            </div>

            <Link
              href="/archive"
              className="inline-flex shrink-0 items-center gap-3 border border-[#806332] bg-[#ead5a8] px-5 py-3 text-sm text-[#302316] transition hover:bg-[#f0dfb9]"
            >
              Перейти в архив
              <Arrow />
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-[#c99a4a]/20 bg-[#060d12]">
        <div className="mx-auto flex max-w-[1450px] flex-col gap-5 px-6 py-8 text-sm text-[#817c71] sm:px-8 md:flex-row md:items-center md:justify-between lg:px-12">
          <div>
            <div className="text-[#d0a55a]">
              МирAI
            </div>

            <div className="mt-1 text-xs">
              Журнал о новых событиях, идеях и технологиях
              искусственного интеллекта
            </div>
          </div>

          <div className="flex gap-6 text-xs">
            <a
              href="#"
              className="hover:text-[#d0a55a]"
            >
              О проекте
            </a>

            <a
              href="#"
              className="hover:text-[#d0a55a]"
            >
              Предложить материал
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}