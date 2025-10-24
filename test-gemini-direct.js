// Test Gemini API trực tiếp
const testGemini = async () => {
  const apiKey = "AIzaSyCuL8T1ekkG4OJVuIFEvvcE5OxTG2U3eh4";
  const model = "gemini-2.5-flash";

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: "Translate to Vietnamese: Hello world",
              },
            ],
          },
        ],
      }),
    }
  );

  console.log("Status:", response.status);
  const data = await response.text();
  console.log("Response:", data);
};

testGemini().catch(console.error);
