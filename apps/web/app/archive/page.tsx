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

function getMaterialWord(count: number) {
  if (count === 1) return "материал";
  if (count >= 2 && count <= 4) return "материала";
  return "материалов";
}

function IssueIcon() {
  return (
    <div className="relative mx-auto flex h-36 w-28 items-center justify-center">
      <div className="absolute h-28 w-20 rotate-[-6deg] border border-[#8c6b38]/50 bg-[#d8bc82]/25" />
      <div className="absolute h-28 w-20 rotate-[6deg] border border-[#8c6b38]/35 bg-[#d8bc82]/15" />
      <div className="relative flex h-32 w-24 flex-col justify-center border border-[#b08a4a] bg-[#ead6a8] px-3 text-center text-[#302315] shadow-xl">
        <div className="text-3xl text-[#a77b32]">✦</div>
        <div className="mt-2 border-t border-[#85632f]/40 pt-2 font-serif text-[10px] uppercase tracking-[0.18em]">
          МирAI
        </div>
        <div className="mt-1 text-[9px] leading-3 text-[#5d492d]">
          выпуск
        </div>
      </div>
    </div>
  );
}

export default async function ArchivePage() {
  const issues = await prisma.digest.findMany({
    orderBy: {
      periodStart: "desc",
    },
    include: {
      _count: {
        select: {
          articles: true,
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
            Все выпуски
          </h1>

          <p className="mt-5 text-base leading-7 text-[#aaa59a]">
            Один день — один выпуск. Откройте нужную дату, чтобы посмотреть
            все материалы этого выпуска.
          </p>
        </div>

        {issues.length === 0 ? (
          <div className="border border-[#4c4538] bg-[#191b20] p-8 text-[#aaa59a]">
            Архив пока пуст.
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {issues.map((issue) => (
              <Link
                key={issue.id}
                href={`/archive/${issue.id}`}
                className="group border border-[#4c4538] bg-[#191b20] p-6 transition hover:-translate-y-1 hover:border-[#8a7448] hover:bg-[#1d2026]"
              >
                <IssueIcon />

                <div className="mt-4 border-t border-[#39362f] pt-5">
                  <div className="text-xs uppercase tracking-[0.18em] text-[#a78b52]">
                    Выпуск
                  </div>

                  <h2 className="mt-2 font-serif text-2xl font-semibold leading-tight text-[#eee8d8] group-hover:text-[#d7b56d]">
                    {formatDate(issue.periodStart)}
                  </h2>

                  <div className="mt-3 text-sm text-[#8f8b82]">
                    {issue._count.articles} {getMaterialWord(issue._count.articles)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
