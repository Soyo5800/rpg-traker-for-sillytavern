// src/core/ExtensionBridge.js
import { getContext, extension_settings, writeExtensionField } from "../../../../../extensions.js";
import { saveSettingsDebounced, saveChat, saveChatConditional, updateMessageBlock, getRequestHeaders, generateQuietPrompt, getThumbnailUrl, user_avatar } from "../../../../../../script.js";
import { SlashCommandParser } from "../../../../../slash-commands/SlashCommandParser.js";
import { backupToMessage, rehydrateFromHistory, rehydrateFromHistoryAsync, applyLLMPatch, extractNormalizedPatch } from "./JSONTracker.js";
import { parseResponse } from "./ResponseParser.js";
import { buildDefinitionPromptWrapper, buildStatusPromptWrapper } from "./ActivePrompt.js";
import { DEFAULT_PROMPT_HEADER_SEP, DEFAULT_PROMPT_FOOTER_SEP } from "./PromptSchema.js";
import { setDeltaLog } from "../tracker/DeltaLogRenderer.js";

window.SillyTavern = {
    getContext: () => {
        try {
            const ctx = getContext();
            return {
                ...ctx,
                user_avatar: user_avatar
            };
        } catch (e) {
            return { user_avatar: user_avatar };
        }
    }
};

function resolveSillyTavernAvatarUrl(avatarFile, type = 'Card') {
    if (!avatarFile || typeof avatarFile !== 'string') return '/img/user.png';
    if (avatarFile.startsWith('http://') || avatarFile.startsWith('https://') || avatarFile.startsWith('data:')) {
        return avatarFile;
    }

    if (type === 'Card' && typeof window.getAvatarPath === 'function') {
        const resolved = window.getAvatarPath(avatarFile);
        if (resolved && (resolved.startsWith('http') || resolved.startsWith('/') || resolved.startsWith('.'))) {
            return resolved;
        }
    }

    let filename = String(avatarFile);
    if (filename.includes('/')) {
        filename = filename.split('/').pop();
    }

    if (type === 'Persona') {
        try { filename = decodeURIComponent(filename); } catch (e) {}
        const lower = filename.toLowerCase();
        if (lower === 'default.png' || lower === 'ghost.png' || lower === 'user.png' || lower === 'system.png' || lower === 'default-user' || lower === 'default') {
            return '/img/user.png';
        }

        try {
            if (typeof getThumbnailUrl === 'function') {
                const url = getThumbnailUrl('persona', filename) || getThumbnailUrl('avatar', filename);
                if (url) return url;
            }
        } catch (e) {
            console.warn("[RPG Tracker] Native getThumbnailUrl call failed, falling back to static path resolution.", e);
        }

        if (!/\.[a-zA-Z0-9]{2,5}$/.test(filename)) {
            filename += '.png';
        }
        return `/api/images/avatars/${encodeURIComponent(filename)}`;
    }

    const encoded = encodeURIComponent(filename);
    return `/characters/${encoded}`;
}

export function safeUpdateMessageBlock(index, messageObject) {
    if (typeof updateMessageBlock !== 'function') return;
    try {
        updateMessageBlock(index, messageObject);
    } catch (e) {
        setTimeout(() => {
            try {
                updateMessageBlock(index, messageObject);
            } catch (err) {
                console.warn("[RPG Tracker] Delayed updateMessageBlock failed:", err);
            }
        }, 100);
    }
}

export function establishBridgeConnection(extensionName) {
    const connectionInterval = setInterval(() => {
        if (window.RPGBridge && typeof window.RPGBridge.syncSettings === 'function') {
            clearInterval(connectionInterval);

            // React 비동기 렌더링 루프 실행 전 최신 세팅 정보를 동기식으로 캐싱 보관하기 위한 전역 프로퍼티 선언
            window.RPGBridge.latestSettings = extension_settings[extensionName] || null;

            // Expose native writeExtensionField API to window.RPGBridge
            window.RPGBridge.writeExtensionFieldNatively = async (characterId, key, value) => {
                if (typeof writeExtensionField === 'function') {
                    try {
                        await writeExtensionField(characterId, key, value);
                        return true;
                    } catch (err) {
                        console.error("[RPG Tracker] writeExtensionField failed:", err);
                        return false;
                    }
                }
                console.warn("[RPG Tracker] writeExtensionField is not available on SillyTavern's extensions.js");
                return false;
            };

            // React 비동기 렌더사이클 지연을 방지하기 위해 실리터번 메모리 내부의 세팅 값을 직접 반환하는 동기화용 API
            window.RPGBridge.getSTSettingsCharacterSyncs = (chatId) => {
                if (!chatId) return null;
                const targetSrc = window.RPGBridge.latestSettings || extension_settings[extensionName];
                return targetSrc?.characterSyncs?.[chatId] || null;
            };

            const nativeSyncSettings = window.RPGBridge.syncSettings;
            window.RPGBridge.syncSettings = (stSettings) => {
                if (stSettings) {
                    window.RPGBridge.latestSettings = {
                        ...(window.RPGBridge.latestSettings || {}),
                        ...stSettings
                    };
                    nativeSyncSettings(stSettings);
                }
            };

            window.RPGBridge.getThumbnailUrl = (type, filename) => {
                try {
                    if (typeof getThumbnailUrl === 'function') {
                        let url = getThumbnailUrl(type, filename);
                        if (!url) {
                            const fallbackType = type === 'persona' ? 'avatar' : 'persona';
                            url = getThumbnailUrl(fallbackType, filename);
                        }
                        return url;
                    }
                } catch (e) {
                    console.warn("[RPG Tracker] Failed to retrieve native thumbnail URL:", e);
                }
                return null;
            };

            window.RPGBridge.saveSettings = (updatedSettings) => {
                extension_settings[extensionName] = extension_settings[extensionName] || {};
                Object.assign(extension_settings[extensionName], updatedSettings);
                window.RPGBridge.latestSettings = extension_settings[extensionName];
                saveSettingsDebounced();
            };

            window.RPGBridge.saveChatData = (updatedTracker, maxBackupCount) => {
                const context = getContext();
                const currentChat = context.chat;
                const lastIndex = currentChat ? currentChat.length - 1 : -1;

                const safeSaveChat = () => {
                    if (typeof saveChatConditional === 'function') saveChatConditional();
                    else if (!context.groupId && typeof saveChat === 'function') saveChat();
                };

                if (currentChat && lastIndex >= 0) {
                    backupToMessage(currentChat, lastIndex, updatedTracker, safeUpdateMessageBlock, safeSaveChat, maxBackupCount);
                }
            };

            window.RPGBridge.rehydrateFromHistory = () => rehydrateFromHistory(getContext().chat);
            window.RPGBridge.rehydrateFromHistoryAsync = async () => await rehydrateFromHistoryAsync(getContext().chat);

            window.RPGBridge.connectChat = (currentTrackerData) => {
                const context = getContext();
                if (context && context.chatId) {
                    if (typeof window.RPGBridge.saveChatData === 'function') {
                        window.RPGBridge.saveChatData(currentTrackerData, 20);
                    }
                    if (typeof saveChatConditional === 'function') saveChatConditional();
                    else if (!context.groupId && typeof saveChat === 'function') saveChat();

                    if (typeof window.RPGBridge.setChatConnectionStatus === 'function') {
                        window.RPGBridge.setChatConnectionStatus(true);
                    }
                }
            };

            window.RPGBridge.disconnectChat = () => {
                const context = getContext();
                if (context && context.chatId) {
                    const currentChat = context.chat;
                    if (currentChat && currentChat.length > 0) {
                        for (let i = 0; i < currentChat.length; i++) {
                            const msg = currentChat[i];
                            if (msg && msg.mes && (msg.mes.includes('<!--RPG_TRACKER:') || msg.mes.includes('<!--RPG_DATA:') || msg.mes.includes('<!--RPG_DELTA:'))) {
                                msg.mes = msg.mes.replace(/<!--RPG_TRACKER:([\s\S]*?)-->/g, '').trim();
                                msg.mes = msg.mes.replace(/<!--RPG_DATA:([\s\S]*?)-->/g, '').trim();
                                msg.mes = msg.mes.replace(/<!--RPG_DELTA:([\s\S]*?)-->/g, '').trim();
                                safeUpdateMessageBlock(i, msg);
                            }
                        }
                        if (typeof saveChatConditional === 'function') saveChatConditional();
                        else if (!context.groupId && typeof saveChat === 'function') saveChat();
                    }

                    $('#rpg-snapshot-styles').remove();
                    $('#rpg-delta-log-styles').remove();
                    $('.rpg-delta-log-container').remove();
                    $('.rpg-snapshot-container').remove();

                    if (typeof window.RPGBridge.setChatConnectionStatus === 'function') {
                        window.RPGBridge.setChatConnectionStatus(false);
                    }
                }
            };
            
            window.RPGBridge.updateMessageBlock = (index, messageObject) => {
                safeUpdateMessageBlock(index, messageObject);
            };

            window.RPGBridge.saveChat = () => {
                if (typeof saveChatConditional === 'function') {
                    saveChatConditional();
                } else if (!getContext().groupId && typeof saveChat === 'function') {
                    saveChat();
                }
            };

            window.RPGBridge.triggerCharacterGeneration = async (promptText, isPlayer = false) => {
                const trackerData = window.RPGBridge?.currentTrackerData;
                if (!trackerData) return;

                const header = trackerData.systemPromptHeader_separated !== undefined ? trackerData.systemPromptHeader_separated : DEFAULT_PROMPT_HEADER_SEP;
                const footer = trackerData.systemPromptFooter_separated !== undefined ? trackerData.systemPromptFooter_separated : DEFAULT_PROMPT_FOOTER_SEP;

                const defPrompt = buildDefinitionPromptWrapper(trackerData, header, footer, isPlayer);
                const combinedPrompt = `${defPrompt}\n\n[USER INSTRUCTION]\n${promptText}\n\n${footer}\n\nOutput the generated character's status JSON block only.`;

                try {
                    const rawOutput = await generateQuietPrompt(combinedPrompt);
                    const { patch } = parseResponse(rawOutput);

                    if (patch && Object.keys(patch).length > 0) {
                        const normPatch = extractNormalizedPatch(patch);
                        const updatedData = applyLLMPatch(trackerData, normPatch, isPlayer);
                        if (typeof window.RPGBridge.syncChatData === 'function') window.RPGBridge.syncChatData(updatedData);

                        try {
                            const sysText = `[RPG Tracker] System has added a new character. <!--RPG_DELTA:${JSON.stringify(normPatch)}-->`;
                            await SlashCommandParser.commands['sys'].callback({}, sysText);

                            const newContext = getContext();
                            if (newContext && newContext.chat) {
                                let lastSysMsgIdx = -1;
                                for (let i = newContext.chat.length - 1; i >= 0; i--) {
                                    if (newContext.chat[i] && typeof newContext.chat[i].mes === 'string' && newContext.chat[i].mes.includes('[RPG Tracker] System has added a new character')) {
                                        lastSysMsgIdx = i;
                                        break;
                                    }
                                }

                                if (lastSysMsgIdx !== -1) {
                                    const lastSysMsg = newContext.chat[lastSysMsgIdx];
                                    setDeltaLog(lastSysMsg, normPatch);
                                    safeUpdateMessageBlock(lastSysMsgIdx, lastSysMsg);
                                }
                            }
                            if (typeof saveChatConditional === "function") saveChatConditional();
                            else if (typeof saveChat === "function") saveChat();

                            if (typeof window.RPGBridge.saveChatData === 'function') window.RPGBridge.saveChatData(updatedData, 20);
                        } catch (err) {
                            if (typeof window.RPGBridge.saveChatData === 'function') window.RPGBridge.saveChatData(updatedData, 20);
                        }
                    } else {
                        try {
                            await SlashCommandParser.commands['sys'].callback({}, "[RPG Tracker] Generation failed (No valid JSON found).");
                        } catch (err) { }
                    }
                } catch (e) {
                    console.error("[RPG Tracker] Character generation error:", e);
                }
            };

            window.RPGBridge.triggerManualUpdate = async () => {
                const trackerData = window.RPGBridge?.currentTrackerData;
                if (!trackerData || !Array.isArray(trackerData.characters)) return;

                const header = trackerData.systemPromptHeader_separated !== undefined ? trackerData.systemPromptHeader_separated : DEFAULT_PROMPT_HEADER_SEP;
                const footer = trackerData.systemPromptFooter_separated !== undefined ? trackerData.systemPromptFooter_separated : DEFAULT_PROMPT_FOOTER_SEP;

                const defPrompt = buildDefinitionPromptWrapper(trackerData, header, footer);
                const statusPrompt = buildStatusPromptWrapper(trackerData);
                const combinedPrompt = `${defPrompt}\n\n${statusPrompt}\n\nAnalyze the current situation and output the updated status JSON block only.`;

                try {
                    const rawOutput = await generateQuietPrompt(combinedPrompt);
                    const { patch } = parseResponse(rawOutput);

                    if (patch && Object.keys(patch).length > 0) {
                        const normPatch = extractNormalizedPatch(patch);
                        const updatedData = applyLLMPatch(trackerData, normPatch);
                        if (typeof window.RPGBridge.syncChatData === 'function') window.RPGBridge.syncChatData(updatedData);

                        try {
                            const sysText = `[RPG Tracker] Status has been manually updated. <!--RPG_DELTA:${JSON.stringify(normPatch)}-->`;
                            await SlashCommandParser.commands['sys'].callback({}, sysText);

                            const newContext = getContext();
                            if (newContext && newContext.chat) {
                                let lastSysMsgIdx = -1;
                                for (let i = newContext.chat.length - 1; i >= 0; i--) {
                                    if (newContext.chat[i] && typeof newContext.chat[i].mes === 'string' && newContext.chat[i].mes.includes('[RPG Tracker] Status has been manually updated')) {
                                        lastSysMsgIdx = i;
                                        break;
                                    }
                                }

                                if (lastSysMsgIdx !== -1) {
                                    const lastSysMsg = newContext.chat[lastSysMsgIdx];
                                    setDeltaLog(lastSysMsg, normPatch);
                                    safeUpdateMessageBlock(lastSysMsgIdx, lastSysMsg);
                                }
                            }
                            if (typeof saveChatConditional === "function") saveChatConditional();
                            else if (typeof saveChat === "function") saveChat();

                            if (typeof window.RPGBridge.saveChatData === 'function') window.RPGBridge.saveChatData(updatedData, 20);
                        } catch (err) {
                            if (typeof window.RPGBridge.saveChatData === 'function') window.RPGBridge.saveChatData(updatedData, 20);
                        }
                    } else {
                        try {
                            await SlashCommandParser.commands['sys'].callback({}, "[RPG Tracker] No valid updates found.");
                        } catch (err) { }
                    }
                } catch (e) {
                    console.error("[RPG Tracker] Manual update error:", e);
                    throw e;
                }
            };

            window.RPGBridge.getUserPersonaName = () => {
                try { return getContext()?.name1 || 'Player'; } catch (e) { return 'Player'; }
            };

            window.RPGBridge.getRequestHeaders = () => {
                if (typeof getRequestHeaders === 'function') return getRequestHeaders();
                return {};
            };

            window.RPGBridge.syncSettings(extension_settings[extensionName]);

            const syncFromHistoryOrMeta = async () => {
                const context = getContext();
                if (!context || !context.chatId) {
                    if (typeof window.RPGBridge.resetToDefault === 'function') window.RPGBridge.resetToDefault();
                    if (typeof window.RPGBridge.setChatConnectionStatus === 'function') window.RPGBridge.setChatConnectionStatus(false);
                    return;
                }

                let trackerData = null;
                if (Array.isArray(context.chat)) {
                    trackerData = await window.RPGBridge.rehydrateFromHistoryAsync();
                }

                if (trackerData && typeof window.RPGBridge.syncChatData === 'function') {
                    if (Array.isArray(trackerData.characters)) {
                        trackerData.characters.forEach((c, index) => {
                            // 가변 ID 대신 정적 슬롯 인덱스로 대조하여 매핑 소실 방지
                            const chatSyncs = window.RPGBridge.latestSettings?.characterSyncs?.[context.chatId] || extension_settings[extensionName]?.characterSyncs?.[context.chatId] || {};
                            const savedSync = chatSyncs[index];
                            if (savedSync) {
                                c.syncedCardAvatar = savedSync.syncedCardAvatar;
                                c.syncedCardType = savedSync.syncedCardType;
                                c.name = savedSync.name;
                                c.avatarUrl = savedSync.avatarUrl;
                            }

                            if (c.syncedCardType === 'Persona') {
                                const liveName = context.name1 || window.name1;
                                if (liveName && c.name !== liveName) {
                                    c.name = liveName;
                                }
                                const userAvatarFile = user_avatar || context.user_avatar || window.user_avatar || 'default.png';
                                const globalCrop = extension_settings[extensionName]?.croppedAvatars?.[c.id];
                                const targetAvatarUrl = globalCrop || resolveSillyTavernAvatarUrl(userAvatarFile, 'Persona');
                                if (c.syncedCardAvatar !== userAvatarFile || c.avatarUrl !== targetAvatarUrl) {
                                    c.syncedCardAvatar = userAvatarFile;
                                    c.avatarUrl = targetAvatarUrl;
                                }
                            } else if (c.syncedCardType === 'Card' && c.syncedCardAvatar) {
                                const allChars = Array.isArray(context.characters) ? context.characters : (Array.isArray(window.characters) ? window.characters : []);
                                const matched = allChars.find(stChar => stChar.avatar === c.syncedCardAvatar);
                                if (matched) {
                                    if (c.name !== matched.name) {
                                        c.name = matched.name;
                                    }
                                    const globalCrop = extension_settings[extensionName]?.croppedAvatars?.[c.id];
                                    const targetAvatarUrl = globalCrop || resolveSillyTavernAvatarUrl(matched.avatar, 'Card');
                                    if (c.avatarUrl !== targetAvatarUrl) {
                                        c.avatarUrl = targetAvatarUrl;
                                    }
                                }
                            }
                        });
                    }

                    window.RPGBridge.syncChatData(trackerData);
                    if (typeof window.RPGBridge.setChatConnectionStatus === 'function') {
                        window.RPGBridge.setChatConnectionStatus(true);
                    }
                } else if (typeof window.RPGBridge.resetToDefault === 'function') {
                    window.RPGBridge.resetToDefault();
                    if (typeof window.RPGBridge.setChatConnectionStatus === 'function') {
                        window.RPGBridge.setChatConnectionStatus(true);
                    }
                }
            };

            window.RPGBridge.syncFromHistoryOrMeta = syncFromHistoryOrMeta;
            syncFromHistoryOrMeta();
        }
    }, 100);

    setTimeout(() => clearInterval(connectionInterval), 10000);
}