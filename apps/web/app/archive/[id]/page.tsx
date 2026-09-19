import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@learning-intelligence/database";

export const dynamic = "force-dynamic";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export default async function IssuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const issue = await prisma.digest.findUnique({
    where: {
      id,
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
              publishedAt: true,
              excerpt: true,
            },
          },
        },
      },
    },
  });

  if (!issue) {
    notFound();
  }

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
        <Link
          href="/archive"
          className="text-sm text-[#a78b52] transition hover:text-[#d7b56d]"
        >
          ← Все выпуски
        </Link>

        <div className="mt-8 border-b border-[#4c4538] pb-8">
          <p className="text-xs uppercase tracking-[0.25em] text-[#a78b52]">
            Выпуск
          </p>

          <h1 className="mt-3 font-serif text-4xl font-semibold tracking-tight text-[#f1ead9] sm:text-5xl">
            {formatDate(issue.periodStart)}
          </h1>

          <p className="mt-4 text-base text-[#8f8b82]">
            {issue.articles.length}{" "}
            {issue.articles.length === 1
              ? "материал"
              : issue.articles.length >= 2 && issue.articles.length <= 4
                ? "материала"
                : "материалов"}
          </p>
        </div>

        {issue.articles.length === 0 ? (
          <div className="mt-10 border border-[#4c4538] bg-[#191b20] p-8 text-[#aaa59a]">
            В этом выпуске пока нет материалов.
          </div>
        ) : (
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {issue.articles.map(({ article }) => (
              <Link
                key={article.id}
                href={`/articles/${article.id}`}
                className="group border border-[#3f3b33] bg-[#191b20] transition hover:border-[#8a7448]"
              >
                {article.imageUrl ? (
                  <div className="aspect-[16/9] overflow-hidden bg-[#25272d]">
                    <img
                      src={article.imageUrl}
                      alt=""
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                    />
                  </div>
                ) : (
                  <div className="flex aspect-[16/9] items-center justify-center bg-[radial-gradient(circle_at_center,#4c3d26,transparent_55%),#17191f] text-5xl text-[#c99a4a]/40">
                    ✦
                  </div>
                )}

                <div className="p-5">
                  <h2 className="font-serif text-xl font-semibold leading-snug text-[#e9e2d2] group-hover:text-[#d7b56d]">
                    {article.translatedTitle || article.title}
                  </h2>

                  {article.excerpt && (
                    <p className="mt-3 line-clamp-3 text-sm leading-5 text-[#8f8b82]">
                      {article.excerpt}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
