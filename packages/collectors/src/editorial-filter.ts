export const CURRENT_SOURCE_SLUGS = new Set([
  "google-ai",
  "techcrunch-ai",
  "the-verge-ai",
  "wired-ai",
  "ars-technica-ai",
  "the-decoder",
]);

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isInfrastructureCandidate(title: string): boolean {
  const normalized = title.toLowerCase();

  const excludedPatterns = [
    /\bdata cent(er|ers)\b/,
    /\bдата[- ]цент(р|ры)\b/,
    /\bgpu\b/,
    /\btpu\b/,
    /\bcompute\b/,
    /\bcomputing\b/,
    /\binference\b/,
    /\bsemiconductor/,
    /\bchip(s)?\b/,
    /\bчип(ы|ов|ах)?\b/,
    /\benergy for ai\b/,
    /\bai energy\b/,
    /\belectricity.*ai\b/,
    /\bai.*electricity\b/,
    /\bpower grid\b/,
    /\bgrid.*ai\b/,
  ];

  return excludedPatterns.some((pattern) => pattern.test(normalized));
}

export function isPromotionalCandidate(title: string): boolean {
  const normalized = title.toLowerCase();

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

  if (
    strongPromotionalPatterns.some((pattern) =>
      pattern.test(normalized),
    )
  ) {
    return true;
  }

  const genericEventPatterns = [
    /\bconference\b/,
    /\bconferences\b/,
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

export function isClearlyAdjacentNonAiContent(title: string): boolean {
  const normalizedTitle = normalizeForMatch(title);

  const patterns = [
    /\bdevfest\b/,
    /\bastronaut\b/,
    /\bspace\b.*\bdiscovery\b/,
    /\bfootball\b/,
    /\bnext big race\b/,
    /\bhome decor\b/,
    /\b70-year love story\b/,
  ];

  return patterns.some((pattern) => pattern.test(normalizedTitle));
}

export function isAiFocusedSource(sourceSlug: string): boolean {
  return CURRENT_SOURCE_SLUGS.has(sourceSlug);
}

export function hasAiSignal(
  title: string,
  description = "",
): boolean {
  const normalizedTitle = title.toLowerCase();
  const normalizedText = `${title} ${description}`.toLowerCase();

  const titlePatterns = [
    /\bartificial intelligence\b/,
    /\bai\b/,
    /\bai[- ]powered\b/,
    /\bai[- ]generated\b/,
    /\bai[- ]driven\b/,
    /\bai[- ]agent(s)?\b/,
    /\bagentic\b/,
    /\bautonomous agent(s)?\b/,
    /\bllm(s)?\b/,
    /\blarge language model(s)?\b/,
    /\bfoundation model(s)?\b/,
    /\b(?:new|frontier|reasoning|multimodal) model(s)?\b/,
    /\bmodel(s)?\s+(?:release|launch|update|training|evaluation)\b/,
    /\bmultimodal\b/,
    /\bmachine learning\b/,
    /\bdeep learning\b/,
    /\bneural network(s)?\b/,
    /\bcomputer vision\b/,
    /\breinforcement learning\b/,
    /\bmodel(s)?\b/,
    /\brobot(s|ics)?\b/,
    /\bhumanoid(s)?\b/,
    /\balignment\b/,
    /\bjailbreak(s|ed)?\b/,
    /\bprompt injection\b/,
    /\bsynthetic (data|media|content)\b/,
    /\bгенеративн/,
    /\bискусственн.*интеллект/,
    /\bмашинн.*обучен/,
    /\bнейросет/,
    /\bмультимодальн/,
    /\bробот(ы|а|ов|ам|ами|ах)?\b/,
    /\bавтономн.*(агент|систем|робот|ai|ии)\b/,
    /\bclaude\b/,
    /\bgemini\b/,
    /\bgpt(?:-\d+(?:\.\d+)?)?\b/,
    /\bopenai\b/,
    /\banthropic\b/,
    /\bdeepmind\b/,
    /\bmistral\b/,
    /\bhugging face\b/,
    /\bmeta ai\b/,
    /\bmicrosoft ai\b/,
  ];

  if (
    titlePatterns.some((pattern) => pattern.test(normalizedTitle))
  ) {
    return true;
  }

  const textPatterns = [
    /\bartificial intelligence\b/,
    /\bai\b/,
    /\bmachine learning\b/,
    /\blarge language model\b/,
    /\bfoundation model\b/,
    /\bmultimodal\b/,
    /\bllm\b/,
    /\bai agent\b/,
    /\brobotics\b/,
    /\bcomputer vision\b/,
    /\balignment\b/,
    /\bprompt injection\b/,
    /\bгенеративн/,
    /\bискусственн.*интеллект/,
    /\bнейросет/,
    /\bмультимодальн/,
    /\bclaude\b/,
    /\bgemini\b/,
    /\bgpt\b/,
    /\bopenai\b/,
    /\banthropic\b/,
    /\bdeepmind\b/,
  ];

  let matches = 0;

  for (const pattern of textPatterns) {
    if (pattern.test(normalizedText)) {
      matches++;
    }
  }

  return matches >= 2;
}

export function isRelevantCandidate(
  title: string,
  description = "",
  sourceSlug?: string,
): boolean {
  if (isInfrastructureCandidate(title)) {
    return false;
  }

  if (isPromotionalCandidate(title)) {
    return false;
  }

  if (isClearlyAdjacentNonAiContent(title)) {
    return false;
  }

  if (sourceSlug && isAiFocusedSource(sourceSlug)) {
    return true;
  }

  return hasAiSignal(title, description);
}