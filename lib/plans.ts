export type PlanAudience="editor"|"business";
export type FuturePlanId="creator_plus"|"studio_plus";

export const futurePlans={
  creator_plus:{
    id:"creator_plus" as const,
    audience:"editor" as const,
    name:"Creator+",
    priceRub:990,
    pointsPrice:500,
    description:"Для монтажёров, которым нужен более быстрый рост и расширенные инструменты KIVRONIX.",
    features:[
      "Больше расширенных разборов видео",
      "Приоритетная помощь по сложным проектам",
      "Глубокая аналитика работ и портфолио",
      "Дополнительные преимущества в конкурсах без покупки победы"
    ]
  },
  studio_plus:{
    id:"studio_plus" as const,
    audience:"business" as const,
    name:"Studio+",
    priceRub:6990,
    pointsPrice:null,
    description:"Для компаний, которые регулярно ищут монтажёров и проводят задания.",
    features:[
      "Расширенные конкурсы и списки кандидатов",
      "Командный кабинет и история проектов",
      "Больше ИИ-подсказок для брифов",
      "Приоритетная поддержка рабочих процессов"
    ]
  }
} as const;

export const paidPlansEnabled=process.env.NEXT_PUBLIC_PAID_PLANS_ENABLED==="true";
export const pointsRedemptionEnabled=process.env.KIVRONIX_POINTS_REDEMPTION_ENABLED==="true";
