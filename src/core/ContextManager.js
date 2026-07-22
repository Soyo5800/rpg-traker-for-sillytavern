// src/core/ContextManager.js
import { extension_settings } from "../../../../../extensions.js";

/**
 * Registers global generation interceptor for SillyTavern.
 * Matches manifest.json "generate_interceptor": "RPGTracker_interceptGeneration"
 * @param {string} extensionName - Extension directory name.
 */
export function registerContextInterceptor(extensionName) {
    const interceptor = function RPGTracker_interceptGeneration(chat, _contextSize, _abort, type) {
        const isQuiet = type === 'quiet' || globalThis.rpgTracker_isQuietUpdating || window.RPGBridge?.isQuietUpdating;
        if (!isQuiet) return;
        if (!Array.isArray(chat)) return;

        const settings = window.RPGBridge?.latestSettings || extension_settings[extensionName] || extension_settings['rpg-tracker-for-sillytavern'] || {};
        const rawLimit = settings.contextMessageLimit;
        const limit = (rawLimit !== undefined && rawLimit !== null && !isNaN(Number(rawLimit))) ? Math.max(0, Number(rawLimit)) : 4;

        while (chat.length > limit) {
            chat.shift();
        }
    };

    globalThis.RPGTracker_interceptGeneration = interceptor;
    if (typeof window !== 'undefined') {
        window.RPGTracker_interceptGeneration = interceptor;
    }
}