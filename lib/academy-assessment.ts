export type AssessmentQuestion={
  question:string;
  answers:string[];
  correct:number;
};

export type AssessmentConfig={
  requiredVideos:1|2|3;
  threshold:number;
  quizThreshold:number;
  difficulty:string;
  task:string;
  criteria:string[];
  questions:AssessmentQuestion[];
};

export type SavedAcademyAssessment={
  moduleIndex:number;
  score:number;
  quizScore:number;
  passed:true;
  updatedAt:string;
};

export function savedAcademyAssessments(onboarding:unknown):SavedAcademyAssessment[]{
  if(!onboarding||typeof onboarding!=="object"||Array.isArray(onboarding))return [];
  const raw=(onboarding as Record<string,unknown>).academyAssessments;
  if(!Array.isArray(raw))return [];
  return raw.flatMap(item=>{
    if(!item||typeof item!=="object"||Array.isArray(item))return [];
    const value=item as Record<string,unknown>;
    const moduleIndex=Number(value.moduleIndex);
    const score=Number(value.score);
    const quizScore=Number(value.quizScore);
    if(!Number.isInteger(moduleIndex)||moduleIndex<0||moduleIndex>30||!Number.isFinite(score)||!Number.isFinite(quizScore)||value.passed!==true)return [];
    return [{moduleIndex,score,quizScore,passed:true as const,updatedAt:String(value.updatedAt||"")}];
  });
}

const questions:AssessmentQuestion[][]=[
  [
    {question:"С чего лучше начинать первый монтаж?",answers:["С понятной цели и простого плана","С набора сложных эффектов","С покупки дорогой программы"],correct:0},
    {question:"Что важнее всего в первом ролике?",answers:["Чтобы зритель понял основную мысль","Чтобы переходов было как можно больше","Чтобы ролик был длиннее минуты"],correct:0},
    {question:"Как проверить готовый результат?",answers:["Посмотреть ролик целиком перед экспортом","Проверить только последний кадр","Сразу отправить файл заказчику"],correct:0},
  ],
  [
    {question:"Что проверить до добавления эффектов?",answers:["Порядок кадров и чистоту склеек","Количество фильтров","Название проекта"],correct:0},
    {question:"Какой формат подходит для вертикального ролика?",answers:["9:16","16:9","1:3"],correct:0},
    {question:"Что помогает сделать речь понятнее?",answers:["Чистый звук и читаемые субтитры","Громкая музыка","Частая смена шрифтов"],correct:0},
  ],
  [
    {question:"Как понять, что первые секунды работают?",answers:["Сразу ясны тема и причина смотреть","В начале стоит длинная заставка","Музыка громче речи"],correct:0},
    {question:"Для чего нужен дополнительный кадр?",answers:["Показать деталь и поддержать смысл","Скрыть любую ошибку","Увеличить длительность"],correct:0},
    {question:"Что помогает удержанию зрителя?",answers:["Понятное развитие мысли и смена планов по смыслу","Случайные переходы","Одинаковый кадр весь ролик"],correct:0},
  ],
  [
    {question:"Что важнее при работе со звуком?",answers:["Разборчивая речь и управляемая громкость","Максимальная громкость музыки","Одинаковый уровень всех звуков"],correct:0},
    {question:"Когда анимация оправдана?",answers:["Когда помогает направить внимание","Когда заполняет любое пустое место","Когда используется в каждом кадре"],correct:0},
    {question:"Как оценивать цвет?",answers:["По читаемости объектов и единству кадров","По числу фильтров","Только по насыщенности"],correct:0},
  ],
  [
    {question:"Что сохраняется при переходе в другую программу?",answers:["Логика монтажа и критерии качества","Расположение каждой кнопки","Название горячих клавиш"],correct:0},
    {question:"Что стоит проверить перед экспортом?",answers:["Формат, разрешение, звук и весь ролик","Только имя файла","Только первый кадр"],correct:0},
    {question:"Как осваивать новую программу быстрее?",answers:["Повторить в ней знакомую простую задачу","Сразу начать сложный проект","Выучить все меню наизусть"],correct:0},
  ],
  [
    {question:"Как использовать сложный эффект правильно?",answers:["Подчинить его задаче и проверить читаемость","Добавить во все сцены","Не показывать черновик"],correct:0},
    {question:"Что важнее в продвинутом цвете?",answers:["Стабильность оттенков и нужное настроение","Максимальный контраст","Один пресет для любых кадров"],correct:0},
    {question:"Как проверить сложный монтаж?",answers:["Отдельно проверить смысл, технику и экспорт","Посмотреть только без звука","Оценить по числу дорожек"],correct:0},
  ],
  [
    {question:"Как объяснить цену заказчику?",answers:["Связать цену с объёмом, сроком, версиями и правками","Назвать сумму без условий","Пообещать любые правки бесплатно"],correct:0},
    {question:"Как передавать правки монтажёру?",answers:["Одним списком с приоритетами и таймкодами","Отдельными сообщениями весь день","Только словами «сделай лучше»"],correct:0},
    {question:"Когда договорённость можно считать ясной?",answers:["Зафиксированы результат, цена, срок и границы правок","Клиент поставил реакцию","Монтажёр уже начал работу"],correct:0},
  ],
];

const tasks=[
  "Покажи один законченный короткий ролик с понятной мыслью и аккуратным экспортом.",
  "Покажи ролик с чистыми склейками, вертикальным форматом, понятным звуком и субтитрами.",
  "Покажи работы, где первые секунды удерживают внимание, а дополнительные кадры поддерживают историю.",
  "Покажи работы с осознанным звуком, цветом, движением и доступными субтитрами.",
  "Покажи, что умеешь получать стабильный результат в выбранной программе и правильно экспортировать файл.",
  "Покажи сложные работы, где эффекты, цвет и звук усиливают задачу, а не отвлекают от неё.",
  "Покажи лучшие клиентские или портфолио-работы с понятной задачей, сильным началом и завершённым результатом.",
];

const criteria=[
  ["Понятная мысль","Аккуратный кадр","Корректный экспорт"],
  ["Чистые склейки","Вертикальный формат","Звук и субтитры"],
  ["Сильное начало","Темп истории","Осмысленный B-roll"],
  ["Звук и голос","Цвет","Движение и читаемость"],
  ["Стабильный рабочий процесс","Техническое качество","Экспорт"],
  ["Осмысленные эффекты","Продвинутый цвет","Звуковой дизайн"],
  ["Совпадение с задачей","Клиентская готовность","Портфолио-качество"],
];

export function academyAssessmentConfig(moduleIndex:number):AssessmentConfig{
  const safeIndex=Math.max(0,Math.min(questions.length-1,moduleIndex));
  const requiredVideos=(safeIndex<=1?1:safeIndex<=4?2:3) as 1|2|3;
  return {
    requiredVideos,
    threshold:Math.min(85,60+safeIndex*4),
    quizThreshold:safeIndex<2?70:80,
    difficulty:safeIndex<2?"Базовый":safeIndex<5?"Уверенный":"Продвинутый",
    task:tasks[safeIndex],
    criteria:criteria[safeIndex],
    questions:questions[safeIndex],
  };
}
