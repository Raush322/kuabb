import Link from "next/link";
import { prisma } from "@learning-intelligence/database";

export const dynamic = "force-dynamic";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export default async function ArchivePage() {
  const issues = await prisma.digest.findMany({
    orderBy: {
      periodStart: "desc",
    },
    include: {
      articles: {
        orderBy: {
          position: "asc",
        },
        include: {
          article: {
            select: {
              id: true,
              title: true,
              translatedTitle: true,
              imageUrl: true,
            },
          },
        },
      },
    },
  });

  return (
    <main className="min-h-screen bg-[#111318] text-[#eee8d8]">
      <header className="border-b border-[#5f5540] bg-[#17191f]">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <div className="flex items-center justify-between gap-6">
            <Link
              href="/"
              className="font-serif text-2xl font-semibold tracking-wide text-[#d7b56d]"
            >
              МирAI
            </Link>

            <nav className="flex flex-wrap gap-5 text-sm text-[#bdb7a8]">
              <Link href="/" className="transition hover:text-[#d7b56d]">
                Главная
              </Link>
              <Link
                href="/archive"
                className="text-[#d7b56d]"
              >
                Архив
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-10 max-w-3xl">
          <p className="mb-3 text-xs uppercase tracking-[0.25em] text-[#a78b52]">
            Архив выпусков
          </p>

          <h1 className="font-serif text-5xl font-semibold tracking-tight text-[#f1ead9]">
            Предыдущие выпуски
          </h1>

          <p className="mt-5 text-base leading-7 text-[#aaa59a]">
            Каждый выпуск собирает материалы, отобранные за отдельные сутки.
            Старые выпуски остаются доступными в архиве.
          </p>
        </div>

        {issues.length === 0 ? (
          <div className="border border-[#4c4538] bg-[#191b20] p-8 text-[#aaa59a]">
            Архив пока пуст.
          </div>
        ) : (
          <div className="space-y-10">
            {issues.map((issue) => (
              <section
                key={issue.id}
                className="border border-[#4c4538] bg-[#191b20] p-6 md:p-8"
              >
                <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[#39362f] pb-5">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[#a78b52]">
                      Выпуск
                    </p>

                    <h2 className="mt-2 font-serif text-3xl font-semibold text-[#eee8d8]">
                      {formatDate(issue.periodStart)}
                    </h2>
                  </div>

                  <span className="text-sm text-[#8f8b82]">
                    {issue.articles.length}{" "}
                    {issue.articles.length === 1
                      ? "материал"
                      : issue.articles.length >= 2 &&
                          issue.articles.length <= 4
                        ? "материала"
                        : "материалов"}
                  </span>
                </div>

                {issue.articles.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {issue.articles.map(({ article }) => (
                      <Link
                        key={article.id}
                        href={`/articles/${article.id}`}
                        className="group border border-[#3f3b33] bg-[#15171c] p-5 transition hover:border-[#8a7448]"
                      >
                        {article.imageUrl ? (
                          <div className="mb-4 aspect-[16/9] overflow-hidden bg-[#25272d]">
                            <img
                              src={article.imageUrl}
                              alt=""
                              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                            />
                          </div>
                        ) : null}

                        <h3 className="font-serif text-xl font-semibold leading-snug text-[#e9e2d2] group-hover:text-[#d7b56d]">
                          {article.translatedTitle || article.title}
                        </h3>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-[#8f8b82]">
                    В этом выпуске пока нет материалов.
                  </p>
                )}
              </section>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}