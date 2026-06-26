// src/core/ActivePrompt.js

/**
 * [1-2] 정의 프롬프트 최종 문자열 생성
 */
export function buildStaticDefinitionsPrompt(trackerData) {
  const globalDefs = trackerData.globalDefinitions || {};
  const lines = [];

  Object.entries(globalDefs).forEach(([key, guide]) => {
    if (guide && guide.trim() !== '') {
      let prefix = '';
      let fieldName = '';
      if (key.startsWith('stat_')) {
        prefix = 'Stat';
        fieldName = key.replace('stat_', '');
      } else if (key.startsWith('profile_')) {
        prefix = 'Profile';
        fieldName = key.replace('profile_', '');
      } else if (key.startsWith('relation_')) {
        prefix = 'Relation';
        fieldName = key.replace('relation_', '');
      }

      if (prefix) {
        lines.push(`[${prefix}: ${fieldName}] Guide: ${guide.trim()}`);
      }
    }
  });

  if (lines.length === 0) return '';

  return `\n### RPG TRACKER - STAT DEFINITIONS\n` +
         `The following parameters govern active characters. Interpret behaviors based on these guidelines:\n` +
         `${lines.join('\n')}\n`;
}

/**
 * 마스터 스위치 상태를 가져오는 헬퍼 함수
 */
export function getMasterSwitches(guidePrompts = []) {
  const isEnabled = (id, def = true) => {
    const found = guidePrompts.find(g => g.id === id);
    return found ? found.enabled : def;
  };

  return {
    stats: isEnabled('stats', true),
    profile: isEnabled('profile', true),
    relations: isEnabled('relations', true),
    inventory: isEnabled('inventory', true),
    quests: isEnabled('quests', true),
    world_date: isEnabled('world_date', true),
    world_time: isEnabled('world_time', true),
    world_weather: isEnabled('world_weather', true),
    world_location: isEnabled('world_location', true),
    world_events: isEnabled('world_events', true)
  };
}

/**
 * 동적 JSON 스키마 예시 생성
 */
export function getDynamicSchemaExample(trackerData, forcePlayer = null) {
  const guidePrompts = trackerData.guidePrompts || [];
  const characters = trackerData.characters || [];
  const ms = getMasterSwitches(guidePrompts);

  // forcePlayer가 명시적으로 불리언으로 주어지면 그에 맞게 hasActivePlayer를 결정하고, 그렇지 않으면 기본 탐색 방식을 따름
  const hasActivePlayer = forcePlayer !== null 
    ? forcePlayer 
    : characters.some(char => char.isActive !== false && char.activeInjection !== false && char.activePlayer === true);

  const charSchema = {};

  if (forcePlayer !== null) {
    charSchema.activePlayer = forcePlayer;
  }

  if (ms.stats) {
    charSchema.stats = {
      "stat_id_1": "new_value (type: consumable, min: 0, max: 100. e.g. HP - reduce on damage, increase on rest)",
      "stat_id_2": "new_value (type: stacking, min: 0, max: 100. e.g. Fatigue - increase on strenuous actions)",
      "stat_id_3": "new_value (type: integer, min: 0, max: 100)",
      "stat_id_4": "new_value (type: text. extremely short current condition)"
    };
  }

  if (ms.profile) {
    charSchema.profile = { "Profile_Key": "new_value" };
  }

  if (ms.relations) {
    const relType = trackerData.worldSchema?.relationsFieldType || 'integer';
    if (relType === 'none') {
      charSchema.relations = {
        "Target Name": {
          "description": "Brief summary of emotions/impressions toward Target Name",
          "targetDescription": "Brief summary of how Target Name feels about this character (use ONLY for minor/one-time NPCs with no separate card)"
        }
      };
    } else {
      charSchema.relations = {
        "Target Name": {
          "description": "Brief summary of emotions/impressions toward Target Name",
          "metrics": { "Metric_Name": `new_value (type: ${relType}. adjust dynamically by -15 to +15 based on interaction)` },
          "targetDescription": "Brief summary of how Target Name feels about this character (use ONLY for minor/one-time NPCs with no separate card)",
          "targetMetrics": { "Metric_Name": `new_value (type: ${relType}) (use ONLY for minor/one-time NPCs with no separate card)` }
        }
      };
    }
  }

  if (ms.inventory && hasActivePlayer) {
    charSchema.inventory = {
      "equipment": { "Slot": "Item Name" },
      "storage": { "Container": [ "Item Name" ] }
    };
  }

  if (ms.quests && hasActivePlayer) {
    charSchema.quests = {
      "main": { "name": "Quest Name", "description": "Details" },
      "sideQuests": [ { "name": "Side Quest", "description": "Details" } ]
    };
  }

  const fullSchema = {
    "Character Name": charSchema
  };

  const worldFields = {};
  const wSchema = trackerData.worldSchema || {};

  if (ms.world_date) worldFields["date"] = wSchema.dateCustom || "";
  if (ms.world_time) worldFields["time"] = wSchema.timeCustom || "";
  if (ms.world_weather) worldFields["weather"] = wSchema.weatherCustom || "";
  if (ms.world_location) worldFields["location"] = wSchema.locationCustom || "";
  if (ms.world_events) worldFields["events"] = [{ "name": "Event Name", "desc": "Details" }];

  if (Object.keys(worldFields).length > 0) {
    fullSchema["World"] = worldFields;
  }

  return `\n<!--RPG_TRACKER\n\`\`\`json\n${JSON.stringify(fullSchema, null, 2)}\n\`\`\`\n-->\n`;
}

/**
 * [2] 동적 상태값 생성
 * - 체크가 켜진 캐릭터의 실시간 수치, 프로필, 관계 데이터를 JSON 형식으로 가공하여 전송합니다.
 * - 마스터 스위치 상태를 우선하여 필터링합니다.
 */
export function buildDynamicValuesPrompt(trackerData) {
  const characters = trackerData.characters || [];
  const ms = getMasterSwitches(trackerData.guidePrompts || []);
  const activeData = {};

  // World State
  const worldFields = {};
  if (trackerData.worldState) {
    const ws = trackerData.worldState;
    if (ms.world_date) worldFields["date"] = ws.date || "";
    if (ms.world_time) worldFields["time"] = ws.time || "";
    if (ms.world_weather) worldFields["weather"] = ws.weather || "";
    if (ms.world_location) worldFields["location"] = ws.location || "";
    if (ms.world_events) {
      worldFields["events"] = Array.isArray(ws.events) ? ws.events.map(e => typeof e === 'string' ? { name: '', desc: e } : { name: e.name || '', desc: e.desc || '' }).slice(-5) : [];
    }
  }
  
  if (Object.keys(worldFields).length > 0) {
    activeData["World"] = worldFields;
  }

  characters.forEach((char) => {
    if (char.isActive !== false && char.activeInjection !== false) {
      const charInfo = {};
      const lockedFields = [];

      // 1. Stats
      if (ms.stats) {
        const schemas = char.statsSchema || [];
        const statsMap = char.stats || {};
        const statsObj = {};

        schemas.forEach((schema) => {
          if (schema.isInject !== false) {
            const value = statsMap[schema.id];
            const displayVal = value !== undefined 
              ? value 
              : (['stacking', 'consumable'].includes(schema.type) ? (schema.max || 100) : 0);
            
            statsObj[schema.id] = displayVal;

            if (schema.isLocked) {
              lockedFields.push(`stats.${schema.id}`);
            }
          }
        });
        if (Object.keys(statsObj).length > 0) {
          charInfo.stats = statsObj;
        }
      }

      // 2. Profile
      if (ms.profile) {
        const profile = char.featuresData?.profile || {};
        const profileInjects = char.featuresData?.profileInjects || {};
        const profileLocks = char.featuresData?.profileLocks || {};
        const profileObj = {};
        
        Object.keys(profile).forEach(key => {
          if (profileInjects[key] !== false) {
            profileObj[key] = profile[key];
            if (profileLocks[key]) {
              lockedFields.push(`profile.${key}`);
            }
          }
        });
        if (Object.keys(profileObj).length > 0) {
          charInfo.profile = profileObj;
        }
      }

      // 3. Relations
      if (ms.relations) {
        const relations = char.relations || {};
        const relationsObj = {};
        const existingCharNames = characters.map(c => c.name?.trim());
        Object.entries(relations).forEach(([targetName, rData]) => {
          if (rData.isInject !== false) {
            const metrics = {};
            if (rData.values) {
              Object.entries(rData.values).forEach(([mName, mVal]) => {
                const isObj = typeof mVal === 'object' && mVal !== null;
                metrics[mName] = isObj ? mVal.value : mVal;
              });
            }
            relationsObj[targetName] = {
              metrics,
              description: rData.text || ""
            };

            // 상대방 캐릭터가 실존하지 않는 경우 독립 쌍방 데이터(targetText, targetValues)를 추가로 인젝션해 줍니다.
            if (!existingCharNames.includes(targetName?.trim())) {
              if (rData.targetText) {
                relationsObj[targetName].targetDescription = rData.targetText;
              }
              if (rData.targetValues) {
                const targetMetrics = {};
                Object.entries(rData.targetValues).forEach(([tmName, tmVal]) => {
                  const isObj = typeof tmVal === 'object' && tmVal !== null;
                  targetMetrics[tmName] = isObj ? tmVal.value : tmVal;
                });
                if (Object.keys(targetMetrics).length > 0) {
                  relationsObj[targetName].targetMetrics = targetMetrics;
                }
              }
            }

            if (rData.isLocked) {
              lockedFields.push(`relations.${targetName}`);
            }
          }
        });
        if (Object.keys(relationsObj).length > 0) {
          charInfo.relations = relationsObj;
        }
      }

      // 4. Inventory & Quests (Only for activePlayer and if Master Switches are ON)
      if (char.activePlayer === true) {
        // Inventory
        if (ms.inventory) {
          const inventory = char.featuresData?.inventory;
          if (inventory) {
            const equip = inventory.equipment || {};
            const storage = inventory.storage || {};
            const invObj = {};
            
            if (inventory.equipIsInject !== false) {
              const equipObj = {};
              Object.entries(equip).forEach(([slot, item]) => {
                equipObj[slot] = item ? item.name : 'Empty';
              });
              invObj.equipment = equipObj;
              if (inventory.equipIsLocked) lockedFields.push(`inventory.equipment`);
            }

            if (inventory.storageIsInject !== false) {
              const storageObj = {};
              Object.entries(storage).forEach(([container, items]) => {
                storageObj[container] = (Array.isArray(items) ? items : []).map(i => {
                  return i.quantity > 1 ? `${i.name}x${i.quantity}` : i.name;
                });
              });
              invObj.storage = storageObj;
              if (inventory.storageIsLocked) lockedFields.push(`inventory.storage`);
            }

            if (Object.keys(invObj).length > 0) {
              charInfo.inventory = invObj;
            }
          }
        }

        // Quests
        if (ms.quests) {
          const quests = char.featuresData?.quests;
          if (quests) {
             const questObj = {
               main: {
                 name: quests.main?.name || '',
                 description: quests.main?.desc || '',
                 status: quests.main?.isCompleted ? 'COMPLETED' : 'ACTIVE'
               },
               sideQuests: (quests.sides || []).map(q => ({ 
                 name: q.name, 
                 description: q.desc || '',
                 status: q.isCompleted ? 'COMPLETED' : 'ACTIVE'
               }))
             };
             charInfo.quests = questObj;
             
             if (quests.main?.isLocked) {
               lockedFields.push('quests.main');
             }
             (quests.sides || []).forEach((q, qIdx) => {
               if (q.isLocked) {
                 lockedFields.push(`quests.sideQuests.${qIdx}`);
               }
             });
          }
        }
      }

      if (lockedFields.length > 0) {
        charInfo._lockedFields = lockedFields;
      }

      if (Object.keys(charInfo).length > 0) {
        activeData[char.name] = charInfo;
      }
    }
  });

  if (Object.keys(activeData).length === 0) return '';

  return `\n[RPG Live Status]\n\`\`\`json\n${JSON.stringify(activeData, null, 2)}\n\`\`\`\n`;
}

/**
 * [3] 최종 시스템/정의 프롬프트 생성 (STORY_STRING 주입용)
 */
export function buildDefinitionPromptWrapper(trackerData, headerPrompt = '', footerPrompt = '', forcePlayer = null) {
  const staticDefs = buildStaticDefinitionsPrompt(trackerData) || '';
  
  // 커스텀 가이드 프롬프트 & 애드온 프롬프트 처리
  const guidePromptsData = trackerData.guidePrompts || [];
  const activeGuides = guidePromptsData.filter(g => g.enabled && g.prompt && g.prompt.trim() !== '').map(g => `- ${g.prompt.trim()}`);
  
  const addons = trackerData.addons || {};
  if (addons.cyoa) activeGuides.push("- CYOA Mode: Act as an interactive adventure where you present choices to the player at the end of each response.");
  if (addons.weather) activeGuides.push("- Dynamic Weather: Include weather changes and environmental descriptions.");
  if (addons.worldEvents) activeGuides.push("- World Events: Generate random world events that affect the current situation.");
  
  const addonSection = activeGuides.length > 0 
    ? `\n### SPECIAL INSTRUCTIONS / ACTIVE ADD-ONS\n${activeGuides.join('\n')}\n` 
    : '';

  // 동적 스키마 생성
  const schemaBlock = getDynamicSchemaExample(trackerData, forcePlayer);

  const finalPrompt = [
    headerPrompt,
    schemaBlock,
    footerPrompt,
    addonSection,
    staticDefs
  ].filter(part => part && part.trim() !== '').join('\n');

  return finalPrompt;
}

/**
 * [4] 최종 상태 프롬프트 생성 (IN_CHAT 주입용)
 */
export function buildStatusPromptWrapper(trackerData) {
  const dynamicVals = buildDynamicValuesPrompt(trackerData);
  return dynamicVals;
}
