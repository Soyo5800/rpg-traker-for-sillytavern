import { getContext, extension_settings } from "../../../extensions.js";
import { eventSource, event_types, saveSettingsDebounced, generateQuietPrompt, saveChat, updateMessageBlock, setExtensionPrompt, extension_prompt_types, extension_prompt_roles, getRequestHeaders } from "../../../../script.js";
import { backupToMessage, rehydrateFromHistory, defensiveMerge, applyLLMPatch, sanitizeTrackerData } from "./src/core/JSONTracker.js";
import { buildDefinitionPromptWrapper, buildStatusPromptWrapper } from "./src/core/ActivePrompt.js";
import { DEFAULT_PROMPT_HEADER_MERGED, DEFAULT_PROMPT_FOOTER_MERGED, DEFAULT_PROMPT_HEADER_SEP, DEFAULT_PROMPT_FOOTER_SEP } from "./src/core/PromptSchema.js";
import { parseResponse } from "./src/core/ResponseParser.js";

import { SlashCommandParser } from "../../../slash-commands/SlashCommandParser.js";

const extensionPath = import.meta.url.substring(0, import.meta.url.lastIndexOf('/'));
const extensionName = extensionPath.substring(extensionPath.lastIndexOf('/') + 1);
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    enabled: true,
    theme: "default",
    updateMode: "merged"
};

/**
 * Synchronize and register RPG Tracker filters inside SillyTavern's built-in Regex extension
 */
function syncRpgTrackerRegex(enabled) {
    // Get third-party extension and built-in Regex configuration
    extension_settings.regex = extension_settings.regex || [];
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
            promptOnly: true, // Filters only during prompt transmission (token send)
            markdownOnly: false,
            runOnEdit: true
        };
        extension_settings.regex.push(script);
    } else {
        script.disabled = !enabled;
        // Fully remove depth limits to prevent context interference
        delete script.minDepth;
        delete script.maxDepth;
    }

    // Add HTML-comment style JSON stripper (for cleaning up blocks wrapped in <!--RPG_TRACKER ... -->)
    let commentScript = extension_settings.regex.find(s => s.id === 'rpg_tracker_comment_stripper');
    if (!commentScript) {
        commentScript = {
            id: 'rpg_tracker_comment_stripper',
            scriptName: 'RPG Tracker Comment Stripper',
            findRegex: '<!--RPG_TRACKER\\s*```(?:json|markdown)?\\s*\\n?\\{[\\s\\S]*?(?:\"status\"|\"statusSchema\"|\"stats\"|\"profile\"|\"inventory\"|\"quests\"|\"Character Name\")[\\s\\S]*?\\}\\s*\\n?```\\s*-->\\s*',
            replaceString: '',
            trimStrings: [],
            placement: [1, 2], // 1: USER_INPUT, 2: AI_OUTPUT
            disabled: !enabled,
            promptOnly: true, // Filters only during prompt transmission (token send)
            markdownOnly: false,
            runOnEdit: true
        };
        extension_settings.regex.push(commentScript);
    } else {
        commentScript.disabled = !enabled;
        // Fully remove depth limits to prevent context interference
        delete commentScript.minDepth;
        delete commentScript.maxDepth;
    }

    saveSettingsDebounced();
}

/**
 * Safe updateMessageBlock Wrapper
 * Prevents ReasoningHandler errors when invoked before message rendering completes.
 */
function safeUpdateMessageBlock(index, messageObject) {
    if (typeof updateMessageBlock !== 'function') return;
    try {
        updateMessageBlock(index, messageObject);
    } catch (e) {
        // Retry after 100ms on DOM rendering collision
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
        Object.assign(extension_settings[extensionName], defaultSettings);
    }

    const enabled = extension_settings[extensionName].enabled;
    $("#rpg_tracker_enabled")
        .prop("checked", enabled)
        .trigger("input");

    // Sync regex on initial load
    syncRpgTrackerRegex(enabled);
}

function onEnabledInput(event) {
    const isChecked = Boolean($(event.target).prop("checked"));

    extension_settings[extensionName] = extension_settings[extensionName] || {};
    extension_settings[extensionName].enabled = isChecked;
    saveSettingsDebounced();

    if (window.RPGBridge && typeof window.RPGBridge.syncSettings === 'function') {
        window.RPGBridge.syncSettings({ enabled: isChecked });
    }

    // Sync regex active status on change
    syncRpgTrackerRegex(isChecked);
}

function establishBridgeConnection() {
    const connectionInterval = setInterval(() => {
        if (window.RPGBridge && typeof window.RPGBridge.syncSettings === 'function') {
            clearInterval(connectionInterval);

            window.RPGBridge.saveSettings = (updatedSettings) => {
                extension_settings[extensionName] = {
                    ...extension_settings[extensionName],
                    ...updatedSettings
                };
                saveSettingsDebounced();
            };

            window.RPGBridge.saveChatData = (updatedTracker, maxBackupCount) => {
                const context = getContext();

                // Append hidden JSON comments to the end of the latest message and sync backup cleanup
                const currentChat = context.chat;
                const lastIndex = currentChat ? currentChat.length - 1 : -1;
                
                const safeSaveChat = () => {
                    if (!context.groupId && typeof saveChat === 'function') {
                        saveChat();
                    }
                };
                
                if (currentChat && lastIndex >= 0) {
                    backupToMessage(currentChat, lastIndex, updatedTracker, safeUpdateMessageBlock, safeSaveChat, maxBackupCount);
                }
                console.log("[RPG Tracker] Chat data saved to native DB:", updatedTracker);
            };

            // Bind history-rollback synchronization interface
            window.RPGBridge.rehydrateFromHistory = () => {
                const context = getContext();
                return rehydrateFromHistory(context.chat);
            };

            window.RPGBridge.connectChat = (currentTrackerData) => {
                const context = getContext();
                if (context && context.chatId) {
                    if (typeof window.RPGBridge.saveChatData === 'function') {
                        window.RPGBridge.saveChatData(currentTrackerData, 20);
                    }
                    
                    if (!context.groupId && typeof saveChat === 'function') {
                        saveChat();
                    }
                    
                    if (typeof window.RPGBridge.setChatConnectionStatus === 'function') {
                        window.RPGBridge.setChatConnectionStatus(true);
                    }
                    console.log("[RPG Tracker] ✅ Chat successfully connected and initialized.");
                }
            };

            window.RPGBridge.disconnectChat = () => {
                const context = getContext();
                if (context && context.chatId) {
                    // Also clear backups from history
                    const currentChat = context.chat;
                    if (currentChat && currentChat.length > 0) {
                        for (let i = 0; i < currentChat.length; i++) {
                            const msg = currentChat[i];
                            if (msg && msg.mes && (msg.mes.includes('<!--RPG_TRACKER:') || msg.mes.includes('<!--RPG_DATA:'))) {
                                msg.mes = msg.mes.replace(/<!--RPG_TRACKER:([\s\S]*?)-->/g, '').trim();
                                msg.mes = msg.mes.replace(/<!--RPG_DATA:([\s\S]*?)-->/g, '').trim();
                                if (typeof updateMessageBlock === 'function') {
                                    safeUpdateMessageBlock(i, msg);
                                }
                            }
                        }
                        if (!context.groupId && typeof saveChat === 'function') saveChat();
                    }

                    if (typeof window.RPGBridge.setChatConnectionStatus === 'function') {
                        window.RPGBridge.setChatConnectionStatus(false);
                    }
                    console.log("[RPG Tracker] ⚠️ Chat disconnected and backups cleared.");
                }
            };

            window.RPGBridge.triggerCharacterGeneration = async (promptText, isPlayer = false) => {
                const trackerData = window.RPGBridge?.currentTrackerData;
                if (!trackerData) {
                    console.warn("[RPG Tracker] ⚠️ Cannot generate character: Chat is not connected or trackerData is missing.");
                    return;
                }

                console.log("[RPG Tracker] 🔄 Character generation triggered...");
                
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
                        
                        // Update React UI
                        if (typeof window.RPGBridge.syncChatData === 'function') {
                            window.RPGBridge.syncChatData(updatedData);
                        }
                        
                        console.log("[RPG Tracker] ✅ Character generated successfully.");

                        try {
                            // 1. First append the system message log to the chat log
                            const sysText = `[RPG Tracker] System has added a new character.\n<!--RPG_TRACKER:\n\`\`\`json\n${JSON.stringify(patch, null, 2)}\n\`\`\`\n-->`;
                            await SlashCommandParser.commands['sys'].callback({}, sysText);
                            
                            // 2. Then save to ST context on the newly created message's index to ensure persistent O(1) rehydration
                            if (typeof window.RPGBridge.saveChatData === 'function') {
                                window.RPGBridge.saveChatData(updatedData, 20); 
                            }
                        } catch (err) {
                            console.warn("[RPG Tracker] Failed to trigger /sys command or save chat data.", err);
                            // Fallback save
                            if (typeof window.RPGBridge.saveChatData === 'function') {
                                window.RPGBridge.saveChatData(updatedData, 20); 
                            }
                        }
                    } else {
                        console.log("[RPG Tracker] ⚠️ No valid patch found in character generation.");
                        try {
                            await SlashCommandParser.commands['sys'].callback({}, "[RPG Tracker] Generation failed (No valid JSON found).");
                        } catch (err) {
                            console.warn("[RPG Tracker] Failed to trigger /sys command.", err);
                        }
                    }
                } catch (e) {
                    console.error("[RPG Tracker] ❌ Character generation error:", e);
                }
            };

            window.RPGBridge.triggerManualUpdate = async () => {
                const trackerData = window.RPGBridge?.currentTrackerData;
                if (!trackerData || !Array.isArray(trackerData.characters)) {
                    console.warn("[RPG Tracker] ⚠️ Cannot trigger manual update: Chat is not connected or trackerData is invalid.");
                    return;
                }

                console.log("[RPG Tracker] 🔄 Manual background update triggered...");
                
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
                        
                        // Update React UI
                        if (typeof window.RPGBridge.syncChatData === 'function') {
                            window.RPGBridge.syncChatData(updatedData);
                        }
                        
                        console.log("[RPG Tracker] ✅ Manual update applied successfully.");

                        // Output the result as a system message in the chat
                        try {
                            // 1. First append the system message log to the chat log
                            const sysText = `[RPG Tracker] Status has been manually updated.\n<!--RPG_TRACKER:\n\`\`\`json\n${JSON.stringify(patch, null, 2)}\n\`\`\`\n-->`;
                            await SlashCommandParser.commands['sys'].callback({}, sysText);
                            
                            // 2. Then save to ST context on the newly created message's index to ensure persistent O(1) rehydration
                            if (typeof window.RPGBridge.saveChatData === 'function') {
                                window.RPGBridge.saveChatData(updatedData, 20); 
                            }
                        } catch (err) {
                            console.warn("[RPG Tracker] Failed to trigger /sys command or save chat data.", err);
                            // Fallback save
                            if (typeof window.RPGBridge.saveChatData === 'function') {
                                window.RPGBridge.saveChatData(updatedData, 20); 
                            }
                        }
                    } else {
                        console.log("[RPG Tracker] ⚠️ No valid patch found in manual update.");
                        try {
                            await SlashCommandParser.commands['sys'].callback({}, "[RPG Tracker] No valid updates found.");
                        } catch (err) {
                            console.warn("[RPG Tracker] Failed to trigger /sys command.", err);
                        }
                    }
                } catch (e) {
                    console.error("[RPG Tracker] ❌ Manual update error:", e);
                    throw e; // Let React handle the error UI
                }
            };

            window.RPGBridge.triggerFullRequestUpdate = async () => { console.log("[RPG Tracker] Full Overwrite Update is deprecated and no longer needed."); };
            window.RPGBridge.handleFullRequestUpdate = window.RPGBridge.triggerFullRequestUpdate;

            window.RPGBridge.getUserPersonaName = () => {
                try {
                    const context = getContext();
                    return context && context.name1 ? context.name1 : 'Player';
                } catch(e) {
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

            // Sync logic: restore last state from chat -> merge and apply
            const syncFromHistoryOrMeta = () => {
                const context = getContext();
                let trackerData = null;
                
                if (context && Array.isArray(context.chat)) {
                    trackerData = rehydrateFromHistory(context.chat);
                }

                if (trackerData && typeof window.RPGBridge.syncChatData === 'function') {
                    window.RPGBridge.syncChatData(trackerData);
                    if (typeof window.RPGBridge.setChatConnectionStatus === 'function') {
                        window.RPGBridge.setChatConnectionStatus(true);
                    }
                } else if (typeof window.RPGBridge.resetToDefault === 'function') {
                    window.RPGBridge.resetToDefault();
                    if (typeof window.RPGBridge.setChatConnectionStatus === 'function') {
                        window.RPGBridge.setChatConnectionStatus(false);
                    }
                }
            };

            // Attach helper function to the bridge for reuse in events like CHAT_CHANGED
            window.RPGBridge.syncFromHistoryOrMeta = syncFromHistoryOrMeta;

            // Run synchronization on initial load
            syncFromHistoryOrMeta();

            console.log("[RPG Tracker] ✅ Native-React Bridge is successfully synchronized.");
        }
    }, 100);

    setTimeout(() => clearInterval(connectionInterval), 10000);
}

async function initReactApp() {
    console.log("[RPG Tracker] Attempting to inject React App...");
    $('#my-rpg-react-root').remove();

    // Insert root box with fully transparent styling and click penetration (pointer-events: none)
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

    // Prompt injection: GENERATION_STARTED (Using extension prompts)
    eventSource.on(event_types.GENERATION_STARTED, (args) => {
        console.log(`[RPG Tracker] Step 1: GENERATION_STARTED event detected`);
        if (!extension_settings[extensionName].enabled) {
            console.log(`[RPG Tracker] Injection skipped due to extension being disabled`);
            return;
        }
        
        // Skip automatic injection during chat generation if updateMode is separated
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
                    // 1. Inject definition prompt (IN_PROMPT, depth 0)
                    if (defPrompt) {
                        setExtensionPrompt(
                            `${extensionName}_def`, 
                            defPrompt, 
                            extension_prompt_types.IN_PROMPT, 
                            0, // depth 0
                            false, // override/bias
                            extension_prompt_roles.SYSTEM || 0
                        );
                    } else {
                        setExtensionPrompt(`${extensionName}_def`, '', extension_prompt_types.IN_PROMPT, 0, false);
                    }

                    // 2. Inject status prompt (IN_CHAT, depth 0)
                    if (statusPrompt) {
                        setExtensionPrompt(
                            `${extensionName}_status`, 
                            statusPrompt, 
                            extension_prompt_types.IN_CHAT, 
                            0, // depth 0 (bottom of chat)
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

    // Parse and merge on message received (MESSAGE_RECEIVED)
    eventSource.on(event_types.MESSAGE_RECEIVED, async (messageId) => {
        if (!extension_settings[extensionName].enabled) return;

        const context = getContext();
        if (context && context.chat && context.chat.length > 0) {
            // Find the latest message object just received
            const lastMessage = context.chat[context.chat.length - 1];
            
            // Process if the message ID matches
            if (lastMessage && (!messageId || lastMessage.mes === messageId || lastMessage.is_user === false)) {
                const text = lastMessage.mes;
                const { cleanedText, patch } = parseResponse(text);
                
                if (patch && Object.keys(patch).length > 0) {
                    // Keep the JSON text in the latest message intact for LLM context
                    
                    // 1. Merge status and backup
                    const trackerData = window.RPGBridge?.currentTrackerData || rehydrateFromHistory(context.chat);
                    if (trackerData && Array.isArray(trackerData.characters)) {
                         const updatedData = applyLLMPatch(trackerData, patch);
                         
                         // Request state synchronization with React UI (RPGBridge)
                         if (window.RPGBridge && typeof window.RPGBridge.syncChatData === 'function') {
                             window.RPGBridge.syncChatData(updatedData);
                         }
                         
                         // Native backup (either call saveChatData defined in establishBridgeConnection or invoke directly)
                         if (window.RPGBridge && typeof window.RPGBridge.saveChatData === 'function') {
                             window.RPGBridge.saveChatData(updatedData, 20); // maxBackup 20
                         }
                    }
                    
                    // Notify ST to re-render the modified message
                    if (typeof updateMessageBlock === 'function') {
                        // updateMessageBlock expects (index, messageObject) usually, or (index, text) depending on ST version.
                        // Usually updating lastMessage.mes natively works if we re-render chat. 
                        // But since we edited lastMessage.mes = cleanedText above, we just pass the object.
                        safeUpdateMessageBlock(context.chat.length - 1, lastMessage);
                    }
                }
            }
        }
    });

    // Register ST triggers to perform React state rollback on message deletion or swipe
    eventSource.on(event_types.MESSAGE_DELETED, () => {
        if (window.RPGBridge && typeof window.RPGBridge.triggerHistoryRollback === 'function') {
            window.RPGBridge.triggerHistoryRollback();
        }
    });

    eventSource.on(event_types.MESSAGE_SWIPED, () => {
        if (window.RPGBridge && typeof window.RPGBridge.triggerHistoryRollback === 'function') {
            window.RPGBridge.triggerHistoryRollback();
        }
    });

    eventSource.on(event_types.CHAT_CHANGED, () => {
        if (window.RPGBridge && typeof window.RPGBridge.syncFromHistoryOrMeta === 'function') {
            window.RPGBridge.syncFromHistoryOrMeta();
        }
    });
});
