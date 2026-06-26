// src/core/PromptSchema.js

export const DEFAULT_SCHEMAS = [
  { id: 'hp', name: 'HP', type: 'consumable', min: 0, max: 100, color: '#e74c3c', isLocked: false, isInject: true },
  { id: 'fatigue', name: 'Fatigue', type: 'stacking', min: 0, max: 100, color: '#f39c12', isLocked: false, isInject: true },
  { id: 'level', name: 'Lv', type: 'integer', min: 1, max: 100, isLocked: false, isInject: true },
  { id: 'condition', name: 'Condition', type: 'text', isLocked: false, isInject: true }
];

export const DEFAULT_STATS = { hp: 100, fatigue: 0, level: 1, condition: '' };

export const DEFAULT_WORLD_STATE = {
  date: '',
  time: '',
  location: '',
  weather: '',
  events: []
};

export const DEFAULT_WORLD_SCHEMA = {
  dateSelect: '1',
  dateCustom: 'yyyy-mm-dd',
  timeSelect: '1',
  timeCustom: '14:30',
  weatherSelect: '1',
  weatherCustom: 'Clear/Cloudy/Rain/Snow',
  locationCustom: 'Current Location',
  relationsFieldType: 'integer'
};

export const DEFAULT_GUIDE_PROMPTS = [
  { id: 'stats', name: 'Update Stats', prompt: 'Update active stats (like HP, Fatigue, level, condition, etc.) based on action outcomes, damage taken, or roleplay events in the chat.', enabled: true },
  { id: 'profile', name: 'Update Profile', prompt: 'Dynamically generate, update, or remove unlocked profile fields and stats based on character cards, user persona, or chat context.', enabled: true },
  { id: 'relations', name: 'Update Relations', prompt: 'Reflect the latest changes in emotions, relationship metrics, and impressions. If the target is a minor/one-time NPC (no separate character card exists), you can also update "targetDescription" (how they feel about this character) and "targetMetrics" (their metrics toward this character) directly within this relation.', enabled: true },
  { id: 'inventory', name: 'Update Inventory', prompt: 'If any items or equipment are acquired or lost, update the inventory and storage accordingly.', enabled: true },
  { id: 'quests', name: 'Update Quests', prompt: 'If there is progress or a change in ongoing quests, update the quest list.', enabled: true },
  { id: 'world_date', name: 'Update Date', prompt: 'Update world date.', enabled: true },
  { id: 'world_time', name: 'Update Time', prompt: 'Update world time.', enabled: true },
  { id: 'world_weather', name: 'Update Weather', prompt: 'Update world weather.', enabled: true },
  { id: 'world_location', name: 'Update Location', prompt: 'Update world location.', enabled: true },
  { id: 'world_events', name: 'Update Events', prompt: 'Update world events.', enabled: true }
];

export const getDefaultCharacters = () => {
  return [
    {
      id: 'char_user',
      name: 'New',
      activePlayer: true,
      activeInjection: true,
      statsSchema: JSON.parse(JSON.stringify(DEFAULT_SCHEMAS)),
      stats: JSON.parse(JSON.stringify(DEFAULT_STATS)),
      featuresData: {
        profile: { Race: '', Height: '', Appearance: '' },
        profileLocks: { Race: false, Height: false, Appearance: false },
        inventory: {
          equipIsLocked: false,
          equipIsInject: true,
          storageIsLocked: false,
          storageIsInject: true,
          equipment: { 'Right Hand': null, 'Left Hand': null },
          storage: { 'Backpack': [] }
        },
        quests: {
          main: { name: '', desc: '' },
          sides: []
        }
      },
      relations: {
        'Target Example': {
          text: '',
          isLocked: false,
          isInject: true,
          values: { 'Affection': { value: 0, type: 'integer' } }
        }
      }
    }
  ];
};

export const DEFAULT_ADD_CHAR_PROMPT = `Based on the chat log, create a profile for the character. Create suitable stats, profile features, and relations (including 'targetDescription' to define what the target thinks about this character) that fit their role. Return the result as a JSON block wrapped in an HTML comment with the identifier RPG_TRACKER. Omit inventory and quests unless necessary.`;

export const DEFAULT_ADD_PLAYER_CHAR_PROMPT = `Based on the chat log, create a profile for the player character. Create suitable stats, profile features, relations (including 'targetDescription' to define what the target thinks about this character), starting inventory, and initial quests that fit their role. Return the result as a JSON block wrapped in an HTML comment with the identifier RPG_TRACKER.`;

export const getInitialTrackerData = () => {
  return {
    characters: getDefaultCharacters(),
    worldState: JSON.parse(JSON.stringify(DEFAULT_WORLD_STATE)),
    worldSchema: JSON.parse(JSON.stringify(DEFAULT_WORLD_SCHEMA)),
    guidePrompts: JSON.parse(JSON.stringify(DEFAULT_GUIDE_PROMPTS)),
    globalDefinitions: {},
    systemPromptHeader_merged: DEFAULT_PROMPT_HEADER_MERGED,
    systemPromptFooter_merged: DEFAULT_PROMPT_FOOTER_MERGED,
    systemPromptHeader_separated: DEFAULT_PROMPT_HEADER_SEP,
    systemPromptFooter_separated: DEFAULT_PROMPT_FOOTER_SEP,
    addons: { weather: false, worldEvents: false, cyoa: false },
    addCharPrompt: DEFAULT_ADD_CHAR_PROMPT,
    addPlayerCharPrompt: DEFAULT_ADD_PLAYER_CHAR_PROMPT
  };
};

export const DEFAULT_PROMPT_HEADER_MERGED = `[RPG STATUS TRACKER SYSTEM]
At the VERY BEGINNING of your response, you MUST output a JSON code block wrapped inside an HTML comment with the 'RPG_TRACKER' identifier.
Strictly follow this layout:`;

export const DEFAULT_PROMPT_FOOTER_MERGED = `[SYSTEM RULES & GUIDELINES]
1. ROLE: Act as the Game Master. Analyze the latest chat log to logical-deduct and update status parameters.
2. REASONING RULES (CRITICAL):
   - HP/Fatigue: Deduct HP on physical harm (-5 to -30). Increase Fatigue on strenuous actions (+5 to +20).
   - Relations: Shift metrics (e.g., Affection) based on conversation tone (Friendly: +1 to +5, Hostile: -5 to -15). Never jump values abruptly unless extreme events occur.
   - Condition/State: Keep text condition extremely concise (e.g., "Healthy", "Exhausted", "Injured (Left Leg)").
3. DYNAMIC UPDATES & MINOR NPCS: Freely add, update, or remove unlocked stats, profiles, and relations. If a target NPC has no separate character card, dynamically update "targetDescription" (what NPC thinks about this character) and "targetMetrics" directly within their relation object to reflect the interaction.
4. LOCK PROTECTION: Absolutely DO NOT change, update, or delete any element listed in '_lockedFields'. Keep them exactly as they are.
5. OPTIMIZATION: Omit entire sections (like 'inventory' or 'quests') if absolutely NO updates occurred.
6. RESPONSE FLOW: Place the JSON HTML comment block at the VERY TOP. Write your normal roleplay response immediately after it. Do not prefix the JSON block with any commentary.`;

export const DEFAULT_PROMPT_HEADER_SEP = `[RPG STATUS TRACKER SYSTEM]
You MUST output ONLY a JSON code block wrapped inside an HTML comment with the 'RPG_TRACKER' identifier.
Strictly follow this layout:`;

export const DEFAULT_PROMPT_FOOTER_SEP = `[SYSTEM RULES & GUIDELINES]
1. ROLE: Act as the Game Master. Analyze the latest chat log to logical-deduct and update status parameters.
2. REASONING RULES (CRITICAL):
   - HP/Fatigue: Deduct HP on physical harm (-5 to -30). Increase Fatigue on strenuous actions (+5 to +20).
   - Relations: Shift metrics (e.g., Affection) based on conversation tone (Friendly: +1 to +5, Hostile: -5 to -15). Never jump values abruptly unless extreme events occur.
   - Condition/State: Keep text condition extremely concise (e.g., "Healthy", "Exhausted", "Injured (Left Leg)").
3. DYNAMIC UPDATES & MINOR NPCS: Freely add, update, or remove unlocked stats, profiles, and relations. If a target NPC has no separate character card, dynamically update "targetDescription" (what NPC thinks about this character) and "targetMetrics" directly within their relation object to reflect the interaction.
4. LOCK PROTECTION: Absolutely DO NOT change, update, or delete any element listed in '_lockedFields'. Keep them exactly as they are.
5. OPTIMIZATION: Omit entire sections (like 'inventory' or 'quests') if absolutely NO updates occurred.
6. OUTPUT LIMIT: Output ONLY the JSON block. Do not write any normal roleplay response or conversational text.`;
