// src/core/JSONTracker_Patcher.js

import { getDefaultCharacters } from './PromptSchema.js';
import { sanitizeTrackerData, cleanIdString, generateUniqueId, parseMetadata } from './JSONTracker_Migrator.js';

/**
 * Merge world state variables and events
 */
function mergeWorldState(currentWorldState, updates, worldStateLocks) {
    const worldState = currentWorldState || { date: '', time: '', location: '', weather: '', events: [] };
    const locks = worldStateLocks || {};

    if (updates.date !== undefined && !locks.date) worldState.date = String(updates.date);
    if (updates.time !== undefined && !locks.time) worldState.time = String(updates.time);
    if (updates.location !== undefined && !locks.location) worldState.location = String(updates.location);
    if (updates.weather !== undefined && !locks.weather) worldState.weather = String(updates.weather);

    if (Array.isArray(updates.events)) {
        const existingEvents = worldState.events || [];
        const parsedNewEvents = updates.events.map(e => {
            let name = '';
            let desc = '';
            if (typeof e === 'string') {
                desc = e.trim();
            } else if (e && typeof e === 'object') {
                name = e.name || '';
                desc = e.desc || '';
            }
            if (!name && !desc) return null;
            const id = cleanIdString(name, 'event');
            return { id, name, desc };
        }).filter(Boolean);

        const mergedEvents = [...existingEvents];
        parsedNewEvents.forEach(newEvt => {
            const index = mergedEvents.findIndex(evt =>
                (evt.id && evt.id === newEvt.id) ||
                (evt.name && evt.name.trim().toLowerCase() === newEvt.name.trim().toLowerCase())
            );
            if (index !== -1) {
                mergedEvents[index] = { ...mergedEvents[index], ...newEvt };
            } else {
                mergedEvents.push(newEvt);
            }
        });
        worldState.events = mergedEvents;
    }
    return worldState;
}

/**
 * Retrieve an existing character or initialize a new instance if missing
 */
function getOrCreateCharacter(charactersArray, charName, isPlayer, updates) {
    const cleanCharId = cleanIdString(charName, 'char');
    let charIndex = charactersArray.findIndex(c => c.id === cleanCharId || c.name?.trim().toLowerCase() === charName.trim().toLowerCase());

    if (charIndex === -1) {
        const newChar = JSON.parse(JSON.stringify(getDefaultCharacters()[0]));
        newChar.id = cleanCharId;
        newChar.name = charName;
        newChar.activePlayer = updates.activePlayer !== undefined ? Boolean(updates.activePlayer) : isPlayer;

        newChar.statusSchema = [];
        newChar.status = {};
        newChar.profile = {};
        newChar.profileLocks = {};
        newChar.relations = {};

        if (charactersArray.length === 1 && charactersArray[0].id === 'char_user' && charactersArray[0].name === 'New') {
            charactersArray.length = 0;
            charactersArray.push(newChar);
            charIndex = 0;
        } else {
            charactersArray.push(newChar);
            charIndex = charactersArray.length - 1;
        }
    }

    const char = charactersArray[charIndex];
    if (updates.activePlayer !== undefined) {
        char.activePlayer = Boolean(updates.activePlayer);
    }
    return char;
}

/**
 * Merge character status parameters and adjust bounds
 */
function mergeCharacterStatus(char, statusUpdates, updateType) {
    const statusSchema = char.statusSchema || [];
    const currentStatus = char.status || {};

    if (updateType === 'replace') {
        const nextStatusSchema = [];
        const nextStatus = {};

        Object.entries(statusUpdates).forEach(([patchKey, rawPatchVal]) => {
            const metaInfo = parseMetadata(rawPatchVal);
            const patchVal = metaInfo.value;
            const parsedType = metaInfo.type;
            const parsedMin = metaInfo.min;
            const parsedMax = metaInfo.max;

            const cleanPatchKey = patchKey.toLowerCase().replace(/\s+/g, '');
            const matchedSchema = statusSchema.find(schema => {
                const cleanId = (schema.id || '').toLowerCase().replace(/\s+/g, '');
                const cleanName = (schema.name || '').toLowerCase().replace(/\s+/g, '');
                return cleanId === cleanPatchKey || cleanName === cleanPatchKey;
            });

            let targetId = patchKey.trim().replace(/[^\p{L}\p{N}_]/gu, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
            if (!targetId) targetId = generateUniqueId('status');

            let finalType = 'text';
            let finalMin = 0;
            let finalMax = 100;
            let isLocked = false;
            let isInject = true;

            if (matchedSchema) {
                targetId = matchedSchema.id;
                finalType = matchedSchema.type || 'text';
                finalMin = matchedSchema.min !== undefined ? matchedSchema.min : 0;
                finalMax = matchedSchema.max !== undefined ? matchedSchema.max : 100;
                isLocked = matchedSchema.isLocked || false;
                isInject = matchedSchema.isInject !== false;
            } else if (parsedType) {
                finalType = parsedType;
                finalMin = parsedMin !== null ? parsedMin : 0;
                finalMax = parsedMax !== null ? parsedMax : 100;
            } else {
                const parsedInt = parseInt(patchVal, 10);
                if (!isNaN(parsedInt) && String(patchVal).trim() === String(parsedInt)) {
                    finalType = 'integer';
                }
            }

            let finalVal = patchVal !== null && patchVal !== undefined ? String(patchVal) : '';
            if (['integer', 'consumable', 'stacking'].includes(finalType)) {
                const parsedInt = parseInt(patchVal, 10);
                if (!isNaN(parsedInt)) {
                    finalVal = Math.min(finalMax, Math.max(finalMin, parsedInt));
                } else {
                    finalVal = ['consumable'].includes(finalType) ? finalMax : finalMin;
                }
            }

            nextStatusSchema.push({ id: targetId, name: matchedSchema ? matchedSchema.name : patchKey, type: finalType, min: finalMin, max: finalMax, isLocked, isInject });
            nextStatus[targetId] = finalVal;
        });

        char.status = nextStatus;
        char.statusSchema = nextStatusSchema;
    } else {
        const newStatus = {};
        statusSchema.forEach(schema => {
            if (currentStatus[schema.id] !== undefined) {
                newStatus[schema.id] = currentStatus[schema.id];
            } else {
                const minLimit = schema.min !== undefined && schema.min !== null ? schema.min : 0;
                const maxLimit = schema.max !== undefined && schema.max !== null ? schema.max : 100;
                newStatus[schema.id] = ['consumable'].includes(schema.type) ? maxLimit : minLimit;
            }
        });

        Object.entries(statusUpdates).forEach(([patchKey, rawPatchVal]) => {
            const metaInfo = parseMetadata(rawPatchVal);
            const patchVal = metaInfo.value;
            const parsedType = metaInfo.type;
            const parsedMin = metaInfo.min;
            const parsedMax = metaInfo.max;

            const cleanPatchKey = patchKey.toLowerCase().replace(/\s+/g, '');
            const matchedSchema = statusSchema.find(schema => {
                const cleanId = (schema.id || '').toLowerCase().replace(/\s+/g, '');
                const cleanName = (schema.name || '').toLowerCase().replace(/\s+/g, '');
                return cleanId === cleanPatchKey || cleanName === cleanPatchKey;
            });

            if (matchedSchema) {
                const targetId = matchedSchema.id;
                if (['integer', 'consumable', 'stacking'].includes(matchedSchema.type)) {
                    const parsedInt = parseInt(patchVal, 10);
                    if (!isNaN(parsedInt)) {
                        const minLimit = matchedSchema.min !== undefined && matchedSchema.min !== null ? matchedSchema.min : 0;
                        const maxLimit = matchedSchema.max !== undefined && matchedSchema.max !== null ? matchedSchema.max : 100;
                        newStatus[targetId] = Math.min(maxLimit, Math.max(minLimit, parsedInt));
                    }
                } else {
                    newStatus[targetId] = patchVal !== null && patchVal !== undefined ? String(patchVal) : '';
                }
            } else {
                const newId = patchKey.trim() || generateUniqueId('status');
                let newType = parsedType || 'text';
                let finalVal = patchVal !== null && patchVal !== undefined ? String(patchVal) : '';

                if (!parsedType) {
                    const parsedInt = parseInt(patchVal, 10);
                    if (!isNaN(parsedInt) && String(patchVal).trim() === String(parsedInt)) {
                        newType = 'integer';
                        finalVal = parsedInt;
                    }
                } else if (['integer', 'consumable', 'stacking'].includes(newType)) {
                    const parsedInt = parseInt(patchVal, 10);
                    if (!isNaN(parsedInt)) {
                        finalVal = parsedInt;
                    }
                }

                statusSchema.push({ id: newId, name: patchKey, type: newType, min: parsedMin !== null ? parsedMin : 0, max: parsedMax !== null ? parsedMax : 100, isLocked: false, isInject: true });
                newStatus[newId] = finalVal;
            }
        });
        char.status = newStatus;
        char.statusSchema = statusSchema;
    }
}

/**
 * Merge character profile descriptive fields
 */
function mergeCharacterProfile(char, profileUpdates, updateType) {
    char.profileLocks = char.profileLocks || {};

    const safeStringify = (val) => {
        if (typeof val === 'object' && val !== null) {
            try {
                return JSON.stringify(val);
            } catch (e) {
                return String(val);
            }
        }
        return String(val);
    };

    if (updateType === 'replace') {
        const nextProfile = {};
        Object.entries(char.profile || {}).forEach(([pKey, pVal]) => {
            if (char.profileLocks[pKey] === true) nextProfile[pKey] = pVal;
        });
        Object.entries(profileUpdates).forEach(([pKey, pVal]) => {
            if (!char.profileLocks[pKey] && pVal !== undefined && pVal !== null) {
                nextProfile[pKey] = safeStringify(pVal);
            }
        });
        char.profile = nextProfile;
    } else {
        char.profile = char.profile || {};
        Object.entries(profileUpdates).forEach(([pKey, pVal]) => {
            if (!char.profileLocks[pKey] && pVal !== undefined && pVal !== null) {
                char.profile[pKey] = safeStringify(pVal);
            }
        });
    }
}

/**
 * Update equipment slots and backpack/container items
 */
function mergeCharacterInventory(char, inventoryUpdates) {
    char.inventory = char.inventory || {};

    if (inventoryUpdates.equipment && typeof inventoryUpdates.equipment === 'object') {
        if (!char.inventory.equipIsLocked) {
            char.inventory.equipment = char.inventory.equipment || {};
            Object.entries(inventoryUpdates.equipment).forEach(([slot, itemVal]) => {
                if (itemVal === 'Empty' || !itemVal) {
                    char.inventory.equipment[slot] = null;
                } else {
                    const isObj = typeof itemVal === 'object' && itemVal !== null;
                    char.inventory.equipment[slot] = {
                        id: (isObj && itemVal.id) || `item_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                        name: isObj ? (itemVal.name || 'Unknown') : String(itemVal),
                        desc: isObj ? (itemVal.desc || itemVal.description || '') : ''
                    };
                }
            });
        }
    }

    if (inventoryUpdates.storage && typeof inventoryUpdates.storage === 'object') {
        if (!char.inventory.storageIsLocked) {
            char.inventory.storage = char.inventory.storage || {};
            Object.entries(inventoryUpdates.storage).forEach(([container, items]) => {
                if (Array.isArray(items)) {
                    char.inventory.storage[container] = items.map(item => {
                        if (typeof item === 'string') {
                            const qtyMatch = item.match(/^([\s\S]*?)x(\d+)$/);
                            return qtyMatch
                                ? { id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, name: qtyMatch[1].trim(), quantity: parseInt(qtyMatch[2], 10) || 1, desc: '' }
                                : { id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, name: item, quantity: 1, desc: '' };
                        } else if (item && typeof item === 'object') {
                            return {
                                id: item.id || `item_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                                name: item.name || 'Unknown',
                                quantity: item.quantity || 1,
                                desc: item.desc || item.description || ''
                            };
                        }
                        return null;
                    }).filter(Boolean);
                }
            });
        }
    }
}

/**
 * Sync active quest progress parameters
 */
function mergeCharacterQuests(char, questUpdates) {
    char.quests = char.quests || {};

    if (questUpdates.main && typeof questUpdates.main === 'object') {
        char.quests.main = char.quests.main || {};
        if (!char.quests.main.isLocked) {
            if (questUpdates.main.name !== undefined) char.quests.main.name = String(questUpdates.main.name);
            if (questUpdates.main.description !== undefined) char.quests.main.desc = String(questUpdates.main.description);
        }
    }

    if (Array.isArray(questUpdates.sideQuests)) {
        const existingSides = char.quests.sides || [];
        const lockedSides = existingSides.filter(q => q.isLocked);
        const parsedNewSides = questUpdates.sideQuests.map(sq => {
            let qName = 'Unknown', qDesc = '', isCompleted = false;
            if (typeof sq === 'string') { qName = sq; }
            else if (sq && typeof sq === 'object') {
                qName = sq.name || 'Unknown';
                qDesc = sq.description || '';
                isCompleted = sq.status === 'COMPLETED' || sq.isCompleted === true;
            }
            return { id: cleanIdString(qName, 'quest'), name: qName, desc: qDesc, isCompleted, isLocked: false };
        }).filter(Boolean);

        const finalSides = [...lockedSides];
        parsedNewSides.forEach(newQ => {
            if (!lockedSides.some(lockedQ => (newQ.id && lockedQ.id === newQ.id) || lockedQ.name.trim().toLowerCase() === newQ.name.trim().toLowerCase())) {
                finalSides.push(newQ);
            }
        });
        char.quests.sides = finalSides;
    }
}

/**
 * Handle relation structures, description text and numerical metric bars
 */
function mergeCharacterRelations(char, relationUpdates, updateType) {
    if (updateType === 'replace') {
        const nextRelations = {};
        Object.entries(char.relations || {}).forEach(([targetName, rData]) => {
            if (rData && rData.isLocked) nextRelations[targetName] = rData;
        });
        char.relations = nextRelations;
    } else {
        char.relations = char.relations || {};
    }

    Object.entries(relationUpdates).forEach(([targetName, rData]) => {
        if (!rData || typeof rData !== 'object') return;

        const existingRelation = char.relations[targetName] || { text: '', isLocked: false, isInject: true, values: {} };
        if (existingRelation.isLocked) return;

        if (rData.description !== undefined) existingRelation.text = String(rData.description);

        if (rData.metrics && typeof rData.metrics === 'object') {
            existingRelation.values = existingRelation.values || {};
            Object.entries(rData.metrics).forEach(([mName, rawMVal]) => {
                const metaInfo = parseMetadata(rawMVal);
                const parsedInt = parseInt(metaInfo.value, 10);
                const finalVal = !isNaN(parsedInt) ? parsedInt : String(metaInfo.value);
                const valType = metaInfo.type || (!isNaN(parsedInt) ? 'integer' : 'text');

                if (existingRelation.values[mName]) {
                    const existingMetric = existingRelation.values[mName];
                    const isObj = typeof existingMetric === 'object' && existingMetric !== null;
                    if (isObj && !isNaN(parsedInt)) {
                        const minLimit = existingMetric.min !== undefined && existingMetric.min !== null ? existingMetric.min : -100;
                        const maxLimit = existingMetric.max !== undefined && existingMetric.max !== null ? existingMetric.max : 100;
                        existingRelation.values[mName].value = Math.min(maxLimit, Math.max(minLimit, parsedInt));
                    } else {
                        existingRelation.values[mName].value = finalVal;
                    }
                    existingRelation.values[mName].type = existingRelation.values[mName].type || valType;
                } else {
                    existingRelation.values[mName] = { value: finalVal, type: valType, min: -100, max: 100, colorNegative: '#e74c3c', colorPositive: '#2ecc71' };
                }
            });
        }

        if (rData.targetDescription !== undefined) existingRelation.targetText = String(rData.targetDescription);

        if (rData.targetMetrics && typeof rData.targetMetrics === 'object') {
            existingRelation.targetValues = existingRelation.targetValues || {};
            Object.entries(rData.targetMetrics).forEach(([tmName, rawMVal]) => {
                const metaInfo = parseMetadata(rawMVal);
                const parsedInt = parseInt(metaInfo.value, 10);
                const finalVal = !isNaN(parsedInt) ? parsedInt : String(metaInfo.value);
                const valType = metaInfo.type || (!isNaN(parsedInt) ? 'integer' : 'text');

                if (existingRelation.targetValues[tmName]) {
                    const existingMetric = existingRelation.targetValues[tmName];
                    const isObj = typeof existingMetric === 'object' && existingMetric !== null;
                    if (isObj && !isNaN(parsedInt)) {
                        const minLimit = existingMetric.min !== undefined && existingMetric.min !== null ? existingMetric.min : -100;
                        const maxLimit = existingMetric.max !== undefined && existingMetric.max !== null ? existingMetric.max : 100;
                        existingRelation.targetValues[tmName].value = Math.min(maxLimit, Math.max(minLimit, parsedInt));
                    } else {
                        existingRelation.targetValues[tmName].value = finalVal;
                    }
                    existingRelation.targetValues[tmName].type = existingRelation.targetValues[tmName].type || valType;
                } else {
                    existingRelation.targetValues[tmName] = { value: finalVal, type: valType, min: -100, max: 100, colorNegative: '#e74c3c', colorPositive: '#2ecc71' };
                }
            });
        }

        char.relations[targetName] = existingRelation;
    });
}

/**
 * Enforce cross relation structures symmetrically between matching character sheets
 */
export function syncCrossRelations(characters) {
    characters.forEach(char => {
        if (!char.relations) return;

        Object.entries(char.relations).forEach(([targetName, rData]) => {
            const targetChar = characters.find(c => c.name?.trim().toLowerCase() === targetName.trim().toLowerCase());
            if (targetChar) {
                targetChar.relations = targetChar.relations || {};
                if (!targetChar.relations[char.name]) {
                    targetChar.relations[char.name] = { text: '', isLocked: false, isInject: true, values: {} };
                }
                const targetRel = targetChar.relations[char.name];

                if (rData.targetText !== undefined) targetRel.text = rData.targetText;

                if (rData.targetValues) {
                    targetRel.values = targetRel.values || {};
                    Object.entries(rData.targetValues).forEach(([mName, mVal]) => {
                        const mValue = typeof mVal === 'object' && mVal !== null ? mVal.value : mVal;
                        const mType = typeof mVal === 'object' && mVal !== null ? mVal.type : 'integer';

                        if (targetRel.values[mName]) {
                            if (typeof targetRel.values[mName] === 'object' && targetRel.values[mName] !== null) {
                                targetRel.values[mName].value = mValue;
                            } else {
                                targetRel.values[mName] = { value: mValue, type: mType };
                            }
                        } else {
                            targetRel.values[mName] = { value: mValue, type: mType };
                        }
                    });
                }
            }
        });
    });
}

/**
 * Orchestrator: Parse, process and apply incoming LLM patch data to global state
 */
export function applyLLMPatch(trackerData, patch, isPlayer = false, updateType = 'patch', mutateInPlace = false) {
    if (!patch || typeof patch !== 'object') return trackerData;

    const baseData = mutateInPlace ? trackerData : JSON.parse(JSON.stringify(trackerData));
    const updatedData = sanitizeTrackerData(baseData);

    if (Array.isArray(updatedData.characters)) {
        Object.entries(patch).forEach(([charName, updates]) => {
            if (!updates || typeof updates !== 'object') return;

            if (charName.toLowerCase() === 'world') {
                updatedData.worldState = mergeWorldState(updatedData.worldState, updates, updatedData.worldStateLocks);
                return;
            }

            const char = getOrCreateCharacter(updatedData.characters, charName, isPlayer, updates);

            let statusUpdates = updates.status || updates.stats || null;
            if (!statusUpdates && !updates.profile && !updates.relations && !updates.inventory && !updates.quests) {
                statusUpdates = updates;
            }

            if (statusUpdates) mergeCharacterStatus(char, statusUpdates, updateType);
            if (updates.profile) mergeCharacterProfile(char, updates.profile, updateType);
            if (updates.inventory) mergeCharacterInventory(char, updates.inventory);
            if (updates.quests) mergeCharacterQuests(char, updates.quests);
            if (updates.relations) mergeCharacterRelations(char, updates.relations, updateType);
        });

        syncCrossRelations(updatedData.characters);
    }

    return updatedData;
}