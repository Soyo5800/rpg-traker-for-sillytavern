// src/core/StateHelpers.js

/**
 * 객체를 깊은 복사(Deep Clone)하는 헬퍼 함수
 * JSON 기반 데이터
 */
export function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    return JSON.parse(JSON.stringify(obj));
}

/**
 * [핵심 유틸] 중첩된 객체의 특정 경로(Path) 값을 안전하게 업데이트
 * @param {Object} obj - 원본 객체 (예: character 객체)
 * @param {Array<string|number>} pathArray - 변경할 경로 (예: ['inventory', 'storage', 'backpack'])
 * @param {any} value - 새로 넣을 값
 * @returns {Object} - 복제 및 수정이 완료된 새로운 객체
 */
export function setNestedValue(obj, pathArray, value) {
    const cloned = deepClone(obj);
    let current = cloned;

    for (let i = 0; i < pathArray.length - 1; i++) {
        const key = pathArray[i];
        // 경로가 존재하지 않으면 새로 생성 (다음 키가 숫자면 배열, 아니면 객체)
        if (current[key] === undefined || current[key] === null) {
            current[key] = typeof pathArray[i + 1] === 'number' ? [] : {};
        }
        current = current[key];
    }

    current[pathArray[pathArray.length - 1]] = value;
    return cloned;
}

/**
 * 중첩된 객체의 특정 경로(Path) 값을 안전하게 삭제
 * @param {Object} obj - 원본 객체
 * @param {Array<string|number>} pathArray - 삭제할 경로
 * @returns {Object} - 복제 및 삭제가 완료된 새로운 객체
 */
export function deleteNestedValue(obj, pathArray) {
    const cloned = deepClone(obj);
    let current = cloned;

    for (let i = 0; i < pathArray.length - 1; i++) {
        const key = pathArray[i];
        if (current[key] === undefined || current[key] === null) return cloned; // 이미 없으면 무시
        current = current[key];
    }

    delete current[pathArray[pathArray.length - 1]];
    return cloned;
}