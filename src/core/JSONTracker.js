// src/core/JSONTracker.js

const COMMENT_PREFIX = '<!--RPG_TRACKER:';
const COMMENT_SUFFIX = '-->';
const COMMENT_REGEX = /<!--RPG_TRACKER:([\s\S]*?)-->/g;
import { getDefaultCharacters, getInitialTrackerData } from './PromptSchema.js';

const DEFAULT_MAX_KEEP = 4;

/**
 * Clean ID String helper
 */
export function cleanIdString(name, prefix) {
    if (!name) return `${prefix}_${Date.now()}`;
    const clean = name.replace(/[^\p{L}\p{N}_]/gu, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    return clean ? `${prefix}_${clean}` : `${prefix}_${Date.now()}`;
}


/**
 * Strip Static Data
 * Returns a copy of the trackerData with fixed schemas and system prompts removed to save token usage and file size.
 */
function stripStaticData(trackerData) {
    if (!trackerData) return null;
    const stripped = JSON.parse(JSON.stringify(trackerData));
    
    // Remove global static data
    delete stripped.systemPromptHeader_merged;
    delete stripped.systemPromptFooter_merged;
    delete stripped.systemPromptHeader_separated;
    delete stripped.systemPromptFooter_separated;
    delete stripped.globalDefinitions;
    delete stripped.addons;
    
    // Remove character-specific schemas and fixed data
    if (Array.isArray(stripped.characters)) {
        stripped.characters.forEach(char => {
            // Keep statusSchema as it is a core spec for loading/deserialization and UI rendering
            // profileLocks and others can be removed here if necessary
        });
    }
    
    return stripped;
}

/**
 * Extract metadata like type, min, max from values returned by the AI
 */
function parseMetadata(rawVal) {
    if (typeof rawVal !== 'string') return { value: rawVal, type: null, min: null, max: null };
    const metaMatch = rawVal.match(/^(.*?)\s*\(\s*type:\s*([a-zA-Z_]+)(?:[^)]*?min:\s*(-?\d+))?(?:[^)]*?max:\s*(-?\d+))?.*?\)$/i);
    if (metaMatch) {
        return {
            value: metaMatch[1].trim(),
            type: metaMatch[2].toLowerCase(),
            min: metaMatch[3] ? parseInt(metaMatch[3], 10) : null,
            max: metaMatch[4] ? parseInt(metaMatch[4], 10) : null
        };
    }
    return { value: rawVal, type: null, min: null, max: null };
}

// 기존 중첩 데이터를 안전하게 새 평탄화 스키마로 변환하는 함수
export function migrateCharacterSchema(char) {
  if (char && char.featuresData) {
    const { profile, profileLocks, profileInjects, inventory, quests } = char.featuresData;
    const migrated = {
      ...char,
      profile: profile || char.profile || { Race: '', Height: '', Appearance: '' },
      profileLocks: profileLocks || char.profileLocks || { Race: false, Height: false, Appearance: false },
      profileInjects: profileInjects || char.profileInjects || {},
      inventory: inventory || char.inventory || {
        equipIsLocked: false,
        equipIsInject: true,
        storageIsLocked: false,
        storageIsInject: true,
        equipment: { 'Right Hand': null, 'Left Hand': null },
        storage: { 'Backpack': [] }
      },
      quests: quests || char.quests || { main: { name: '', desc: '' }, sides: [] }
    };
    delete migrated.featuresData; // 구 버전 데이터 제거
    return migrated;
  }
  return char;
}

/**
 * Sanitize and Migrate Legacy/Corrupted RPG Tracker Data
 * - Cleans corrupted values like "100 (type: consumable, min: 0, max: 100)" back to pure numbers or text.
 * - Migrates legacy random stat IDs (e.g. stat_1782501069471) to human-readable names derived from schema.name.
 * - Keeps globalDefinitions synced with newly migrated IDs.
 */
export function sanitizeTrackerData(trackerData) {
    if (!trackerData) return trackerData;
    
    // Avoid double cloning, but operate safely
    const data = trackerData;

    // Sync and migrate globalDefinitions keys if needed
    const nextGlobalDefs = data.globalDefinitions ? { ...data.globalDefinitions } : null;

    if (Array.isArray(data.characters)) {
        data.characters.forEach((char, idx) => {
            // Migrate character schema from legacy nested featuresData to flat schema
            char = migrateCharacterSchema(char);
            data.characters[idx] = char;

            // Migrate character ID to name-based ID for consistency and deduplication
            if (char.name && char.name.trim() !== '') {
                const targetCharId = char.id === 'char_user' && char.name === 'New' ? 'char_user' : cleanIdString(char.name, 'char');
                if (char.id !== targetCharId) {
                    char.id = targetCharId;
                }
            }


            // Top-level key migration for backward compatibility
            if (char.statsSchema && !char.statusSchema) {
                char.statusSchema = char.statsSchema;
                delete char.statsSchema;
            }
            if (char.stats && !char.status) {
                char.status = char.stats;
                delete char.stats;
            }

            const originalStatus = char.status ? { ...char.status } : {};
            const nextStatus = {};
            const schemaIdMapping = {};

            // Ensure statusSchema is processed
            if (Array.isArray(char.statusSchema)) {
                char.statusSchema.forEach(schema => {
                    const oldId = schema.id;
                    if (schema.name && schema.name.trim() !== '') {
                        const cleanId = schema.name.replace(/[^\p{L}\p{N}_]/gu, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
                        const newId = cleanId || `status_${Date.now()}`;
                        
                        if (!oldId || oldId !== newId) {
                            schema.id = newId;
                            if (oldId) {
                                schemaIdMapping[oldId] = newId;
                            }
                        }

                        // Support English legacy keys (e.g. hp -> 체력, mp/mana -> 마나, fatigue -> 피로도)
                                const lowercaseName = schema.name.trim().toLowerCase();
                                const LEGACY_ENGLISH_MAPPINGS = {
                                    'hp': ['체력', '생명력', 'health'],
                                    'health': ['체력', '생명력'],
                                    'mp': ['마나', 'mp', 'mana'],
                                    'mana': ['마나'],
                                    'sp': ['기력', '스테미나', '스태미나', 'stamina'],
                                    'stamina': ['기력', '스테미나', '스태미나'],
                                    'fatigue': ['피로도', '피로'],
                                    'sanity': ['정신력', '이성'],
                                    'exp': ['경험치', '경험'],
                                    'gold': ['돈', '골드', '소지금'],
                                    'money': ['돈', '골드', '소지금'],
                                    'level': ['레벨'],
                                    'lv': ['레벨']
                                };

                                Object.entries(LEGACY_ENGLISH_MAPPINGS).forEach(([engKey, korNames]) => {
                                    if (korNames.some(kor => lowercaseName.includes(kor.toLowerCase()) || kor.toLowerCase().includes(lowercaseName))) {
                                        schemaIdMapping[engKey] = newId;
                                        schemaIdMapping[`stat_${engKey}`] = newId;
                                        schemaIdMapping[`status_${engKey}`] = newId;
                                    }
                                });
                                
// Migrate globalDefinitions guides
                        if (nextGlobalDefs && oldId) {
                            const legacyGuideId1 = oldId;
                            const legacyGuideId2 = `stat_${cleanId}`;
                            const newGuideId = `status_${cleanId}`;

                            const guideVal = nextGlobalDefs[legacyGuideId1] !== undefined ? nextGlobalDefs[legacyGuideId1] : nextGlobalDefs[legacyGuideId2];
                            if (guideVal !== undefined) {
                                nextGlobalDefs[newGuideId] = guideVal;
                                if (legacyGuideId1 !== newGuideId) {
                                    delete nextGlobalDefs[legacyGuideId1];
                                }
                                if (legacyGuideId2 !== newGuideId) {
                                    delete nextGlobalDefs[legacyGuideId2];
                                }
                            }
                        }
                    } else if (schema.id && !schema.name) {
                        schema.name = schema.id; // Fallback if name is missing
                    } else if (!schema.id && !schema.name) {
                        schema.id = `status_${Date.now()}`;
                        schema.name = schema.id;
                    }
                });
            }

            // Clean and migrate stats
            if (char.status) {
                Object.entries(char.status).forEach(([key, val]) => {
                    // 1. Clean value if corrupted like "100 (type: consumable...)"
                    let cleanVal = val;
                    if (typeof val === 'string' && val.includes('(type:')) {
                        const meta = parseMetadata(val);
                        const parsedInt = parseInt(meta.value, 10);
                        cleanVal = !isNaN(parsedInt) ? parsedInt : meta.value;
                    }

                    // 2. Map old ID to new ID if migrated
                    const targetId = schemaIdMapping[key] || key;
                    nextStatus[targetId] = cleanVal;
                });
                char.status = nextStatus;
            }
        });
    }

    if (nextGlobalDefs) {
        data.globalDefinitions = nextGlobalDefs;
    }

    return data;
}

/**
 * 0. Apply LLM Patch
 * Safely sanitizes and merges complex character JSON data output by LLM into the character state.
 * Supports updates for stats, profile, inventory, quests, etc.
 */
export function applyLLMPatch(trackerData, patch, isPlayer = false, updateType = 'patch') {
    if (!patch || typeof patch !== 'object') return trackerData;
    
    // Apply sanitization and migration to incoming trackerData first
    const sanitizedTrackerData = sanitizeTrackerData(trackerData);
    const updatedData = JSON.parse(JSON.stringify(sanitizedTrackerData));
    
    if (Array.isArray(updatedData.characters)) {
        Object.entries(patch).forEach(([charName, updates]) => {
            if (!updates || typeof updates !== 'object') return;

            // Process world state updates
            if (charName.toLowerCase() === 'world') {
                updatedData.worldState = updatedData.worldState || { date: '', time: '', location: '', weather: '', events: [] };
                if (updates.date !== undefined) updatedData.worldState.date = String(updates.date);
                if (updates.time !== undefined) updatedData.worldState.time = String(updates.time);
                if (updates.location !== undefined) updatedData.worldState.location = String(updates.location);
                if (updates.weather !== undefined) updatedData.worldState.weather = String(updates.weather);
                if (Array.isArray(updates.events)) {
                    const existingEvents = updatedData.worldState.events || [];
                    
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
                        
                        // 이름 기반 ID 부여
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
                            // 이미 동일한 이벤트가 존재하면 덮어쓰기 (중복 추가 방지)
                            mergedEvents[index] = { ...mergedEvents[index], ...newEvt };
                        } else {
                            // 존재하지 않으면 배열에 추가
                            mergedEvents.push(newEvt);
                        }
                    });
                    
                    updatedData.worldState.events = mergedEvents;
                }
                return;
            }


            

            const cleanCharId = cleanIdString(charName, 'char');
            let charIndex = updatedData.characters.findIndex(c => c.id === cleanCharId || c.name?.trim().toLowerCase() === charName.trim().toLowerCase());
            
            // Create and append a new character if it does not exist
            if (charIndex === -1) {
                const newChar = JSON.parse(JSON.stringify(getDefaultCharacters()[0]));
                newChar.id = cleanCharId;
                newChar.name = charName;
                newChar.activePlayer = updates.activePlayer !== undefined ? Boolean(updates.activePlayer) : isPlayer;
                
                // Remove default values (start empty and overwrite with LLM patch)
                newChar.statusSchema = [];
                newChar.status = {};
                newChar.profile = {};
                newChar.profileLocks = {};
                newChar.relations = {};
                
                if (updatedData.characters.length === 1 && 
                    updatedData.characters[0].id === 'char_user' && 
                    updatedData.characters[0].name === 'New') {
                    updatedData.characters = [newChar];
                } else {
                    updatedData.characters.push(newChar);
                }
                charIndex = updatedData.characters.length - 1;
            }


            
            
            const char = updatedData.characters[charIndex];

            // Process activePlayer switch updates
            if (updates.activePlayer !== undefined) {
                char.activePlayer = Boolean(updates.activePlayer);
            }
            
            // 1. Stats Patch (Supports backward compatibility if updates.status is present or directly given as an object)
            let statusUpdates = null;
            if (updates.status && typeof updates.status === 'object') {
                statusUpdates = updates.status;
            } else if (updates.stats && typeof updates.stats === 'object') {
                statusUpdates = updates.stats; // AI Hallucination & Legacy fallback
            } else if (!updates.status && !updates.stats && !updates.profile && !updates.relations && !updates.inventory && !updates.quests) {
                statusUpdates = updates; // Backward compatibility fallback
            }
            
            if (statusUpdates) {
                const statusSchema = char.statusSchema || [];
                const currentStatus = char.status || {};

                if (updateType === 'replace') {
                    // Replace Mode: Rebuild stats and statusSchema completely using only the keys present in patch
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
                        if (!targetId) targetId = 'status_' + Date.now();

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

                        nextStatusSchema.push({
                            id: targetId,
                            name: matchedSchema ? matchedSchema.name : patchKey,
                            type: finalType,
                            min: finalMin,
                            max: finalMax,
                            isLocked: isLocked,
                            isInject: isInject
                        });
                        nextStatus[targetId] = finalVal;
                    });

                    char.status = nextStatus;
                    char.statusSchema = nextStatusSchema;
                } else {
                    // Normal Patch Mode: Merge with existing schema and auto-add new fields
                    const newStatus = {};

                    // Build new stats object based on valid schema IDs only (apply sanitation)
                    statusSchema.forEach(schema => {
                        if (currentStatus[schema.id] !== undefined) {
                            newStatus[schema.id] = currentStatus[schema.id];
                        } else {
                            const minLimit = schema.min !== undefined && schema.min !== null ? schema.min : 0;
                            const maxLimit = schema.max !== undefined && schema.max !== null ? schema.max : 100;
                            newStatus[schema.id] = ['consumable'].includes(schema.type) ? maxLimit : minLimit;
                        }
                    });

                    // Match and assign patch data (ignore case and whitespace)
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
                            // Auto-add new fields if they do not exist in the schema
                            const newId = patchKey.trim() || 'status_' + Date.now();
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
                            
                            statusSchema.push({
                                id: newId,
                                name: patchKey,
                                type: newType,
                                min: parsedMin !== null ? parsedMin : 0,
                                max: parsedMax !== null ? parsedMax : 100,
                                isLocked: false,
                                isInject: true
                            });
                            newStatus[newId] = finalVal;
                        }
                    });
                    char.status = newStatus;
                    char.statusSchema = statusSchema;
                }
            }

            // 2. Profile 패치 (Race, Height, Appearance 등)
            if (updates.profile && typeof updates.profile === 'object') {
                char.profileLocks = char.profileLocks || {};

                if (updateType === 'replace') {
                    const nextProfile = {};
                    // Keep only locked profile values
                    Object.entries(char.profile || {}).forEach(([pKey, pVal]) => {
                        if (char.profileLocks[pKey] === true) {
                            nextProfile[pKey] = pVal;
                        }
                    });
                    // Overwrite with patch values
                    Object.entries(updates.profile).forEach(([pKey, pVal]) => {
                        const isLocked = char.profileLocks[pKey] === true;
                        if (!isLocked && pVal !== undefined && pVal !== null) {
                            nextProfile[pKey] = String(pVal);
                        }
                    });
                    char.profile = nextProfile;
                } else {
                    char.profile = char.profile || {};
                    Object.entries(updates.profile).forEach(([pKey, pVal]) => {
                        const isLocked = char.profileLocks[pKey] === true;
                        if (!isLocked && pVal !== undefined && pVal !== null) {
                            char.profile[pKey] = String(pVal);
                        }
                    });
                }
            }

            // 3. Inventory 패치 (Equipment, Storage)
            if (updates.inventory && typeof updates.inventory === 'object') {
                char.inventory = char.inventory || {};
                
                // Equipment
                if (updates.inventory.equipment && typeof updates.inventory.equipment === 'object') {
                    const isEquipLocked = char.inventory.equipIsLocked === true;
                    if (!isEquipLocked) {
                        char.inventory.equipment = char.inventory.equipment || {};
                        Object.entries(updates.inventory.equipment).forEach(([slot, itemVal]) => {
                            if (itemVal === 'Empty' || !itemVal) {
                                char.inventory.equipment[slot] = null;
                            } else {
                                const itemName = typeof itemVal === 'object' ? (itemVal.name || 'Unknown') : String(itemVal);
                                char.inventory.equipment[slot] = { name: itemName };
                            }
                        });
                    }
                }

                // Storage
                if (updates.inventory.storage && typeof updates.inventory.storage === 'object') {
                    const isStorageLocked = char.inventory.storageIsLocked === true;
                    if (!isStorageLocked) {
                        char.inventory.storage = char.inventory.storage || {};
                        Object.entries(updates.inventory.storage).forEach(([container, items]) => {
                            if (Array.isArray(items)) {
                                char.inventory.storage[container] = items.map(item => {
                                    if (typeof item === 'string') {
                                        const qtyMatch = item.match(/^([\s\S]*?)x(\d+)$/);
                                        if (qtyMatch) {
                                            return { name: qtyMatch[1].trim(), quantity: parseInt(qtyMatch[2], 10) || 1 };
                                        }
                                        return { name: item, quantity: 1 };
                                    } else if (item && typeof item === 'object') {
                                        return { name: item.name || 'Unknown', quantity: item.quantity || 1 };
                                    }
                                    return null;
                                }).filter(Boolean);
                            }
                        });
                    }
                }
            }

            // 4. Quests 패치
            if (updates.quests && typeof updates.quests === 'object') {
                char.quests = char.quests || {};
                
                // Main Quest
                if (updates.quests.main && typeof updates.quests.main === 'object') {
                    char.quests.main = char.quests.main || {};
                    if (!char.quests.main.isLocked) {
                        if (updates.quests.main.name !== undefined) char.quests.main.name = String(updates.quests.main.name);
                        if (updates.quests.main.description !== undefined) char.quests.main.desc = String(updates.quests.main.description);
                    }
                }
                
                // Side Quests
                if (Array.isArray(updates.quests.sideQuests)) {
                    const existingSides = char.quests.sides || [];
                    const lockedSides = existingSides.filter(q => q.isLocked);
                    
                    const parsedNewSides = updates.quests.sideQuests.map(sq => {
                        let qName = 'Unknown';
                        let qDesc = '';
                        let isCompleted = false;
                        
                        if (typeof sq === 'string') {
                            qName = sq;
                        } else if (sq && typeof sq === 'object') {
                            qName = sq.name || 'Unknown';
                            qDesc = sq.description || '';
                            isCompleted = sq.status === 'COMPLETED' || sq.isCompleted === true;
                        }
                        
                        const id = cleanIdString(qName, 'quest');
                        return { 
                            id, 
                            name: qName, 
                            desc: qDesc,
                            isCompleted,
                            isLocked: false
                        };
                    }).filter(Boolean);

                    const finalSides = [...lockedSides];
                    parsedNewSides.forEach(newQ => {
                        const isLockedMatch = lockedSides.some(lockedQ => 
                            (newQ.id && lockedQ.id === newQ.id) || 
                            lockedQ.name.trim().toLowerCase() === newQ.name.trim().toLowerCase()
                        );
                        if (!isLockedMatch) {
                            finalSides.push(newQ);
                        }
                    });

                    char.quests.sides = finalSides;
                }
            }

            // 5. Relations 패치
            if (updates.relations && typeof updates.relations === 'object') {
                if (updateType === 'replace') {
                    const nextRelations = {};
                    // Keep only locked relations
                    Object.entries(char.relations || {}).forEach(([targetName, rData]) => {
                        if (rData && rData.isLocked) {
                            nextRelations[targetName] = rData;
                        }
                    });
                    char.relations = nextRelations;
                } else {
                    char.relations = char.relations || {};
                }
                
                Object.entries(updates.relations).forEach(([targetName, rData]) => {
                    if (!rData || typeof rData !== 'object') return;
                    
                    const existingRelation = char.relations[targetName] || { text: '', isLocked: false, isInject: true, values: {} };
                    if (existingRelation.isLocked) return;

                    if (rData.description !== undefined) {
                        existingRelation.text = String(rData.description);
                    }
                    
                    if (rData.metrics && typeof rData.metrics === 'object') {
                        existingRelation.values = existingRelation.values || {};
                        Object.entries(rData.metrics).forEach(([mName, rawMVal]) => {
                            const metaInfo = parseMetadata(rawMVal);
                            const mVal = metaInfo.value;
                            
                            const parsedInt = parseInt(mVal, 10);
                            const finalVal = !isNaN(parsedInt) ? parsedInt : String(mVal);
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

                    // targetDescription 및 targetMetrics 패치 처리 (상대 카드가 존재하지 않는 경우의 독립 쌍방 데이터)
                    if (rData.targetDescription !== undefined) {
                        existingRelation.targetText = String(rData.targetDescription);
                    }

                    if (rData.targetMetrics && typeof rData.targetMetrics === 'object') {
                        existingRelation.targetValues = existingRelation.targetValues || {};
                        Object.entries(rData.targetMetrics).forEach(([tmName, rawMVal]) => {
                            const metaInfo = parseMetadata(rawMVal);
                            const mVal = metaInfo.value;
                            
                            const parsedInt = parseInt(mVal, 10);
                            const finalVal = !isNaN(parsedInt) ? parsedInt : String(mVal);
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
        });

        // 실존하는 캐릭터 카드 간의 전역 크로스 동기화 (백그라운드 스마트 상호 교차 동기화)
        updatedData.characters.forEach(char => {
            if (!char.relations) return;
            
            Object.entries(char.relations).forEach(([targetName, rData]) => {
                // targetName이 실존하는 캐릭터 카드인지 검사 (대소문자 무시)
                const targetChar = updatedData.characters.find(c => c.name?.trim().toLowerCase() === targetName.trim().toLowerCase());
                
                if (targetChar) {
                    // CharA 가 가진 CharB를 향한 targetText/targetValues 가 존재한다면, 
                    // 실존하는 CharB의 relations["CharA"] 에 덮어씌워 동기화해 줍니다.
                    targetChar.relations = targetChar.relations || {};
                    
                    // 상대방 카드에 주인공을 향한 관계 데이터가 없을 경우 초기화해서 추가해 줌
                    if (!targetChar.relations[char.name]) {
                        targetChar.relations[char.name] = { text: '', isLocked: false, isInject: true, values: {} };
                    }
                    
                    const targetRel = targetChar.relations[char.name];
                    
                    // CharA의 targetText가 정의되어 있다면 CharB의 text로 동기화
                    if (rData.targetText !== undefined) {
                        targetRel.text = rData.targetText;
                    }
                    
                    // CharA의 targetValues가 정의되어 있다면 CharB의 values로 동기화
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
    
    return updatedData;
}

/**
 * 1. Defensive Merge
 * Merges past data while maintaining structural integrity of the Master Schema.
 */
export function defensiveMerge(masterSchema, backupData) {
    if (!backupData) return masterSchema;

    const merged = { ...masterSchema };

    // 1. Restore simple key-value data (protect default values first)
    Object.keys(masterSchema).forEach(key => {
        if (backupData[key] !== undefined) {
            if (key === 'characters' && Array.isArray(masterSchema.characters) && Array.isArray(backupData.characters)) {
                // Merge characters individually to prevent missing internal schemas
                merged.characters = backupData.characters.map(backupChar => {
                    const masterChar = masterSchema.characters.find(c => c.id === backupChar.id) || {};
                    const cleanBackupChar = migrateCharacterSchema(backupChar);
                    const cleanMasterChar = migrateCharacterSchema(masterChar);
                    return {
                        ...cleanMasterChar,
                        ...cleanBackupChar,
                        // Restore static schemas missing in backupChar
                        statusSchema: cleanBackupChar.statusSchema || cleanMasterChar.statusSchema,
                        // Deep merge of state objects
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
                // Shallow merge for nested objects (e.g., worldState)
                merged[key] = { ...masterSchema[key], ...backupData[key] };
            } else {
                merged[key] = backupData[key];
            }
        }
    });

    // 2. Restore dynamic manual array data (inventory, quests, etc.)
    if (Array.isArray(backupData.inventory)) merged.inventory = [...backupData.inventory];
    if (Array.isArray(backupData.quests)) merged.quests = [...backupData.quests];

    return merged;
}

/**
 * 2. Sliding Window Purge
 * (Modified: Keep JSON text inside the message body intact to comply with retention requests.)
 */
export function purgeOldBackups(chat, maxKeep = DEFAULT_MAX_KEEP) {
    if (!Array.isArray(chat)) return;
    
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
            
            // Cleanup extra memory overhead of older messages exceeding max count (original message mes text is preserved)
            if (foundCount > maxKeep) {
                delete message.swipe_info[swipeId].extra.rpgTrackerData;
            }
        }
    }
}

/**
 * 3. Attach JSON backup to the latest message (utilizes message.swipe_info.extra)
 */
export function backupToMessage(chat, index, trackerData, updateMessageFn, saveChatFn, maxKeep = DEFAULT_MAX_KEEP) {
    if (!Array.isArray(chat) || index < 0 || !chat[index]) return;

    const targetMessage = chat[index];

    const strippedData = stripStaticData(trackerData);
    
    let swipeId = targetMessage.swipe_id || 0;
    if (targetMessage.swipes && targetMessage.swipes.length > 0 && typeof targetMessage.mes === 'string') {
        const foundIdx = targetMessage.swipes.findIndex(s => s === targetMessage.mes);
        if (foundIdx !== -1) swipeId = foundIdx;
    }

    if (!Array.isArray(targetMessage.swipe_info)) {
        targetMessage.swipe_info = [];
    }
    if (!targetMessage.swipe_info[swipeId]) {
        targetMessage.swipe_info[swipeId] = { extra: {} };
    }
    if (!targetMessage.swipe_info[swipeId].extra) {
        targetMessage.swipe_info[swipeId].extra = {};
    }

    targetMessage.swipe_info[swipeId].extra.rpgTrackerData = strippedData;

    purgeOldBackups(chat, maxKeep);

    if (typeof saveChatFn === 'function') {
        saveChatFn();
    }
}

/**
 * 4. Rehydrate from History (Rehydrate from extra & sequential text fallback)
 */
export function rehydrateFromHistory(chat) {
    if (!Array.isArray(chat) || chat.length === 0) return null;

    // Step 1: Scan backward to find if an extra backup (full snapshot) exists (O(1) optimization path)
    for (let i = chat.length - 1; i >= 0; i--) {
        const message = chat[i];
        if (!message) continue;

        let swipeId = message.swipe_id || 0;
        if (message.swipes && message.swipes.length > 0 && typeof message.mes === 'string') {
            const foundIdx = message.swipes.findIndex(s => s === message.mes);
            if (foundIdx !== -1) swipeId = foundIdx;
        }

        if (message.swipe_info && message.swipe_info[swipeId] && message.swipe_info[swipeId].extra && message.swipe_info[swipeId].extra.rpgTrackerData) {
            // Return immediately if the data is a valid trackerData shape (contains characters field)
            const extraData = message.swipe_info[swipeId].extra.rpgTrackerData;
            if (extraData && typeof extraData === 'object' && extraData.characters !== undefined) {
                return sanitizeTrackerData(extraData);
            }
        }
    }

    // Step 2: If extra backup is lost, rebuild state by sequentially applying patches from the first message forward
    let accumulatedData = null;
    let anyUpdateApplied = false;

    for (let i = 0; i < chat.length; i++) {
        const message = chat[i];
        if (!message || typeof message.mes !== 'string') continue;

        // Comment extraction helper function
        const extractJsonFromComment = (text) => {
            const trackerRegex = /<!--RPG_TRACKER:?([\s\S]*?)-->/g;
            let match;
            while ((match = trackerRegex.exec(text)) !== null) {
                let innerText = match[1].trim();
                const markdownJsonRegex = /```(?:json|markdown)?\s*\n?(\{[\s\S]*?\})\s*\n?```/i;
                const mdMatch = innerText.match(markdownJsonRegex);
                if (mdMatch) {
                    innerText = mdMatch[1].trim();
                }
                try {
                    const parsed = JSON.parse(innerText);
                    if (parsed && typeof parsed === 'object') return parsed;
                } catch (e) {}
            }

            const legacyRegex = /<!--RPG_DATA:([\s\S]*?)-->/g;
            let legacyMatch;
            while ((legacyMatch = legacyRegex.exec(text)) !== null) {
                try {
                    const parsed = JSON.parse(legacyMatch[1]);
                    if (parsed && typeof parsed === 'object') return parsed;
                } catch (e) {}
            }
            return null;
        };

        const parsed = extractJsonFromComment(message.mes);
        if (parsed) {
            // If the parsed data is a full snapshot structure (exceptionally when a snapshot was included in the text, etc.)
            if (parsed.characters !== undefined) {
                accumulatedData = JSON.parse(JSON.stringify(parsed));
                anyUpdateApplied = true;
            } else {
                // Apply cumulatively if it is in a patch format
                if (!accumulatedData) {
                    accumulatedData = getInitialTrackerData();
                }
                accumulatedData = applyLLMPatch(accumulatedData, parsed);
                anyUpdateApplied = true;
            }
        }
    }

    return anyUpdateApplied ? sanitizeTrackerData(accumulatedData) : null;
}
