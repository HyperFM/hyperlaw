/** Voice-friendly nickname pairs — chosen to be easily recognizable by phone dictation. */
export const VOICE_NICKNAMES: ReadonlyArray<{ word: string; emoji: string }> = [
  { word: "Pickle",   emoji: "🥒" },
  { word: "Tiger",    emoji: "🐯" },
  { word: "Peanut",   emoji: "🥜" },
  { word: "Apple",    emoji: "🍎" },
  { word: "Monster",  emoji: "👾" },
  { word: "Rocket",   emoji: "🚀" },
  { word: "Lemon",    emoji: "🍋" },
  { word: "Pebble",   emoji: "🪨" },
  { word: "River",    emoji: "🌊" },
  { word: "Cloud",    emoji: "☁️" },
  { word: "Maple",    emoji: "🍁" },
  { word: "Anchor",   emoji: "⚓" },
  { word: "Olive",    emoji: "🫒" },
  { word: "Cookie",   emoji: "🍪" },
  { word: "Button",   emoji: "🔵" },
  { word: "Pumpkin",  emoji: "🎃" },
  { word: "Penguin",  emoji: "🐧" },
  { word: "Bicycle",  emoji: "🚲" },
  { word: "Taco",     emoji: "🌮" },
  { word: "Waffle",   emoji: "🧇" },
  { word: "Banana",   emoji: "🍌" },
  { word: "Falcon",   emoji: "🦅" },
  { word: "Pepper",   emoji: "🌶️" },
  { word: "Marble",   emoji: "🔮" },
  { word: "Thunder",  emoji: "⚡" },
  { word: "Biscuit",  emoji: "🍞" },
  { word: "Mango",    emoji: "🥭" },
  { word: "Compass",  emoji: "🧭" },
  { word: "Lantern",  emoji: "🏮" },
  { word: "Summit",   emoji: "⛰️" },
];

/**
 * Assigns the next available nickname from the library.
 * @param usedWords - words already assigned to other parties in the case
 */
export function assignNickname(usedWords: string[]): { word: string; emoji: string } {
  const usedSet = new Set(usedWords.map(w => w.toLowerCase()));
  const available = VOICE_NICKNAMES.find(n => !usedSet.has(n.word.toLowerCase()));
  if (available) return { word: available.word, emoji: available.emoji };
  // Fallback when all library words are used
  return { word: `Party${usedWords.length + 1}`, emoji: "👤" };
}
