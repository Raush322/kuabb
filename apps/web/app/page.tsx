const modules = [
  { name: "Journal", description: "Материалы и сигналы", number: "01" },
  {
    name: "AI Analysis",
    description: "Анализ и объяснение релевантности",
    number: "02",
  },
  {
    name: "RSS Collection",
    description: "Сбор материалов из источников",
    number: "03",
  },
  {
    name: "Admin",
    description: "Управление источниками, темами и правилами",
    number: "04",
  },
];

function ArrowUpRight() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 16 16"
    >
      <path
        d="M4 12 12 4M6 4h6v6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f8f6] text-[#18231f]">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-7 sm:px-10 lg:px-14 lg:py-10">
        <header className="flex items-center justify-between border-b border-[#dce1dc] pb-6">
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#173f35] text-xs font-semibold tracking-[0.14em] text-[#eff3ee]">
              LI
            </div>
            <span className="text-sm font-medium tracking-[-0.01em] text-[#26342e]">
              Learning Intelligence
            </span>
          </div>
          <span className="rounded-full border border-[#d4ddd5] bg-[#fbfcfa] px-3 py-1.5 text-xs font-medium text-[#526057]">
            Internal preview
          </span>
        </header>

        <section className="grid flex-1 items-center gap-12 py-14 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] lg:gap-20 lg:py-20">
          <div className="max-w-3xl">
            <p className="mb-6 text-xs font-semibold uppercase tracking-[0.18em] text-[#5c7667]">
              Intelligence journal · Banking
            </p>
            <h1 className="max-w-2xl text-4xl font-semibold tracking-[-0.045em] text-[#13251d] sm:text-5xl lg:text-6xl">
              Learning Intelligence <span className="text-[#527663]">+ Banking</span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[#526057] sm:text-xl">
              Что происходит в мире обучения, навыков, технологий и бизнеса — и
              что из этого может изменить корпоративное обучение.
            </p>
            <div className="mt-9 inline-flex items-center gap-2 rounded-full border border-[#c9d7ce] bg-[#edf4ef] px-3.5 py-2 text-sm font-medium text-[#315d48]">
              <span className="h-2 w-2 rounded-full bg-[#4f8a68]" />
              Технический каркас готов
            </div>
          </div>

          <aside className="border-l border-[#dce1dc] pl-6 sm:pl-8 lg:pl-10">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6b786f]">
              Следующий этап
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-base font-medium text-[#203128]">
              <span>RSS</span>
              <span className="text-[#91a398]">→</span>
              <span>AI-анализ</span>
              <span className="text-[#91a398]">→</span>
              <span>модерация</span>
              <span className="text-[#91a398]">→</span>
              <span>журнал</span>
            </div>
            <p className="mt-5 max-w-sm text-sm leading-6 text-[#68756d]">
              Последовательно добавляем надёжный редакционный поток — от
              источника до понятного решения для learning-функции.
            </p>
          </aside>
        </section>

        <section aria-labelledby="modules-title" className="pb-8">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6b786f]">
                Product foundation
              </p>
              <h2 id="modules-title" className="mt-2 text-xl font-semibold tracking-[-0.025em] text-[#1d2e25]">
                Будущие модули
              </h2>
            </div>
            <span className="hidden text-sm text-[#7a867e] sm:block">Демонстрационный интерфейс</span>
          </div>
          <div className="grid gap-px overflow-hidden rounded-xl border border-[#dce1dc] bg-[#dce1dc] sm:grid-cols-2">
            {modules.map((module) => (
              <article
                key={module.name}
                className="flex min-h-40 flex-col justify-between bg-[#fbfcfa] p-6"
              >
                <div className="flex items-start justify-between gap-6">
                  <span className="text-xs font-medium tabular-nums text-[#91a398]">
                    {module.number}
                  </span>
                  <span className="text-[#98a49c]">
                    <ArrowUpRight />
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold tracking-[-0.02em] text-[#1c2c24]">
                    {module.name}
                  </h3>
                  <p className="mt-1.5 text-sm text-[#68756d]">{module.description}</p>
                </div>
              </article>
            ))}
          </div>
          <p className="mt-5 text-sm text-[#7a867e]">
            Функциональность будет добавляться поэтапно.
          </p>
        </section>
      </div>
    </main>
  );
}
