// index.js
import { extension_settings } from "../../../extensions.js";
import { loadSettings, backupSettingsToLocalStorage, syncRpgTrackerRegex } from "./src/core/ExtensionSettings.js";
import { establishBridgeConnection } from "./src/core/ExtensionBridge.js";
import { registerLifecycleEvents } from "./src/core/ExtensionLifecycle.js";
import { startChatObserver, registerChatEvents, triggerObserverNow } from "./src/core/ExtensionObserver.js";
import { registerContextInterceptor } from "./src/core/ContextManager.js";

import { registerSnapshotClickEvent } from "./src/messagetracker/SnapshotRenderer.js";
import { registerDeltaLogClickEvent } from "./src/tracker/DeltaLogRenderer.js";

export default 'RPGTracker';

const extensionPath = import.meta.url.substring(0, import.meta.url.lastIndexOf('/'));
const extensionName = extensionPath.substring(extensionPath.lastIndexOf('/') + 1);
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

registerContextInterceptor(extensionName);

async function initReactApp() {
    $('#my-rpg-react-root').remove();
    $('body').append('<div id="my-rpg-react-root" style="position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 9999; pointer-events: none;"></div>');
    try {
        await import(`${extensionPath}/dist/bundle.js?v=${Date.now()}`);
    } catch (err) {
        console.error("[RPG Tracker] Exception occurred while mounting React app:", err);
    }
}

jQuery(async () => {
    try {
        const extensionsettingsHtml = await $.get(`${extensionFolderPath}/extension-settings.html`);
        $("#extensions_settings2").append(extensionsettingsHtml);
        $("#rpg_tracker_enabled").on("input", (event) => {
            const isChecked = Boolean($(event.target).prop("checked"));
            extension_settings[extensionName] = extension_settings[extensionName] || {};
            extension_settings[extensionName].enabled = isChecked;

            if (!isChecked) {
                backupSettingsToLocalStorage(extensionName);

                $('#rpg-snapshot-styles').remove();
                $('#rpg-delta-log-styles').remove();
                $('.rpg-delta-log-container').remove();
                $('.rpg-snapshot-container').remove();
            }

            if (window.RPGBridge && typeof window.RPGBridge.syncSettings === 'function') {
                window.RPGBridge.syncSettings(extension_settings[extensionName]);
            }
            syncRpgTrackerRegex(isChecked);
        });
    } catch (err) {
        console.error("[RPG Tracker] Failed to load settings template", err);
    }

    await loadSettings(extensionName);
    establishBridgeConnection(extensionName);
    await initReactApp();

    registerSnapshotClickEvent();
    registerDeltaLogClickEvent();

    registerLifecycleEvents(extensionName);
    registerChatEvents();
    startChatObserver(extensionName);

    setTimeout(() => triggerObserverNow(), 500);
});

window.addEventListener('drop', function (e) {
    const rxRoot = document.getElementById('my-rpg-react-root');
    if (rxRoot && rxRoot.contains(e.target)) return;
    if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) {
        e.stopPropagation();
        e.preventDefault();
    }
}, true);