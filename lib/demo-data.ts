export type Challenge = {
  id: number;
  brand: string;
  title: string;
  prize: string;
  deadline: string;
  participants: number;
  skill: string;
  level: string;
  status: "open" | "pro";
};

export const challenges: Challenge[] = [
  { id: 1, brand: "NORTH COFFEE", title: "Собери атмосферный Reel из утренней съёмки", prize: "10 000 ₽", deadline: "3 дня", participants: 84, skill: "Reels / Storytelling", level: "Level 4+", status: "open" },
  { id: 2, brand: "VOLT FITNESS", title: "30-секундная реклама нового зала", prize: "25 000 ₽", deadline: "5 дней", participants: 41, skill: "Commercial / Sound", level: "Level 8+", status: "pro" },
  { id: 3, brand: "MOTION LAB", title: "YouTube Short: экспертный talking head", prize: "7 500 ₽", deadline: "48 часов", participants: 126, skill: "Talking Head", level: "Open", status: "open" },
];

export const lessons = [
  { id: 1, title: "Чистая нарезка", subtitle: "Паузы, дыхание, ритм речи", xp: 120, done: true },
  { id: 2, title: "Субтитры, которые читают", subtitle: "Иерархия, акценты, safe-zone", xp: 140, done: true },
  { id: 3, title: "Hook за первые 2 секунды", subtitle: "Как не потерять зрителя в начале", xp: 180, done: false },
  { id: 4, title: "Музыка и голос", subtitle: "Баланс, акценты, саунд-дизайн", xp: 180, done: false },
];
