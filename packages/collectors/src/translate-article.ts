import "dotenv/config";

const DEEPL_API_URL = "https://api-free.deepl.com/v2/translate";

const apiKey = process.env.DEEPL_API_KEY;

if (!apiKey) {
  throw new Error("DEEPL_API_KEY is not set.");
}

type DeepLResponse = {
  translations: Array<{
    detected_source_language: string;
    text: string;
  }>;
};

async function translateText(
  text: string,
  targetLang = "RU",
): Promise<string> {
  const response = await fetch(DEEPL_API_URL, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: [text],
      target_lang: targetLang,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `DeepL API error ${response.status}: ${errorText}`,
    );
  }

  const data =
    (await response.json()) as DeepLResponse;

  const translation = data.translations?.[0]?.text;

  if (!translation) {
    throw new Error("DeepL returned an empty translation.");
  }

  return translation;
}

export async function translateArticle(
  title: string,
  content: string,
) {
  console.log("\nTranslating article with DeepL...");

  console.log(`Title length: ${title.length}`);
  console.log(`Content length: ${content.length}`);

  const [translatedTitle, translatedContent] =
    await Promise.all([
      translateText(title),
      translateText(content),
    ]);

  console.log("DeepL translation completed.");

  return {
    translatedTitle,
    translatedContent,
    translationLanguage: "RU",
    translationProvider: "DEEPL",
    translatedAt: new Date(),
  };
}