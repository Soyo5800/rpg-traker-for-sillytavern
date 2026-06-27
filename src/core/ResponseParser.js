// src/core/ResponseParser.js

/**
 * Extracts the JSON patch from the LLM response text and returns the cleaned text and the patch object.
 * Expects the JSON block to be at the very beginning of the response.
 * @param {string} text - The raw response text from the LLM.
 * @returns {{ cleanedText: string, patch: object|null }}
 */
export function parseResponse(text) {
  if (!text) return { cleanedText: '', patch: null };

  // json뿐만 아니라 HTML 주석(<!--RPG_TRACKER 및 <!--) 및 markdown, 빈 백틱 등도 허용하며 내부에 status, stats, Character Name 등의 키워드가 있는지 유연하게 확인
  const jsonBlockRegex = /^(?:\s*<!--(?:RPG_TRACKER)?\s*)?```(?:json|markdown)?\s*\n?(\{[\s\S]*?(?:"status"|"statusSchema"|"stats"|"profile"|"inventory"|"quests"|"Character Name"|"World")[\s\S]*?\})\s*\n?```(?:\s*-->)?/i;
  const match = text.match(jsonBlockRegex);

  if (match && match[1]) {
    try {
      const patch = JSON.parse(match[1]);
      // Remove the matched JSON block from the text (This is returned but not overwriting the chat UI text in index.js)
      const cleanedText = text.replace(match[0], '').trim();
      return { cleanedText, patch };
    } catch (e) {
      console.error("[RPG Tracker] Failed to parse JSON patch from response:", e);
      return { cleanedText: text, patch: null };
    }
  }

  // If no markdown JSON block is found, try finding just a JSON object at the start (optionally wrapped in HTML comments)
  const rawJsonRegex = /^(?:\s*<!--(?:RPG_TRACKER)?\s*)?(\{[\s\S]*?\})(?:\s*-->)?(?=\n|$)/;
  const rawMatch = text.match(rawJsonRegex);
  
  if (rawMatch && rawMatch[1]) {
    try {
        const patch = JSON.parse(rawMatch[1]);
        const cleanedText = text.replace(rawMatch[0], '').trim();
        return { cleanedText, patch };
    } catch (e) {
        // Not a valid JSON, just return the original text
    }
  }

  return { cleanedText: text, patch: null };
}
