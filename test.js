// Test script for translation proxy server
// Run: node test.js (make sure server is running on http://localhost:3000)

const API_URL = process.env.API_URL || "http://localhost:3000";

// Color output helpers
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

// Test cases
const tests = [
  {
    name: "Simple translation (English to Vietnamese)",
    request: {
      text: "Hello world",
      sourceLang: "en",
      targetLang: "vi",
      provider: "gemini",
    },
    validate: (res) => res.translation && res.detectedSourceLang === "en",
  },
  {
    name: "Auto-detect with Japanese text",
    request: {
      text: "こんにちは！今日はとても良い天気ですね。",
      sourceLang: "auto",
      targetLang: "en",
      provider: "gemini",
    },
    validate: (res) => res.translation && res.detectedSourceLang === "ja",
  },
  {
    name: "Mixed code and text (preserve code blocks)",
    request: {
      text: `The function returns a Promise.

\`\`\`js
async function fetchData() {
  const response = await fetch('/api');
  return response.json();
}
\`\`\`

This is an example of async/await syntax.`,
      sourceLang: "en",
      targetLang: "vi",
      provider: "gemini",
    },
    validate: (res) =>
      res.translation &&
      res.translation.includes("```js") &&
      res.translation.includes("async function"),
  },
  {
    name: "Text with emojis",
    request: {
      text: "Welcome to the future of AI! 🚀 This is amazing! 🌟✨",
      sourceLang: "en",
      targetLang: "vi",
      provider: "gemini",
    },
    validate: (res) =>
      res.translation &&
      res.translation.includes("🚀") &&
      res.translation.includes("🌟"),
  },
  {
    name: "Long paragraph",
    request: {
      text: `Artificial Intelligence has revolutionized the way we communicate across language barriers. 
      Modern translation technologies leverage deep learning models trained on billions of words to provide 
      accurate, context-aware translations. These systems can understand nuances, idioms, and cultural 
      references that were previously challenging for automated translation. With the advent of transformer 
      architectures like GPT and BERT, translation quality has reached unprecedented levels, making global 
      communication more accessible than ever before. This technology powers everything from international 
      business communications to casual conversations between friends across continents.`,
      sourceLang: "en",
      targetLang: "vi",
      provider: "gemini",
    },
    validate: (res) => res.translation && res.translation.length > 100,
  },
  {
    name: "Same source and target language (short-circuit)",
    request: {
      text: "This text should be returned as-is",
      sourceLang: "en",
      targetLang: "en",
      provider: "gemini",
    },
    validate: (res) =>
      res.translation === "This text should be returned as-is" &&
      res.cached === false,
  },
  {
    name: "Cache test (repeat first test)",
    request: {
      text: "Hello world",
      sourceLang: "en",
      targetLang: "vi",
      provider: "gemini",
    },
    validate: (res) => res.translation && res.cached === true,
  },
  {
    name: "Invalid request (missing text)",
    request: {
      text: "",
      targetLang: "vi",
      provider: "gemini",
    },
    expectError: true,
    expectedStatus: 400,
  },
  {
    name: "Invalid request (missing targetLang)",
    request: {
      text: "Hello",
      provider: "gemini",
    },
    expectError: true,
    expectedStatus: 400,
  },
  {
    name: "Invalid request (wrong provider)",
    request: {
      text: "Hello",
      targetLang: "vi",
      provider: "openai",
    },
    expectError: true,
    expectedStatus: 400,
  },
];

// Run tests
async function runTests() {
  log(colors.blue, "\n🧪 Starting Translation Proxy Tests\n");
  log(colors.blue, "═".repeat(60));

  let passed = 0;
  let failed = 0;

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    const testNum = i + 1;

    console.log(`\n[${testNum}/${tests.length}] ${test.name}`);

    try {
      const response = await fetch(`${API_URL}/translate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(test.request),
      });

      const data = await response.json();

      // Check if we expect an error
      if (test.expectError) {
        if (!response.ok && response.status === test.expectedStatus) {
          log(colors.green, "  ✓ Pass - Got expected error");
          log(colors.yellow, `    Status: ${response.status}`);
          log(colors.yellow, `    Error: ${data.error}`);
          passed++;
        } else {
          log(colors.red, "  ✗ Fail - Expected error but got success");
          failed++;
        }
      } else {
        // Check for success
        if (response.ok && test.validate(data)) {
          log(colors.green, "  ✓ Pass");
          log(
            colors.yellow,
            `    Translation: ${data.translation.substring(0, 100)}${
              data.translation.length > 100 ? "..." : ""
            }`
          );
          log(
            colors.yellow,
            `    Detected: ${data.detectedSourceLang}, Cached: ${data.cached}`
          );
          passed++;
        } else {
          log(colors.red, "  ✗ Fail - Validation failed");
          log(colors.yellow, `    Response:`, JSON.stringify(data, null, 2));
          failed++;
        }
      }
    } catch (error) {
      log(colors.red, `  ✗ Fail - Error: ${error.message}`);
      failed++;
    }

    // Small delay between tests
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Summary
  log(colors.blue, "\n" + "═".repeat(60));
  log(colors.blue, "\n📊 Test Summary\n");
  log(colors.green, `  Passed: ${passed}`);
  log(colors.red, `  Failed: ${failed}`);
  log(colors.blue, `  Total:  ${tests.length}`);

  if (failed === 0) {
    log(colors.green, "\n✨ All tests passed! ✨\n");
    process.exit(0);
  } else {
    log(colors.red, "\n❌ Some tests failed\n");
    process.exit(1);
  }
}

// Check if server is running
async function checkServer() {
  try {
    const response = await fetch(`${API_URL}/health`);
    const data = await response.json();
    log(
      colors.green,
      `✓ Server is running (uptime: ${Math.floor(data.uptime)}s, cache: ${
        data.cacheSize
      } entries)\n`
    );
    return true;
  } catch (error) {
    log(colors.red, `✗ Server is not running at ${API_URL}`);
    log(colors.yellow, "  Please start the server first: npm start\n");
    return false;
  }
}

// Main
(async () => {
  const serverRunning = await checkServer();
  if (serverRunning) {
    await runTests();
  } else {
    process.exit(1);
  }
})();
