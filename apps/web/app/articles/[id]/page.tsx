import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@learning-intelligence/database";

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
  return tags.slice(0, 6).map((item) => item.tag.name);
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const article = await prisma.article.findUnique({
    where: {
      id,
    },
    include: {
      contentType: true,
      analyses: {
        orderBy: {
          analyzedAt: "desc",
        },
        take: 1,
      },
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
        take: 6,
      },
    },
  });

  if (!article) {
    notFound();
  }

  const analysis = article.analyses[0];
  const source = article.articleSources[0]?.source;
  const tags = getTags(article.articleTags);

  return (
    <main className="min-h-screen bg-[#071016] text-[#f1ead9]">
      <header className="border-b border-[#c99a4a]/25 bg-[#071016]">
        <div className="mx-auto max-w-[1100px] px-6 py-6 sm:px-8">
          <Link
            href="/"
            className="text-sm text-[#c99a4a] transition hover:text-[#e1bd73]"
          >
            ← Ак Барс Развитие
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-[1100px] px-6 py-12 sm:px-8 lg:py-16">
        <div className="mb-8 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.16em] text-[#b8b2a5]">
          {source && <span>{source.name}</span>}

          {article.publishedAt && (
            <>
              <span className="text-[#75603b]">•</span>
              <span>{formatDate(article.publishedAt)}</span>
            </>
          )}

          {article.contentType && (
            <>
              <span className="text-[#75603b]">•</span>
              <span>{article.contentType.name}</span>
            </>
          )}
        </div>

        <h1 className="max-w-[950px] text-4xl leading-[1.08] tracking-[-0.03em] text-[#e4bd72] sm:text-5xl lg:text-6xl">
          {article.translatedTitle || article.title}
        </h1>

        {article.author && (
          <div className="mt-6 text-sm text-[#b8b2a5]">
            Автор: {article.author}
          </div>
        )}

        {tags.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-[#75603b]/50 bg-[#111d24] px-3 py-1 text-xs text-[#d8c79f]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {article.excerpt && (
          <div className="mt-10 border-l-2 border-[#c99a4a] pl-6 text-xl leading-relaxed text-[#d6cfbf]">
            {article.excerpt}
          </div>
        )}

        <div className="my-12 h-px bg-[#c99a4a]/25" />

        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <div className="mb-4 text-xs uppercase tracking-[0.2em] text-[#c99a4a]">
              Материал
            </div>

            {article.translatedContent ? (
              <div className="whitespace-pre-line text-[18px] leading-[1.8] text-[#e7dfcf]">
                {article.translatedContent}
              </div>
            ) : article.originalContent ? (
              <div>
                <div className="mb-5 border border-[#75603b]/40 bg-[#111d24] px-4 py-3 text-sm text-[#b8b2a5]">
                  Перевод пока не выполнен. Ниже отображается оригинальный
                  текст материала.
                </div>

                <div className="whitespace-pre-line text-[18px] leading-[1.8] text-[#e7dfcf]">
                  {article.originalContent}
                </div>
              </div>
            ) : (
              <div className="border border-[#75603b]/40 bg-[#111d24] p-6 text-[#b8b2a5]">
                Текст материала пока не извлечён.
              </div>
            )}
          </div>

          <aside className="lg:pt-8">
            {analysis && (
              <div className="border border-[#75603b]/40 bg-[#111d24] p-6">
                <div className="mb-6 text-xs uppercase tracking-[0.18em] text-[#c99a4a]">
                  Почему это важно
                </div>

                {analysis.whyItMatters && (
                  <div className="mb-6">
                    <div className="mb-2 text-sm text-[#b8b2a5]">
                      Что стоит обратить внимание
                    </div>

                    <div className="text-[15px] leading-relaxed text-[#e7dfcf]">
                      {analysis.whyItMatters}
                    </div>
                  </div>
                )}

                {analysis.learningImplications && (
                  <div>
                    <div className="mb-2 text-sm text-[#b8b2a5]">
                      Для обучения
                    </div>

                    <div className="text-[15px] leading-relaxed text-[#e7dfcf]">
                      {analysis.learningImplications}
                    </div>
                  </div>
                )}
              </div>
            )}

            <a
              href={article.url}
              target="_blank"
              rel="noreferrer"
              className="mt-5 block border border-[#c99a4a]/40 px-5 py-4 text-center text-sm text-[#e4bd72] transition hover:bg-[#c99a4a]/10"
            >
              Открыть оригинал →
            </a>
          </aside>
        </div>

        <div className="mt-16 border-t border-[#c99a4a]/20 pt-6">
          <Link
            href="/"
            className="text-sm text-[#b8b2a5] transition hover:text-[#e4bd72]"
          >
            ← Вернуться к материалам
          </Link>
        </div>
      </article>
    </main>
  );
}