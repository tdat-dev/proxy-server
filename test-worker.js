// Test Worker từ Node.js
const testTranslation = async () => {
  const response = await fetch(
    "https://translation-proxy-worker.tvmaroka1.workers.dev/translate",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: "Hello world",
        sourceLang: "en",
        targetLang: "vi",
        provider: "gemini",
      }),
    }
  );

  console.log("Status:", response.status);
  console.log("Headers:", Object.fromEntries(response.headers.entries()));

  const data = await response.text();
  console.log("Response:", data);
};

testTranslation().catch(console.error);
