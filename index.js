import { getContext, extension_settings } from "../../../extensions.js";
import { eventSource, event_types, saveSettingsDebounced, generateQuietPrompt, saveChat, saveChatConditional, updateMessageBlock, setExtensionPrompt, extension_prompt_types, extension_prompt_roles, getRequestHeaders } from "../../../../script.js";
import { backupToMessage, rehydrateFromHistory, rehydrateFromHistoryAsync, defensiveMerge, applyLLMPatch, sanitizeTrackerData } from "./src/core/JSONTracker.js";
import { buildDefinitionPromptWrapper, buildStatusPromptWrapper } from "./src/core/ActivePrompt.js";
import { DEFAULT_PROMPT_HEADER_MERGED, DEFAULT_PROMPT_FOOTER_MERGED, DEFAULT_PROMPT_HEADER_SEP, DEFAULT_PROMPT_FOOTER_SEP } from "./src/core/PromptSchema.js";
import { parseResponse } from "./src/core/ResponseParser.js";
import { injectAllDeltaLogs, setDeltaLog } from "./src/tracker/DeltaLogRenderer.js";
import { SlashCommandParser } from "../../../slash-commands/SlashCommandParser.js";

const extensionPath = import.meta.url.substring(0, import.meta.url.lastIndexOf('/'));
const extensionName = extensionPath.substring(extensionPath.lastIndexOf('/') + 1);
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    enabled: true,
    theme: "default",
    updateMode: "merged",
    showDeltaLog: true,
    presets: []
};

const localStorageBackupKey = "rpg_tracker_settings_backup";

/**
 * 로컬스토리지 백업 유틸리티
 */
function backupSettingsToLocalStorage() {
    if (extension_settings[extensionName]) {
        localStorage.setItem(localStorageBackupKey, JSON.stringify(extension_settings[extensionName]));
    }
}

function restoreSettingsFromLocalStorage() {
    try {
        const backup = localStorage.getItem(localStorageBackupKey);
        if (backup) {
            return JSON.parse(backup);
        }
    } catch (e) {
        console.warn("[RPG Tracker] Failed to restore settings from localStorage:", e);
    }
    return null;
}

/**
 * 실리터번 내장 Regex 익스텐션 정규식 필터 동기화 및 등록
 */
function syncRpgTrackerRegex(enabled) {
    extension_settings.regex = extension_settings.regex || [];

    if (!enabled) {
        extension_settings.regex = extension_settings.regex.filter(s => {
            return !(s.id && s.id.startsWith('rpg_tracker'));
        });
        saveSettingsDebounced();
        return;
    }

    const officialIds = ['rpg_tracker_json_stripper', 'rpg_tracker_delta_stripper', 'rpg_tracker_comment_stripper'];
    extension_settings.regex = extension_settings.regex.filter(s => {
        if (s.id && s.id.startsWith('rpg_tracker')) {
            return officialIds.includes(s.id);
        }
        return true;
    });

    let script = extension_settings.regex.find(s => s.id === 'rpg_tracker_json_stripper');
    if (!script) {
        script = {
            id: 'rpg_tracker_json_stripper',
            scriptName: 'RPG Tracker JSON Stripper',
            findRegex: '```(?:json|markdown)?\\s*\\n?\\{[\\s\\S]*?(?:\"status\"|\"statusSchema\"|\"stats\"|\"profile\"|\"inventory\"|\"quests\"|\"Character Name\")[\\s\\S]*?\\}\\s*\\n?```\\s*',
            replaceString: '',
            trimStrings: [],
            placement: [1, 2], // 1: USER_INPUT, 2: AI_OUTPUT
            disabled: !enabled,
            promptOnly: true,
            markdownOnly: false,
            runOnEdit: true
        };
        extension_settings.regex.push(script);
    } else {
        script.disabled = !enabled;
        delete script.minDepth;
        delete script.maxDepth;
    }

    let deltaScript = extension_settings.regex.find(s => s.id === 'rpg_tracker_delta_stripper');
    if (!deltaScript) {
        deltaScript = {
            id: 'rpg_tracker_delta_stripper',
            scriptName: 'RPG Tracker Delta Stripper',
            findRegex: '<!--RPG_DELTA:[\\s\\S]*?-->\\s*',
            replaceString: '',
            trimStrings: [],
            placement: [1, 2],
            disabled: !enabled,
            promptOnly: true,
            markdownOnly: false,
            runOnEdit: true
        };
        extension_settings.regex.push(deltaScript);
    } else {
        deltaScript.disabled = !enabled;
        delete deltaScript.minDepth;
        delete deltaScript.maxDepth;
    }

    let commentScript = extension_settings.regex.find(s => s.id === 'rpg_tracker_comment_stripper');
    if (!commentScript) {
        commentScript = {
            id: 'rpg_tracker_comment_stripper',
            scriptName: 'RPG Tracker Comment Stripper',
            findRegex: '<!--RPG_TRACKER\\s*```(?:json|markdown)?\\s*\\n?\\{[\\s\\S]*?(?:\"status\"|\"statusSchema\"|\"stats\"|\"profile\"|\"inventory\"|\"quests\"|\"Character Name\")[\\s\\S]*?\\}\\s*\\n?```\\s*-->\\s*',
            replaceString: '',
            trimStrings: [],
            placement: [1, 2],
            disabled: !enabled,
            promptOnly: true,
            markdownOnly: false,
            runOnEdit: true
        };
        extension_settings.regex.push(commentScript);
    } else {
        commentScript.disabled = !enabled;
        delete commentScript.minDepth;
        delete commentScript.maxDepth;
    }

    saveSettingsDebounced();
}

/**
 * 안전한 updateMessageBlock 래핑 (메시지 렌더링 도중 호출 시 충돌 방지)
 */
function safeUpdateMessageBlock(index, messageObject) {
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

async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};

    if (Object.keys(extension_settings[extensionName]).length === 0) {
        const restored = restoreSettingsFromLocalStorage();
        if (restored) {
            Object.assign(extension_settings[extensionName], restored);
        } else {
            Object.assign(extension_settings[extensionName], defaultSettings);
        }
    }

    const enabled = extension_settings[extensionName].enabled;
    $("#rpg_tracker_enabled")
        .prop("checked", enabled)
        .trigger("input");

    syncRpgTrackerRegex(enabled);
}

function onEnabledInput(event) {
    const isChecked = Boolean($(event.target).prop("checked"));
    extension_settings[extensionName] = extension_settings[extensionName] || {};

    extension_settings[extensionName].enabled = isChecked;

    if (!isChecked) {
        backupSettingsToLocalStorage();
    }

    saveSettingsDebounced();

    if (window.RPGBridge && typeof window.RPGBridge.syncSettings === 'function') {
        window.RPGBridge.syncSettings(extension_settings[extensionName]);
    }

    syncRpgTrackerRegex(isChecked);
}

function establishBridgeConnection() {
    const connectionInterval = setInterval(() => {
        if (window.RPGBridge && typeof window.RPGBridge.syncSettings === 'function') {
            clearInterval(connectionInterval);

            window.RPGBridge.triggerGenerationWarning = () => {
                if (typeof toastr !== 'undefined' && typeof toastr.warning === 'function') {
                    toastr.warning("Cannot edit RPG Tracker during response generation.", "RPG Tracker");
                }
            };

            window.RPGBridge.saveSettings = (updatedSettings) => {
                extension_settings[extensionName] = extension_settings[extensionName] || {};
                Object.assign(extension_settings[extensionName], updatedSettings);
                saveSettingsDebounced();
            };

            window.RPGBridge.saveChatData = (updatedTracker, maxBackupCount) => {
                const context = getContext();
                const currentChat = context.chat;
                const lastIndex = currentChat ? currentChat.length - 1 : -1;

                const safeSaveChat = () => {
                    if (typeof saveChatConditional === 'function') {
                        saveChatConditional();
                    } else if (!context.groupId && typeof saveChat === 'function') {
                        saveChat();
                    }
                };

                if (currentChat && lastIndex >= 0) {
                    backupToMessage(currentChat, lastIndex, updatedTracker, safeUpdateMessageBlock, safeSaveChat, maxBackupCount);
                }
                console.log("[RPG Tracker] Chat data saved to native DB:", updatedTracker);
            };

            // 동기식 빠른 탐색용 브릿지 함수
            window.RPGBridge.rehydrateFromHistory = () => {
                const context = getContext();
                return rehydrateFromHistory(context.chat);
            };

            // 비동기식 백그라운드 깊은 탐색용 브릿지 함수 (렉 방지)
            window.RPGBridge.rehydrateFromHistoryAsync = async () => {
                const context = getContext();
                return await rehydrateFromHistoryAsync(context.chat);
            };

            window.RPGBridge.connectChat = (currentTrackerData) => {
                const context = getContext();
                if (context && context.chatId) {
                    if (typeof window.RPGBridge.saveChatData === 'function') {
                        window.RPGBridge.saveChatData(currentTrackerData, 20);
                    }

                    if (typeof saveChatConditional === 'function') {
                        saveChatConditional();
                    } else if (!context.groupId && typeof saveChat === 'function') {
                        saveChat();
                    }

                    if (typeof window.RPGBridge.setChatConnectionStatus === 'function') {
                        window.RPGBridge.setChatConnectionStatus(true);
                    }
                    console.log("[RPG Tracker] Chat successfully connected and initialized.");
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
                                if (typeof updateMessageBlock === 'function') {
                                    safeUpdateMessageBlock(i, msg);
                                }
                            }
                        }
                        if (typeof saveChatConditional === 'function') saveChatConditional();
                        else if (!context.groupId && typeof saveChat === 'function') saveChat();
                    }

                    if (typeof window.RPGBridge.setChatConnectionStatus === 'function') {
                        window.RPGBridge.setChatConnectionStatus(false);
                    }
                    console.log("[RPG Tracker] Chat disconnected and backups cleared.");
                }
            };

            window.RPGBridge.triggerCharacterGeneration = async (promptText, isPlayer = false) => {
                const trackerData = window.RPGBridge?.currentTrackerData;
                if (!trackerData) {
                    console.warn("[RPG Tracker] Cannot generate character: Chat is not connected or trackerData is missing.");
                    return;
                }

                console.log("[RPG Tracker] Character generation triggered...");

                const header = trackerData.systemPromptHeader_separated !== undefined
                    ? trackerData.systemPromptHeader_separated
                    : DEFAULT_PROMPT_HEADER_SEP;
                const footer = trackerData.systemPromptFooter_separated !== undefined
                    ? trackerData.systemPromptFooter_separated
                    : DEFAULT_PROMPT_FOOTER_SEP;

                const defPrompt = buildDefinitionPromptWrapper(trackerData, header, footer, isPlayer);
                const combinedPrompt = `${defPrompt}\n\n[USER INSTRUCTION]\n${promptText}\n\n${footer}\n\nOutput the generated character's status JSON block only.`;

                try {
                    const rawOutput = await generateQuietPrompt(combinedPrompt);
                    const { patch } = parseResponse(rawOutput);

                    if (patch && Object.keys(patch).length > 0) {
                        const updatedData = applyLLMPatch(trackerData, patch, isPlayer);

                        if (typeof window.RPGBridge.syncChatData === 'function') {
                            window.RPGBridge.syncChatData(updatedData);
                        }

                        console.log("[RPG Tracker] Character generated successfully.");

                        try {
                            const sysText = `[RPG Tracker] System has added a new character. <!--RPG_DELTA:${JSON.stringify(patch)}-->`;
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
                                    setDeltaLog(lastSysMsg, patch);
                                    safeUpdateMessageBlock(lastSysMsgIdx, lastSysMsg);
                                }
                            }
                            if (typeof saveChatConditional === "function") {
                                saveChatConditional();
                            } else if (typeof saveChat === "function") {
                                saveChat();
                            }

                            if (typeof window.RPGBridge.saveChatData === 'function') {
                                window.RPGBridge.saveChatData(updatedData, 20);
                            }
                        } catch (err) {
                            console.warn("[RPG Tracker] Failed to trigger /sys command or save chat data.", err);
                            if (typeof window.RPGBridge.saveChatData === 'function') {
                                window.RPGBridge.saveChatData(updatedData, 20);
                            }
                        }
                    } else {
                        console.log("[RPG Tracker] No valid patch found in character generation.");
                        try {
                            await SlashCommandParser.commands['sys'].callback({}, "[RPG Tracker] Generation failed (No valid JSON found).");
                        } catch (err) {
                            console.warn("[RPG Tracker] Failed to trigger /sys command.", err);
                        }
                    }
                } catch (e) {
                    console.error("[RPG Tracker] Character generation error:", e);
                }
            };

            window.RPGBridge.triggerManualUpdate = async () => {
                const trackerData = window.RPGBridge?.currentTrackerData;
                if (!trackerData || !Array.isArray(trackerData.characters)) {
                    console.warn("[RPG Tracker] Cannot trigger manual update: Chat is not connected or trackerData is invalid.");
                    return;
                }

                console.log("[RPG Tracker] Manual background update triggered...");

                const header = trackerData.systemPromptHeader_separated !== undefined
                    ? trackerData.systemPromptHeader_separated
                    : DEFAULT_PROMPT_HEADER_SEP;
                const footer = trackerData.systemPromptFooter_separated !== undefined
                    ? trackerData.systemPromptFooter_separated
                    : DEFAULT_PROMPT_FOOTER_SEP;

                const defPrompt = buildDefinitionPromptWrapper(trackerData, header, footer);
                const statusPrompt = buildStatusPromptWrapper(trackerData);

                const combinedPrompt = `${defPrompt}\n\n${statusPrompt}\n\nAnalyze the current situation and output the updated status JSON block only.`;

                try {
                    const rawOutput = await generateQuietPrompt(combinedPrompt);
                    const { patch } = parseResponse(rawOutput);

                    if (patch && Object.keys(patch).length > 0) {
                        const updatedData = applyLLMPatch(trackerData, patch);

                        if (typeof window.RPGBridge.syncChatData === 'function') {
                            window.RPGBridge.syncChatData(updatedData);
                        }

                        console.log("[RPG Tracker] Manual update applied successfully.");

                        try {
                            const sysText = `[RPG Tracker] Status has been manually updated. <!--RPG_DELTA:${JSON.stringify(patch)}-->`;
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
                                    setDeltaLog(lastSysMsg, patch);
                                    safeUpdateMessageBlock(lastSysMsgIdx, lastSysMsg);
                                }
                            }
                            if (typeof saveChatConditional === "function") {
                                saveChatConditional();
                            } else if (typeof saveChat === "function") {
                                saveChat();
                            }

                            if (typeof window.RPGBridge.saveChatData === 'function') {
                                window.RPGBridge.saveChatData(updatedData, 20);
                            }
                        } catch (err) {
                            console.warn("[RPG Tracker] Failed to trigger /sys command or save chat data.", err);
                            if (typeof window.RPGBridge.saveChatData === 'function') {
                                window.RPGBridge.saveChatData(updatedData, 20);
                            }
                        }
                    } else {
                        console.log("[RPG Tracker] No valid patch found in manual update.");
                        try {
                            await SlashCommandParser.commands['sys'].callback({}, "[RPG Tracker] No valid updates found.");
                        } catch (err) {
                            console.warn("[RPG Tracker] Failed to trigger /sys command.", err);
                        }
                    }
                } catch (e) {
                    console.error("[RPG Tracker] Manual update error:", e);
                    throw e;
                }
            };

            window.RPGBridge.triggerFullRequestUpdate = async () => { console.log("[RPG Tracker] Full Overwrite Update is deprecated."); };
            window.RPGBridge.handleFullRequestUpdate = window.RPGBridge.triggerFullRequestUpdate;

            window.RPGBridge.getUserPersonaName = () => {
                try {
                    const context = getContext();
                    return context && context.name1 ? context.name1 : 'Player';
                } catch (e) {
                    return 'Player';
                }
            };

            window.RPGBridge.getRequestHeaders = () => {
                if (typeof getRequestHeaders === 'function') {
                    return getRequestHeaders();
                }
                return {};
            };

            window.RPGBridge.syncSettings(extension_settings[extensionName]);

            // 비동기로 작동하는 메타 및 히스토리 데이터 로드 함수
            const syncFromHistoryOrMeta = async () => {
                const context = getContext();

                if (!context || !context.chatId) {
                    if (typeof window.RPGBridge.resetToDefault === 'function') {
                        window.RPGBridge.resetToDefault();
                    }
                    if (typeof window.RPGBridge.setChatConnectionStatus === 'function') {
                        window.RPGBridge.setChatConnectionStatus(false);
                    }
                    return;
                }

                let trackerData = null;
                if (Array.isArray(context.chat)) {
                    // 비동기 처리기를 통해 렉 없이 히스토리 데이터 검사
                    trackerData = await window.RPGBridge.rehydrateFromHistoryAsync();
                }

                if (trackerData && typeof window.RPGBridge.syncChatData === 'function') {
                    window.RPGBridge.syncChatData(trackerData);
                    if (typeof window.RPGBridge.setChatConnectionStatus === 'function') {
                        window.RPGBridge.setChatConnectionStatus(true);
                    }
                    console.log("[RPG Tracker] Automatically rehydrated saved tracker data and connected.");
                } else if (typeof window.RPGBridge.resetToDefault === 'function') {
                    window.RPGBridge.resetToDefault();
                    if (typeof window.RPGBridge.setChatConnectionStatus === 'function') {
                        window.RPGBridge.setChatConnectionStatus(true);
                    }
                    console.log("[RPG Tracker] No existing data found. Automatically initialized with default tracker and connected.");
                }
            };

            window.RPGBridge.syncFromHistoryOrMeta = syncFromHistoryOrMeta;
            syncFromHistoryOrMeta();

            console.log("[RPG Tracker] ✅ Native-React Bridge is successfully synchronized.");
        }
    }, 100);

    setTimeout(() => clearInterval(connectionInterval), 10000);
}

async function initReactApp() {
    console.log("[RPG Tracker] Attempting to inject React App...");
    $('#my-rpg-react-root').remove();

    const reactRoot = `
    <div id="my-rpg-react-root" style="position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 9999; pointer-events: none;">
    </div>
  `;
    $('body').append(reactRoot);

    try {
        await import(`${extensionPath}/dist/bundle.js?v=${Date.now()}`);
        console.log("[RPG Tracker] ✅ RPG Tracker React app mounted successfully from bundle.js");
    } catch (err) {
        console.error("[RPG Tracker] ❌ Exception occurred while mounting React app:", err);
    }
}

jQuery(async () => {
    try {
        const extensionsettingsHtml = await $.get(`${extensionFolderPath}/extension-settings.html`);
        $("#extensions_settings2").append(extensionsettingsHtml);
        $("#rpg_tracker_enabled").on("input", onEnabledInput);
    } catch (err) {
        console.error("[RPG Tracker] ⚠️ Failed to load extension-settings.html automatically.", err);
    }

    await loadSettings();
    establishBridgeConnection();
    await initReactApp();

    eventSource.on(event_types.GENERATION_STARTED, (args) => {
        console.log(`[RPG Tracker] Step 1: GENERATION_STARTED event detected`);

        // AI가 대답을 빌드하기 전, 사용자가 고쳤으나 디바운스에 걸려 임시 대기 중이던 데이터를 먼저 강제 세이브 처리
        if (window.RPGBridge && typeof window.RPGBridge.flushSave === 'function') {
            window.RPGBridge.flushSave();
        }

        if (!extension_settings[extensionName].enabled) {
            console.log(`[RPG Tracker] Injection skipped due to extension being disabled`);
            return;
        }

        if (window.RPGBridge && typeof window.RPGBridge.setGenerationState === 'function') {
            window.RPGBridge.setGenerationState(true);
        }

        if (extension_settings[extensionName].updateMode === 'separated') {
            console.log(`[RPG Tracker] Injection skipped because updateMode is 'separated'`);
            if (typeof window.extension_prompt_types !== 'undefined' && typeof setExtensionPrompt === 'function') {
                setExtensionPrompt(`${extensionName}_def`, '', extension_prompt_types.IN_PROMPT, 0, false);
                setExtensionPrompt(`${extensionName}_status`, '', extension_prompt_types.IN_CHAT, 0, false);
                delete extension_settings.extension_prompts[`${extensionName}_def`];
                delete extension_settings.extension_prompts[`${extensionName}_status`];
            }
            return;
        }

        const context = getContext();
        if (context && context.chatId) {
            const trackerData = window.RPGBridge?.currentTrackerData || rehydrateFromHistory(context.chat);

            if (trackerData && Array.isArray(trackerData.characters)) {
                console.log(`[RPG Tracker] Step 2: trackerData loaded successfully (Character count: ${trackerData.characters.length})`);

                const header = trackerData.systemPromptHeader_merged !== undefined
                    ? trackerData.systemPromptHeader_merged
                    : DEFAULT_PROMPT_HEADER_MERGED;
                const footer = trackerData.systemPromptFooter_merged !== undefined
                    ? trackerData.systemPromptFooter_merged
                    : DEFAULT_PROMPT_FOOTER_MERGED;

                const defPrompt = buildDefinitionPromptWrapper(trackerData, header, footer);
                const statusPrompt = buildStatusPromptWrapper(trackerData);

                console.log(`[RPG Tracker] Step 3: defPrompt created (Length: ${defPrompt ? defPrompt.length : 0})`);
                console.log(`[RPG Tracker] Step 3.5: statusPrompt created (Length: ${statusPrompt ? statusPrompt.length : 0})`);

                if (typeof extension_prompt_types !== 'undefined' && typeof setExtensionPrompt === 'function') {
                    if (defPrompt) {
                        setExtensionPrompt(
                            `${extensionName}_def`,
                            defPrompt,
                            extension_prompt_types.IN_PROMPT,
                            0,
                            false,
                            extension_prompt_roles.SYSTEM || 0
                        );
                    } else {
                        setExtensionPrompt(`${extensionName}_def`, '', extension_prompt_types.IN_PROMPT, 0, false);
                    }

                    if (statusPrompt) {
                        setExtensionPrompt(
                            `${extensionName}_status`,
                            statusPrompt,
                            extension_prompt_types.IN_CHAT,
                            0,
                            false,
                            extension_prompt_roles.SYSTEM || 0
                        );
                    } else {
                        setExtensionPrompt(`${extensionName}_status`, '', extension_prompt_types.IN_CHAT, 0, false);
                    }
                    console.log(`[RPG Tracker] Step 4: setExtensionPrompt completed (def: IN_PROMPT, status: IN_CHAT)`);
                } else {
                    console.log(`[RPG Tracker] Error: extension_prompt_types or setExtensionPrompt not found.`);
                }
            } else {
                console.log(`[RPG Tracker] Step 2 Failed: trackerData not found or characters is not an array.`);
            }
        } else {
            console.log(`[RPG Tracker] Error: context or chatId not found.`);
        }
    });

    // 메시지 삭제/스와이프 시 UI 롤백
    eventSource.on(event_types.MESSAGE_DELETED, () => {
        if (window.RPGBridge && typeof window.RPGBridge.triggerHistoryRollback === 'function') {
            window.RPGBridge.triggerHistoryRollback();
        }
        setTimeout(() => injectAllDeltaLogs(extension_settings, extensionName, getContext), 100);
    });

    eventSource.on(event_types.MESSAGE_SWIPED, () => {
        if (window.RPGBridge && typeof window.RPGBridge.triggerHistoryRollback === 'function') {
            window.RPGBridge.triggerHistoryRollback();
        }
        setTimeout(() => injectAllDeltaLogs(extension_settings, extensionName, getContext), 100);
    });

    eventSource.on(event_types.CHAT_CHANGED, () => {
        if (window.RPGBridge && typeof window.RPGBridge.syncFromHistoryOrMeta === 'function') {
            window.RPGBridge.syncFromHistoryOrMeta();
        }
        setTimeout(() => injectAllDeltaLogs(extension_settings, extensionName, getContext), 100);
    });

    // UI 잠금 해제 유틸리티
    const unlockReactUI = () => {
        if (window.RPGBridge && typeof window.RPGBridge.setGenerationState === 'function') {
            window.RPGBridge.setGenerationState(false);
        }
    };

    // AI 생성이 완료되었을 때 (렌더링 충돌이 없는 가장 안전한 시점) JSON을 파싱하고 메시지를 덮어씀
    const processGenerationEnd = async () => {
        unlockReactUI(); // UI 잠금 해제

        if (!extension_settings[extensionName].enabled) return;

        const context = getContext();
        if (context && context.chat && context.chat.length > 0) {
            const lastMessage = context.chat[context.chat.length - 1];

            if (lastMessage && lastMessage.is_user === false) {
                const text = lastMessage.mes;
                const { cleanedText, patch } = parseResponse(text);

                if (patch && Object.keys(patch).length > 0) {
                    lastMessage.mes = cleanedText; // 주석(JSON)이 제거된 깔끔한 텍스트로 교체
                    setDeltaLog(lastMessage, patch);

                    const trackerData = window.RPGBridge?.currentTrackerData || rehydrateFromHistory(context.chat);
                    if (trackerData && Array.isArray(trackerData.characters)) {
                        const updatedData = applyLLMPatch(trackerData, patch);

                        if (window.RPGBridge && typeof window.RPGBridge.syncChatData === 'function') {
                            window.RPGBridge.syncChatData(updatedData);
                        }
                        if (window.RPGBridge && typeof window.RPGBridge.saveChatData === 'function') {
                            window.RPGBridge.saveChatData(updatedData, 20);
                        }
                    }

                    // ST 코어 렌더링이 종료된 시점이므로 화면 업데이트 충돌 발생 확률이 극도로 낮음
                    if (typeof updateMessageBlock === 'function') {
                        safeUpdateMessageBlock(context.chat.length - 1, lastMessage);
                    }
                    if (typeof saveChatConditional === "function") {
                        saveChatConditional();
                    } else if (typeof saveChat === "function") {
                        saveChat();
                    }

                    // 델타 로그(스탯 변화량) 즉시 주입
                    setTimeout(() => injectAllDeltaLogs(extension_settings, extensionName, getContext), 50);
                }
            }
        }
    };

    // 통합 이벤트 등록
    eventSource.on(event_types.GENERATION_ENDED, processGenerationEnd);
    eventSource.on(event_types.GENERATION_STOPPED, processGenerationEnd);
    eventSource.on(event_types.USER_MESSAGE_RENDERED, unlockReactUI);

    startChatObserver();
    setTimeout(() => injectAllDeltaLogs(extension_settings, extensionName, getContext), 500);
});

let chatObserver = null;
let deltaLogDebounceTimer = null; // 디바운스 타이머 추가

function startChatObserver() {
    if (chatObserver) return;
    const chatContainer = document.getElementById('chat');
    if (!chatContainer) {
        setTimeout(startChatObserver, 500);
        return;
    }

    chatObserver = new MutationObserver(() => {
        // DOM이 변할 때마다 즉시 실행하지 않고, 100ms 동안 추가 변경이 없을 때만 실행
        if (deltaLogDebounceTimer) clearTimeout(deltaLogDebounceTimer);
        deltaLogDebounceTimer = setTimeout(() => {
            injectAllDeltaLogs(extension_settings, extensionName, getContext);
        }, 100);
    });

    // subtree: true는 유지하되, 텍스트 노드 변경(characterData)은 감지하지 않도록 옵션 최적화
    chatObserver.observe(chatContainer, { childList: true, subtree: true, characterData: false });
}

// 실리터번 코어(dragdrop.js)의 파일 업로드 오류 해결 위한 방어 코드
window.addEventListener('drop', function (e) {
    const rxRoot = document.getElementById('my-rpg-react-root');

    // 1. 드롭된 위치가 우리 RPG 패널 안쪽
    if (rxRoot && rxRoot.contains(e.target)) {
        return;
    }

    // 2. 드롭된 위치가 패널 바깥(실리터번 영역)일 때만 방어막 작동
    if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) {
        e.stopPropagation();
        e.preventDefault();
    }
}, true); // true 필수 (실리터번의 jQuery가 이벤트를 받기 전에 먼저 가로채기 위해)