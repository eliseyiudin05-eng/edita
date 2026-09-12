export type Challenge = {
  id: number;
  brand: string;
  title: string;
  prize: string;
  deadline: string;
  participants: number;
  skill: string;
  level: string;
  status: "open";
};

export const challenges: Challenge[] = [
  { id: 1, brand: "NORTH COFFEE", title: "Собери атмосферный утренний ролик о кофе", prize: "10 000 ₽", deadline: "3 дня", participants: 84, skill: "Короткое видео и история", level: "Уровень 4+", status: "open" },
  { id: 2, brand: "VOLT FITNESS", title: "30-секундная реклама нового зала", prize: "25 000 ₽", deadline: "5 дней", participants: 41, skill: "Реклама и звук", level: "Уровень 8+", status: "open" },
  { id: 3, brand: "MOTION LAB", title: "Короткий ролик с экспертом", prize: "7 500 ₽", deadline: "48 часов", participants: 126, skill: "Разговорный ролик", level: "Для всех", status: "open" },
];

export const lessons = [
  { id: 1, title: "Чистая нарезка", subtitle: "Паузы, дыхание, ритм речи", xp: 120, done: true },
  { id: 2, title: "Субтитры, которые читают", subtitle: "Порядок, акценты и безопасное место", xp: 140, done: true },
  { id: 3, title: "Яркое начало за 2 секунды", subtitle: "Как удержать внимание зрителя с первого кадра", xp: 180, done: false },
  { id: 4, title: "Музыка и голос", subtitle: "Баланс, акценты, саунд-дизайн", xp: 180, done: false },
];
