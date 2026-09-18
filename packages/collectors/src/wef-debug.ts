const URL =
  "https://www.weforum.org/stories/jobs-and-the-future-of-work/what-skills-do-employers-want-in-the-age-of-ai/";

async function main() {
  const response = await fetch(URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Request failed: ${response.status} ${response.statusText}`,
    );
  }

  const html = await response.text();

  console.log(`Downloaded: ${html.length} characters`);

  const terms = [
    "datePublished",
    "dateModified",
    "published",
    "Sep 16, 2026",
    "Charlotte Edmond",
  ];

  for (const term of terms) {
    console.log(`\n===== SEARCH: ${term} =====`);

    let position = html.indexOf(term);

    if (position === -1) {
      console.log("Not found");
      continue;
    }

    while (position !== -1) {
      const start = Math.max(0, position - 500);
      const end = Math.min(html.length, position + term.length + 1000);

      console.log(html.slice(start, end));

      position = html.indexOf(term, position + term.length);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});