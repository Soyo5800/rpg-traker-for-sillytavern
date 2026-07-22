// src/core/JSONTracker_Timeline.js

import { getDefaultCharacters, getInitialTrackerData } from './PromptSchema.js';
import { sanitizeTrackerData } from './JSONTracker_Migrator.js';
import { applyLLMPatch } from './JSONTracker_Patcher.js';

const DEFAULT_MAX_KEEP = 20;

/**
 * Remove large Base64 image data from the backup object to prevent chat file size bloat
 */
function stripBase64Avatars(data) {
    if (data && Array.isArray(data.characters)) {
        data.characters.forEach(char => {
            if (typeof char.avatarUrl === 'string' && char.avatarUrl.startsWith('data:')) {
                delete char.avatarUrl;
            }
        });
    }
    return data;
}

/**
 * Merge UI state changes directly into active tracker schemas
 */
export function defensiveMerge(masterSchema, backupData) {
    if (!backupData) return masterSchema;

    const merged = { ...masterSchema };

    Object.keys(masterSchema).forEach(key => {
        if (backupData[key] !== undefined) {
            if (key === 'characters' && Array.isArray(masterSchema.characters) && Array.isArray(backupData.characters)) {
                merged.characters = backupData.characters.map(backupChar => {
                    const masterChar = masterSchema.characters.find(c => c.id === backupChar.id) || {};
                    const cleanBackupChar = backupChar;
                    const cleanMasterChar = masterChar;
                    return {
                        ...cleanMasterChar,
                        ...cleanBackupChar,
                        statusSchema: cleanBackupChar.statusSchema || cleanMasterChar.statusSchema,
                        status: { ...(cleanMasterChar.status || {}), ...(cleanBackupChar.status || {}) },
                        profile: { ...(cleanMasterChar.profile || {}), ...(cleanBackupChar.profile || {}) },
                        profileLocks: { ...(cleanMasterChar.profileLocks || {}), ...(cleanBackupChar.profileLocks || {}) },
                        profileInjects: { ...(cleanMasterChar.profileInjects || {}), ...(cleanBackupChar.profileInjects || {}) },
                        inventory: { ...(cleanMasterChar.inventory || {}), ...(cleanBackupChar.inventory || {}) },
                        quests: { ...(cleanMasterChar.quests || {}), ...(cleanBackupChar.quests || {}) },
                        relations: { ...(cleanMasterChar.relations || {}), ...(cleanBackupChar.relations || {}) }
                    };
                });
            } else if (typeof masterSchema[key] === 'object' && !Array.isArray(masterSchema[key])) {
                merged[key] = { ...masterSchema[key], ...backupData[key] };
            } else {
                merged[key] = backupData[key];
            }
        }
    });

    if (Array.isArray(backupData.inventory)) merged.inventory = [...backupData.inventory];
    if (Array.isArray(backupData.quests)) merged.quests = [...backupData.quests];

    return merged;
}

/**
 * Remove older timeline backups to keep save files lightweight unless unlimited mode is enabled
 */
export function purgeOldBackups(chat, maxKeep = DEFAULT_MAX_KEEP) {
    if (!Array.isArray(chat)) return;

    // maxKeep이 -1 이하이거나 Infinity이면 무제한 보관 모드이므로 백업 정리를 스킵합니다.
    if (maxKeep < 0 || maxKeep === Infinity) return;

    let foundCount = 0;

    for (let i = chat.length - 1; i >= 0; i--) {
        const message = chat[i];
        if (!message) continue;

        let swipeId = message.swipe_id || 0;
        if (message.swipes && message.swipes.length > 0 && typeof message.mes === 'string') {
            const foundIdx = message.swipes.findIndex(s => s === message.mes);
            if (foundIdx !== -1) swipeId = foundIdx;
        }

        const hasHiddenBackup = message.swipe_info && message.swipe_info[swipeId] &&
            message.swipe_info[swipeId].extra && message.swipe_info[swipeId].extra.rpgTrackerData;

        if (hasHiddenBackup) {
            foundCount++;
            if (foundCount > maxKeep) {
                delete message.swipe_info[swipeId].extra.rpgTrackerData;
            }
        }
    }
}

/**
 * Back up current state variables inside the active ST message timeline
 */
export function backupToMessage(chat, index, trackerData, updateMessageFn, saveChatFn, maxKeep = DEFAULT_MAX_KEEP) {
    if (!Array.isArray(chat) || index < 0 || !chat[index]) return;

    const targetMessage = chat[index];

    let strippedData = JSON.parse(JSON.stringify(trackerData));
    strippedData = stripBase64Avatars(strippedData);

    let swipeId = targetMessage.swipe_id || 0;
    if (targetMessage.swipes && targetMessage.swipes.length > 0 && typeof targetMessage.mes === 'string') {
        const foundIdx = targetMessage.swipes.findIndex(s => s === targetMessage.mes);
        if (foundIdx !== -1) swipeId = foundIdx;
    }

    if (!Array.isArray(targetMessage.swipe_info)) targetMessage.swipe_info = [];
    if (!targetMessage.swipe_info[swipeId]) targetMessage.swipe_info[swipeId] = { extra: {} };
    if (!targetMessage.swipe_info[swipeId].extra) targetMessage.swipe_info[swipeId].extra = {};

    targetMessage.swipe_info[swipeId].extra.rpgTrackerData = strippedData;

    purgeOldBackups(chat, maxKeep);

    if (typeof saveChatFn === 'function') saveChatFn();
}

/**
 * Fast synchronous restoration from the closest historical message metadata
 */
export function rehydrateFromHistory(chat) {
    if (!Array.isArray(chat) || chat.length === 0) return null;

    for (let i = chat.length - 1; i >= 0; i--) {
        const message = chat[i];
        if (!message) continue;

        let swipeId = message.swipe_id || 0;
        if (message.swipes && message.swipes.length > 0 && typeof message.mes === 'string') {
            const foundIdx = message.swipes.findIndex(s => s === message.mes);
            if (foundIdx !== -1) swipeId = foundIdx;
        }

        if (message.swipe_info && message.swipe_info[swipeId] && message.swipe_info[swipeId].extra && message.swipe_info[swipeId].extra.rpgTrackerData) {
            const extraData = message.swipe_info[swipeId].extra.rpgTrackerData;
            if (extraData && typeof extraData === 'object' && extraData.characters !== undefined) {
                return sanitizeTrackerData(extraData);
            }
        }
    }
    return null;
}

/**
 * Deep asynchronous restoration with swipe_info delta patch replaying
 */
export async function rehydrateFromHistoryAsync(chat) {
    if (!Array.isArray(chat) || chat.length === 0) return null;

    const lastMsg = chat[chat.length - 1];
    if (lastMsg) {
        let lastSwipeId = lastMsg.swipe_id || 0;
        if (lastMsg.swipes && lastMsg.swipes.length > 0 && typeof lastMsg.mes === 'string') {
            const foundIdx = lastMsg.swipes.findIndex(s => s === lastMsg.mes);
            if (foundIdx !== -1) lastSwipeId = foundIdx;
        }
        if (lastMsg.swipe_info?.[lastSwipeId]?.extra?.rpgTrackerData) {
            return sanitizeTrackerData(lastMsg.swipe_info[lastSwipeId].extra.rpgTrackerData);
        }
    }

    let baseIndex = -1;
    let accumulatedData = null;

    for (let i = chat.length - 1; i >= 0; i--) {
        const message = chat[i];
        if (!message) continue;

        let swipeId = message.swipe_id || 0;
        if (message.swipes && message.swipes.length > 0 && typeof message.mes === 'string') {
            const foundIdx = message.swipes.findIndex(s => s === message.mes);
            if (foundIdx !== -1) swipeId = foundIdx;
        }

        if (message.swipe_info?.[swipeId]?.extra?.rpgTrackerData) {
            accumulatedData = JSON.parse(JSON.stringify(message.swipe_info[swipeId].extra.rpgTrackerData));
            baseIndex = i;
            break;
        }
    }

    if (!accumulatedData) {
        accumulatedData = getInitialTrackerData();
        baseIndex = -1;
    }

    let anyUpdateApplied = baseIndex !== -1;

    for (let i = baseIndex + 1; i < chat.length; i++) {
        if (i % 15 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        const message = chat[i];
        if (!message) continue;

        let swipeId = message.swipe_id || 0;
        if (message.swipes && message.swipes.length > 0 && typeof message.mes === 'string') {
            const foundIdx = message.swipes.findIndex(s => s === message.mes);
            if (foundIdx !== -1) swipeId = foundIdx;
        }

        const deltaPatch = message.swipe_info?.[swipeId]?.extra?.rpgTrackerDelta || message.extra?.rpgTrackerDelta;

        if (deltaPatch && typeof deltaPatch === 'object' && Object.keys(deltaPatch).length > 0) {
            accumulatedData = applyLLMPatch(accumulatedData, deltaPatch, false, 'patch', true);
            anyUpdateApplied = true;
        } else if (typeof message.mes === 'string') {
            const extractJsonFromComment = (text) => {
                const trackerRegex = /<!--RPG_TRACKER:?([\s\S]*?)-->/g;
                let match;
                while ((match = trackerRegex.exec(text)) !== null) {
                    let innerText = match[1].trim();
                    const markdownJsonRegex = /```(?:json|markdown)?\s*\n?(\{[\s\S]*?\})\s*\n?```/i;
                    const mdMatch = innerText.match(markdownJsonRegex);
                    if (mdMatch) innerText = mdMatch[1].trim();
                    try {
                        const parsed = JSON.parse(innerText);
                        if (parsed && typeof parsed === 'object') return parsed;
                    } catch (e) { }
                }

                const legacyRegex = /<!--RPG_DATA:([\s\S]*?)-->/g;
                let legacyMatch;
                while ((legacyMatch = legacyRegex.exec(text)) !== null) {
                    try {
                        const parsed = JSON.parse(legacyMatch[1]);
                        if (parsed && typeof parsed === 'object') return parsed;
                    } catch (e) { }
                }
                return null;
            };

            const parsed = extractJsonFromComment(message.mes);
            if (parsed) {
                if (parsed.characters !== undefined) {
                    accumulatedData = JSON.parse(JSON.stringify(parsed));
                } else {
                    accumulatedData = applyLLMPatch(accumulatedData, parsed, false, 'patch', true);
                }
                anyUpdateApplied = true;
            }
        }
    }

    return anyUpdateApplied
        ? JSON.parse(JSON.stringify(sanitizeTrackerData(accumulatedData)))
        : null;
}

/**
 * Reconstruct turn state by combining N-1 clean data with current N AI delta patch
 */
export async function reconstructTurnState(chat, defaultData) {
    if (!Array.isArray(chat) || chat.length === 0) return null;

    const lastIndex = chat.length - 1;
    const lastMsg = chat[lastIndex];

    const previousChatHistory = chat.slice(0, lastIndex);
    const previousState = await rehydrateFromHistoryAsync(previousChatHistory) || defaultData;

    let swipeId = lastMsg.swipe_id || 0;
    if (lastMsg.swipes && lastMsg.swipes.length > 0 && typeof lastMsg.mes === 'string') {
        const foundIdx = lastMsg.swipes.findIndex(s => s === lastMsg.mes);
        if (foundIdx !== -1) swipeId = foundIdx;
    }

    const currentDelta = (lastMsg.swipe_info && lastMsg.swipe_info[swipeId]?.extra?.rpgTrackerDelta)
        || lastMsg.extra?.rpgTrackerDelta
        || null;

    if (currentDelta && Object.keys(currentDelta).length > 0) {
        return applyLLMPatch(previousState, currentDelta, false, 'patch', false);
    }

    return previousState;
}