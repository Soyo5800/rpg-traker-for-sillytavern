// src/core/ExtensionSettings.js
import { extension_settings } from "../../../../../extensions.js";
import { saveSettingsDebounced } from "../../../../../../script.js";

const localStorageBackupKey = "rpg_tracker_settings_backup";

export const defaultSettings = {
    enabled: true,
    theme: "default",
    updateMode: "merged",
    contextMessageLimit: 4,
    showDeltaLog: true,
    keepAllBackups: false,
    maxBackupCount: 20,
    presets: [],
    croppedAvatars: {},
    useCustomModel: false,
    customModel: ""
};

export function backupSettingsToLocalStorage(extensionName) {
    if (extension_settings[extensionName]) {
        localStorage.setItem(localStorageBackupKey, JSON.stringify(extension_settings[extensionName]));
    }
}

export function restoreSettingsFromLocalStorage() {
    try {
        const backup = localStorage.getItem(localStorageBackupKey);
        if (backup) return JSON.parse(backup);
    } catch (e) {
        console.warn("[RPG Tracker] Failed to restore settings from localStorage:", e);
    }
    return null;
}

export function syncRpgTrackerRegex(enabled) {
    extension_settings.regex = extension_settings.regex || [];

    if (!enabled) {
        extension_settings.regex = extension_settings.regex.filter(s => !(s.id && s.id.startsWith('rpg_tracker')));
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

    // 백틱(```)이 있든 없든 <!--RPG_TRACKER ... --> 형태의 모든 JSON 블록을 감지하는 통합 정규식
    const flexibleJsonRegex = '<!--RPG_TRACKER\\s*(?:```(?:json|markdown)?\\s*\\n?)?\\{[\\s\\S]*?(?:\"[sS]tatus\"|\"[sS]tatus[sS]chema\"|\"[sS]tats\"|\"[pP]rofile\"|\"[iI]nventory\"|\"[qQ]uests\"|\"[cC]haracter [nN]ame\"|\"[wW]orld\"|\"[rR]elations\"|\"[eE]vents\")[\\s\\S]*?\\}(?:\\s*\\n?```)?\\s*-->\\s*';

    let script = extension_settings.regex.find(s => s.id === 'rpg_tracker_json_stripper');
    if (!script) {
        script = {
            id: 'rpg_tracker_json_stripper',
            scriptName: 'RPG Tracker JSON Stripper',
            findRegex: flexibleJsonRegex,
            replaceString: '',
            trimStrings: [],
            placement: [1, 2],
            disabled: !enabled,
            promptOnly: true,
            markdownOnly: false,
            runOnEdit: true
        };
        extension_settings.regex.push(script);
    } else {
        script.findRegex = flexibleJsonRegex;
        script.disabled = !enabled;
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
    }

    let commentScript = extension_settings.regex.find(s => s.id === 'rpg_tracker_comment_stripper');
    if (!commentScript) {
        commentScript = {
            id: 'rpg_tracker_comment_stripper',
            scriptName: 'RPG Tracker Comment Stripper',
            findRegex: flexibleJsonRegex,
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
        commentScript.findRegex = flexibleJsonRegex;
        commentScript.disabled = !enabled;
    }

    saveSettingsDebounced();
}

export async function loadSettings(extensionName) {
    extension_settings[extensionName] = extension_settings[extensionName] || {};

    if (Object.keys(extension_settings[extensionName]).length === 0) {
        const restored = restoreSettingsFromLocalStorage();
        if (restored) {
            Object.assign(extension_settings[extensionName], restored);
        } else {
            Object.assign(extension_settings[extensionName], defaultSettings);
        }
    } else {
        Object.keys(defaultSettings).forEach(key => {
            if (extension_settings[extensionName][key] === undefined) {
                extension_settings[extensionName][key] = defaultSettings[key];
            }
        });
    }

    const enabled = extension_settings[extensionName].enabled !== false;
    extension_settings[extensionName].enabled = enabled;

    $("#rpg_tracker_enabled").prop("checked", enabled);
    syncRpgTrackerRegex(enabled);
}