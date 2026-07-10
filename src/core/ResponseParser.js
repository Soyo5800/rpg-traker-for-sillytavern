// src/core/ResponseParser.js

/**
 * HTML 특수 엔티티 문자를 안전하게 원본 기호로 디코딩
 */
function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * 미완성되거나 중간에 끊긴 JSON 문자열을 보정하여 최대한 파싱 가능한 구조로.
 * 열린 따옴표, 중괄호, 대괄호를 역순으로 매칭하여 안전하게 닫아줌.
 */
export function repairJson(jsonStr) {
  let cleaned = jsonStr.trim();
  if (!cleaned) return "{}";

  let inString = false;
  let escaped = false;
  const stack = [];
  let repaired = "";

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];

    if (escaped) {
      repaired += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      repaired += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      repaired += char;
      continue;
    }

    repaired += char;

    if (!inString) {
      if (char === '{' || char === '[') {
        stack.push(char === '{' ? '}' : ']');
      } else if (char === '}' || char === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === char) {
          stack.pop();
        }
      }
    }
  }

  // 따옴표 내부에서 문자열이 잘렸을 때 따옴표 강제 종결
  if (inString) {
    repaired += '"';
  }

  // 닫는 중괄호/대괄호 직전 구조적 유효성을 저해하는 뒤처진 문자(쉼표, 콜론 등) 정리
  repaired = repaired.trim();
  while (repaired.length > 0 && /[,:\s]$/.test(repaired)) {
    repaired = repaired.slice(0, -1);
  }

  // 누적된 열린 괄호들을 역순으로 안전하게 폐합
  while (stack.length > 0) {
    repaired += stack.pop();
  }

  return repaired;
}

/**
 * Extracts the JSON patch from the LLM response text and returns the cleaned text and the patch object.
 * Expects the JSON block to be at the very beginning of the response.
 * @param {string} text - The raw response text from the LLM.
 * @returns {{ cleanedText: string, patch: object|null }}
 */
export function parseResponse(text) {
  if (!text) return { cleanedText: '', patch: null };

  // 번역 플러그인 또는 가상 프록시가 이스케이프한 HTML 기호를 사전에 완벽 해제
  const decodedText = decodeHtmlEntities(text);

  const jsonBlockRegex = /^(?:\s*<!--(?:RPG_TRACKER)?\s*)?```(?:json|markdown)?\s*\n?(\{[\s\S]*?(?:"status"|"statusSchema"|"stats"|"profile"|"inventory"|"quests"|"Character Name"|"World")[\s\S]*?\})\s*\n?```(?:\s*-->)?/i;
  const match = decodedText.match(jsonBlockRegex);

  if (match && match[1]) {
    try {
      // JSON 파싱 직전 자가 복구 수행
      const repairedString = repairJson(match[1]);
      const patch = JSON.parse(repairedString);
      const cleanedText = decodedText.replace(match[0], '').trim();
      return { cleanedText, patch };
    } catch (e) {
      console.error("[RPG Tracker] Failed to parse JSON patch from response:", e);
      return { cleanedText: text, patch: null };
    }
  }

  const rawJsonRegex = /^(?:\s*<!--(?:RPG_TRACKER)?\s*)?(\{[\s\S]*?\})(?:\s*-->)?(?=\n|$)/;
  const rawMatch = decodedText.match(rawJsonRegex);
  
  if (rawMatch && rawMatch[1]) {
    try {
        // 단독 객체 형태의 백업 주석 블록에도 동일 복구 적용
        const repairedString = repairJson(rawMatch[1]);
        const patch = JSON.parse(repairedString);
        const cleanedText = decodedText.replace(rawMatch[0], '').trim();
        return { cleanedText, patch };
    } catch (e) {
        // 파싱 실패 시 원본 텍스트 반환 처리
    }
  }

  return { cleanedText: text, patch: null };
}