// pages/mining.js
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import Link from "next/link";
import { ConnectButton, useConnectModal, useAccountModal } from "@rainbow-me/rainbowkit";
import { useAccount, useDisconnect, useSwitchChain, useWriteContract, usePublicClient, useChainId } from "wagmi";
import { parseUnits } from "viem";
import GamePoolStats from "../components/GamePoolStats";
import { supabaseMP } from "../lib/supabaseClients";

const BG_URL = "/images/games-hero.jpg";

// ==== On-chain Claim (TBNB) config ====
const CLAIM_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CLAIM_CHAIN_ID || 97);
const CLAIM_ADDRESS = (process.env.NEXT_PUBLIC_MLEO_CLAIM_ADDRESS || process.env.NEXT_PUBLIC_CLAIM_ADDRESS || "").trim();
const MLEO_DECIMALS = Number(process.env.NEXT_PUBLIC_MLEO_DECIMALS || 18);

// ABI מינימלי של V3: claim(gameId, amount)
const MINING_CLAIM_ABI = [{
  type: "function",
  name: "claim",
  stateMutability: "nonpayable",
  inputs: [
    { name: "gameId", type: "uint256" },
    { name: "amount", type: "uint256" }
  ],
  outputs: []
}];

// ===== Translations =====
const TEXT = {
  en: {
    name: "English", dir: "ltr", code: "en",
    back: "← BACK",
    logout: "LOG OUT",
    liveTestnet: "Live Testnet • Earn in-game MLEO",
    chooseGame: "Choose Your Game",
    chooseGameDesc: "Two modes, one Vault. Play actively with upgrades (Miners) or let passive accrual run (Token Rush). You can switch anytime.",
    miners: "MLEO — Miners",
    minersDesc: "Idle & upgrades with tap gifts and boosts. Vault integration + on-chain CLAIM for steady, hands-on progress.",
    active: "Active",
    howToPlay: "HOW TO PLAY",
    terms: "TERMS",
    playMiners: "Play Miners",
    acceptTermsToPlay: "🔒 Accept Terms to Play",
    rush: "MLEO — Rush",
    rushDesc: "Advanced mining with Prestige system! Mine MLEO passively, upgrade equipment, earn achievements, and reset for permanent bonuses.",
    passive: "Passive",
    playTokenRush: "Play Token Rush",
    howToPlayTitle: "How to Play",
    goal: "Goal",
    rushGoal: "Rush Goal",
    rushGoalDesc: "Mine MLEO tokens passively and build your empire! Use mined MLEO to upgrade equipment, earn achievements, and prestige for permanent bonuses. The more you play, the stronger you become.",
    rushGameplay: "Gameplay",
    rushGameplaySteps: [
      "Mine MLEO passively - your equipment works automatically",
      "Click BOOST to increase mining speed temporarily (+2% per click)",
      "Collect mined MLEO to your Vault for upgrades and claims",
      "Buy upgrades: Auto-Drill, Helmet, Cart, and Leo Bot for faster mining",
      "Earn achievements by reaching milestones for bonus rewards",
      "Prestige at 10M MLEO to reset progress for permanent bonuses"
    ],
    rushFeatures: "Key Features",
    rushFeaturesList: [
      "Prestige System: Reset upgrades for permanent +2% per prestige point",
      "Achievements: 6 different achievements with Prestige Point rewards",
      "Upgrades: 4 equipment types with multiple levels each",
      "Boost System: Temporary speed increase that decays over time",
      "Guild System: Join mining guilds for bonus multipliers",
      "Bridge: Transfer MLEO from Miners game to Rush vault"
    ],
    goalDesc: "Merge dogs (miners), break rocks, and earn Coins. Coins are an in-game resource used for upgrades and buying more miners. Some activity in the game can also accrue MLEO (see \"Mining & Tokens\" below).",
    boardMerging: "Board & Merging",
    boardSteps: [
      "Tap ADD on an empty slot to place a dog. Cost rises over time.",
      "Drag two dogs of the same level together to merge into a higher level.",
      "Each dog adds damage per second (DPS) to its lane. When a rock breaks you receive Coins."
    ],
    upgradesBonuses: "Upgrades & Bonuses",
    upgradesList: [
      "DPS upgrades make rocks break faster.",
      "GOLD upgrades increase the Coins you receive from each rock by 10% per upgrade.",
      "Gifts, auto-dogs and other bonuses may appear from time to time. Exact timings, drop types and balance values are dynamic and may change without notice.",
      "Diamonds can be collected and spent for special rewards. Availability and rewards are not guaranteed."
    ],
    miningTokens: "Mining & Tokens (MLEO)",
    miningList: [
      "How MLEO is accrued: Only breaking rocks can generate MLEO. A portion of the Coins you earn from rock breaks may convert into MLEO at a variable rate that is subject to in-game balancing, daily limits and anti-abuse protections.",
      "Daily limits & tapering: To keep things fair, daily accrual may taper as you approach your personal limit for the day. Limits and calculations are internal and can change.",
      "Offline progress: Limited offline progress is simulated at a reduced efficiency compared to active play. Exact values are internal and may change.",
      "CLAIM: Your accrued MLEO appears as a balance. Claiming moves it into your in-game Vault. If/when on-chain claims become available, additional unlock windows and restrictions may apply.",
      "No value promise: MLEO in this game is a utility token for entertainment. It has no intrinsic or guaranteed monetary value. Nothing here is an offer, solicitation, or promise of future value."
    ],
    goodToKnow: "Good to Know",
    goodToKnowList: [
      "Game balance, drop rates, limits and schedules are dynamic and may be changed, paused or reset at any time for stability, fairness or maintenance.",
      "Progress may be adjusted to address bugs, exploits or abuse.",
      "This is a testnet version. Data may be wiped or reset during development.",
      "Connect your wallet to claim MLEO tokens on-chain when available."
    ],
    arcadeWhat: "What is MLEO Arcade?",
    arcadeWhatDesc: "MLEO Arcade is a collection of 24 exciting mini-games where you can collect in-app MLEO rewards! Each game has unique mechanics and multipliers.",
    arcadeHowToPlay: "How to Play",
    arcadeSteps: [
      "Choose any game from the arcade",
      "Each session uses at least 1,000 MLEO from your in-app vault. Some modes may use a different session cost",
      "Follow the game-specific instructions",
      "Complete runs, reach milestones, and collect reward boosts based on your results",
      "Session rewards are added automatically to your vault, including rewards earned from free play sessions"
    ],
    arcadeFreePlay: "Free Play Tokens",
    arcadeFreePlayList: [
      "Receive 1 free play token every hour (up to 5 stored)",
      "Use tokens to start one arcade session without using vault MLEO",
      "Rewards from free play sessions are added to your vault just like standard session rewards"
    ],
    arcadeGoodToKnow: "Good to Know",
    arcadeGoodToKnowList: [
      "Your vault is shared between all MLEO games",
      "Each game tracks your activity, completed sessions, best score, streaks, and progress milestones",
      "Some games use randomized events, while others focus on timing, reaction, memory, or decision-making",
      "Click the ℹ️ button on each game card to view the rules, controls, and reward structure"
    ]
  },
  ar: {
    name: "العربية", dir: "rtl", code: "ar",
    back: "← العودة",
    logout: "تسجيل الخروج",
    liveTestnet: "شبكة اختبار حية • اربح MLEO في اللعبة",
    chooseGame: "اختر لعبتك",
    chooseGameDesc: "وضعان، خزنة واحدة. العب بنشاط مع الترقيات (المنقبون) أو دع الاستحقاق السلبي يعمل (اندفاعة الرمز). يمكنك التبديل في أي وقت.",
    miners: "MLEO — المنقبون",
    minersDesc: "العبة الخاملة والترقيات مع هدايا النقر والزيادات. تكامل الخزنة + المطالبة على السلسلة للتقدم المستقر واليدوي.",
    active: "نشط",
    howToPlay: "كيف تلعب",
    terms: "الشروط",
    playMiners: "العب المنقبون",
    acceptTermsToPlay: "🔒 اقبل الشروط للعب",
    rush: "MLEO — الاندفاعة",
    rushDesc: "التعدين المتقدم مع نظام Prestige! عدِّن MLEO سلبيًا، رقِّ المعدات، احصل على الإنجازات وأعد التعيين للحصول على مكافآت دائمة.",
    passive: "سلبي",
    playTokenRush: "العب اندفاعة الرمز",
    howToPlayTitle: "كيف تلعب",
    goal: "الهدف",
    rushGoal: "هدف الاندفاعة",
    rushGoalDesc: "عدِّن رموز MLEO سلبيًا وابن إمبراطوريتك! استخدم MLEO المُعدَّن لترقية المعدات، والحصول على الإنجازات، والـprestige للحصول على مكافآت دائمة. كلما لعبت أكثر، أصبحت أقوى.",
    rushGameplay: "اللعب",
    rushGameplaySteps: [
      "عدِّن MLEO سلبيًا - معداتك تعمل تلقائيًا",
      "انقر BOOST لزيادة سرعة التعدين مؤقتًا (+2% لكل نقرة)",
      "اجمع MLEO المُعدَّن إلى خزنتك للترقيات والمطالبات",
      "اشتر الترقيات: Auto-Drill، Helmet، Cart، وLeo Bot للتعدين الأسرع",
      "احصل على الإنجازات بتحقيق المعالم للحصول على مكافآت إضافية",
      "Prestige عند 10M MLEO لإعادة تعيين التقدم للحصول على مكافآت دائمة"
    ],
    rushFeatures: "الميزات الرئيسية",
    rushFeaturesList: [
      "نظام Prestige: إعادة تعيين الترقيات للحصول على +2% دائم لكل نقطة prestige",
      "الإنجازات: 6 إنجازات مختلفة مع مكافآت نقاط Prestige",
      "الترقيات: 4 أنواع معدات مع مستويات متعددة لكل منها",
      "نظام Boost: زيادة سرعة مؤقتة تتحلل بمرور الوقت",
      "نظام النقابة: انضم إلى نقابات التعدين للحصول على مضاعفات إضافية",
      "الجسر: انقل MLEO من لعبة المنقبين إلى خزنة Rush"
    ],
    goalDesc: "ادمج الكلاب (المنقبون)، اكسر الصخور، واربح العملات. العملات هي مورد في اللعبة يُستخدم للترقيات وشراء المزيد من المنقبين. بعض النشاط في اللعبة يمكن أن يحصل أيضًا على MLEO (انظر \"التعدين والرموز\" أدناه).",
    boardMerging: "اللوحة والدمج",
    boardSteps: [
      "انقر ADD في فتحة فارغة لوضع كلب. التكلفة ترتفع بمرور الوقت.",
      "اسحب كلبين من نفس المستوى معًا للدمج في مستوى أعلى.",
      "كل كلب يضيف ضررًا في الثانية (DPS) إلى حارته. عندما تنكسر صخرة تحصل على عملات."
    ],
    upgradesBonuses: "الترقيات والمكافآت",
    upgradesList: [
      "ترقيات DPS تجعل الصخور تنكسر أسرع.",
      "ترقيات GOLD تزيد العملات التي تحصل عليها من كل صخرة بنسبة 10% لكل ترقية.",
      "قد تظهر الهدايا والكلاب التلقائية ومكافآت أخرى من وقت لآخر. التوقيتات الدقيقة وأنواع الإسقاط وقيم التوازن ديناميكية وقد تتغير دون إشعار.",
      "يمكن جمع الماس وإنفاقه للحصول على مكافآت خاصة. التوفر والمكافآت غير مضمونة."
    ],
    miningTokens: "التعدين والرموز (MLEO)",
    miningList: [
      "كيفية اكتساب MLEO: فقط كسر الصخور يمكن أن يولد MLEO. قد تتحول جزء من العملات التي تربحها من كسر الصخور إلى MLEO بمعدل متغير يخضع لتوازن اللعبة والحدود اليومية وحمايات مكافحة الإساءة.",
      "الحدود اليومية والتدرج: للحفاظ على العدالة، قد يقل الاستحقاق اليومي كلما اقتربت من حدك الشخصي لليوم. الحدود والحسابات داخلية ويمكن أن تتغير.",
      "التقدم خارج الاتصال: يتم محاكاة تقدم محدود خارج الاتصال بكفاءة مخفضة مقارنة باللعب النشط. القيم الدقيقة داخلية وقد تتغير.",
      "المطالبة: يظهر MLEO المستحق كرصيد. المطالبة تنقله إلى خزنتك داخل اللعبة. إذا/عندما تصبح المطالبات على السلسلة متاحة، قد تنطبق نوافذ إلغاء قفل إضافية وقيود.",
      "لا وعد بقيمة: MLEO في هذه اللعبة هو رمز منفعي للترفيه. ليس له قيمة نقدية جوهرية أو مضمونة. لا شيء هنا عرض أو تحريض أو وعد بقيمة مستقبلية."
    ],
    goodToKnow: "جيد أن تعرف",
    goodToKnowList: [
      "توازن اللعبة ومعدلات الإسقاط والحدود والجداول ديناميكية وقد تتغير أو تتوقف أو تُعاد في أي وقت للاستقرار أو العدالة أو الصيانة.",
      "قد يتم تعديل التقدم لمعالجة الأخطاء أو الاستغلال أو الإساءة.",
      "هذه نسخة شبكة اختبار. قد تُمسح البيانات أو تُعاد أثناء التطوير.",
      "اتصل بمحفظتك للمطالبة برموز MLEO على السلسلة عند التوفر."
    ],
    arcadeWhat: "ما هو MLEO Arcade؟",
    arcadeWhatDesc: "MLEO Arcade هي مجموعة من 24 لعبة صغيرة مثيرة حيث يمكنك الفوز برموز MLEO! كل لعبة لها آليات ومضاعفات فريدة.",
    arcadeHowToPlay: "كيف تلعب",
    arcadeSteps: [
      "اختر أي لعبة من الأركيد",
      "كل لعبة تكلف 1,000 MLEO لكل جولة (يُخصم من خزنتك)",
      "اتبع تعليمات اللعبة المحددة",
      "اربح جوائز ومضاعفات تصل إلى 10,000 MLEO!",
      "جميع الأرباح تُضاف تلقائيًا إلى خزنتك"
    ],
    arcadeFreePlay: "رموز اللعب المجاني",
    arcadeFreePlayList: [
      "احصل على رمز لعب مجاني واحد كل ساعة (بحد أقصى 5 رموز)",
      "استخدم الرموز للعب أي لعبة دون إنفاق MLEO",
      "أرباح اللعب المجاني لا تزال تُضاف إلى خزنتك!"
    ],
    arcadeGoodToKnow: "جيد أن تعرف",
    arcadeGoodToKnowList: [
      "خزنتك مشتركة بين جميع ألعاب MLEO",
      "كل لعبة تتبع إحصائياتك الشخصية",
      "جميع الألعاب تستخدم توليد أرقام عشوائية عادلة",
      "انقر على زر ℹ️ في كل لعبة للقواعد المحددة"
    ]
  },
  ru: {
    name: "Русский", dir: "ltr", code: "ru",
    back: "← Назад",
    logout: "Выйти",
    liveTestnet: "Живая тестовая сеть • Зарабатывайте MLEO в игре",
    chooseGame: "Выберите свою игру",
    chooseGameDesc: "Два режима, одно хранилище. Играйте активно с улучшениями (Майнеры) или позвольте пассивному накоплению работать (Токен Раш). Вы можете переключаться в любое время.",
    miners: "MLEO — Майнеры",
    minersDesc: "Простой геймплей и улучшения с подарками по клику и бустами. Интеграция с хранилищем + ЗАБРАТЬ на блокчейне для стабильного, ручного прогресса.",
    active: "Активный",
    howToPlay: "КАК ИГРАТЬ",
    terms: "УСЛОВИЯ",
    playMiners: "Играть Майнеры",
    acceptTermsToPlay: "🔒 Принять условия для игры",
    rush: "MLEO — Раш",
    rushDesc: "Продвинутый майнинг с системой Prestige! Майните MLEO пассивно, улучшайте оборудование, получайте достижения и сбрасывайте для постоянных бонусов.",
    passive: "Пассивный",
    playTokenRush: "Играть Токен Раш",
    howToPlayTitle: "Как играть",
    goal: "Цель",
    rushGoal: "Цель Раша",
    rushGoalDesc: "Майните токены MLEO пассивно и стройте свою империю! Используйте намайненный MLEO для улучшения оборудования, получения достижений и prestige для постоянных бонусов. Чем больше играете, тем сильнее становитесь.",
    rushGameplay: "Геймплей",
    rushGameplaySteps: [
      "Майните MLEO пассивно - ваше оборудование работает автоматически",
      "Кликайте BOOST чтобы временно увеличить скорость майнинга (+2% за клик)",
      "Собирайте намайненный MLEO в ваше хранилище для улучшений и забора",
      "Покупайте улучшения: Auto-Drill, Helmet, Cart и Leo Bot для более быстрого майнинга",
      "Получайте достижения, достигая вех для бонусных наград",
      "Prestige на 10M MLEO чтобы сбросить прогресс для постоянных бонусов"
    ],
    rushFeatures: "Ключевые особенности",
    rushFeaturesList: [
      "Система Prestige: Сброс улучшений для постоянных +2% за каждое очко prestige",
      "Достижения: 6 разных достижений с наградами очков Prestige",
      "Улучшения: 4 типа оборудования с множественными уровнями каждый",
      "Система Boost: Временное увеличение скорости, которое уменьшается со временем",
      "Система гильдий: Присоединяйтесь к гильдиям майнинга для бонусных множителей",
      "Мост: Переводите MLEO из игры Майнеры в хранилище Раша"
    ],
    goalDesc: "Объединяйте собак (майнеров), разбивайте камни и зарабатывайте монеты. Монеты - это игровой ресурс, используемый для улучшений и покупки большего количества майнеров. Некоторые действия в игре также могут начислять MLEO (см. \"Майнинг и токены\" ниже).",
    boardMerging: "Доска и объединение",
    boardSteps: [
      "Нажмите ADD на пустом слоте, чтобы разместить собаку. Стоимость растет со временем.",
      "Перетащите двух собак одного уровня вместе, чтобы объединить их в более высокий уровень.",
      "Каждая собака добавляет урон в секунду (DPS) к своей полосе. Когда камень разбивается, вы получаете монеты."
    ],
    upgradesBonuses: "Улучшения и бонусы",
    upgradesList: [
      "Улучшения DPS заставляют камни разбиваться быстрее.",
      "Улучшения GOLD увеличивают монеты, которые вы получаете от каждого камня, на 10% за улучшение.",
      "Подарки, автоматические собаки и другие бонусы могут появляться время от времени. Точные тайминги, типы дропов и значения баланса динамичны и могут изменяться без предварительного уведомления.",
      "Алмазы можно собирать и тратить на специальные награды. Доступность и награды не гарантированы."
    ],
    miningTokens: "Майнинг и токены (MLEO)",
    miningList: [
      "Как начисляется MLEO: Только разбивание камней может генерировать MLEO. Часть монет, которые вы зарабатываете от разбивания камней, может конвертироваться в MLEO по переменному курсу, который зависит от игрового баланса, дневных лимитов и защиты от злоупотреблений.",
      "Дневные лимиты и затухание: Чтобы поддерживать справедливость, дневное начисление может уменьшаться по мере приближения к вашему личному лимиту на день. Лимиты и расчеты внутренние и могут изменяться.",
      "Прогресс в оффлайне: Ограниченный оффлайн прогресс симулируется с пониженной эффективностью по сравнению с активной игрой. Точные значения внутренние и могут изменяться.",
      "ЗАБРАТЬ: Ваш начисленный MLEO появляется как баланс. Забирание перемещает его в ваше игровое хранилище. Если/когда станут доступны заборы в блокчейне, могут применяться дополнительные окна разблокировки и ограничения.",
      "Обещание отсутствует: MLEO в этой игре - это утилитарный токен для развлечения. У него нет внутренней или гарантированной денежной стоимости. Ничто здесь не является предложением, призывом или обещанием будущей стоимости."
    ],
    goodToKnow: "Хорошо знать",
    goodToKnowList: [
      "Игровой баланс, показатели дропов, лимиты и расписания динамичны и могут быть изменены, приостановлены или сброшены в любое время для стабильности, справедливости или обслуживания.",
      "Прогресс может быть скорректирован для устранения ошибок, эксплойтов или злоупотреблений.",
      "Это версия тестовой сети. Данные могут быть стерты или сброшены во время разработки.",
      "Подключите свой кошелек, чтобы забрать токены MLEO в блокчейне, когда они станут доступны."
    ],
    arcadeWhat: "Что такое MLEO Arcade?",
    arcadeWhatDesc: "MLEO Arcade - это коллекция из 24 увлекательных мини-игр, в которых вы можете выиграть токены MLEO! Каждая игра имеет уникальную механику и множители.",
    arcadeHowToPlay: "Как играть",
    arcadeSteps: [
      "Выберите любую игру из аркады",
      "Каждая игра стоит 1,000 MLEO за раунд (вычитается из вашего хранилища)",
      "Следуйте инструкциям для конкретной игры",
      "Выигрывайте призы и множители до 10,000 MLEO!",
      "Все выигрыши автоматически добавляются в ваше хранилище"
    ],
    arcadeFreePlay: "Токены бесплатной игры",
    arcadeFreePlayList: [
      "Получайте 1 токен бесплатной игры каждый час (максимум 5 токенов)",
      "Используйте токены для игры в любую игру без траты MLEO",
      "Выигрыши в бесплатной игре все равно добавляются в ваше хранилище!"
    ],
    arcadeGoodToKnow: "Хорошо знать",
    arcadeGoodToKnowList: [
      "Ваше хранилище общее для всех игр MLEO",
      "Каждая игра отслеживает вашу личную статистику",
      "Все игры используют справедливую генерацию случайных чисел",
      "Нажмите кнопку ℹ️ в каждой игре для конкретных правил"
    ],
  },
  es: {
    name: "Español", dir: "ltr", code: "es",
    back: "← Volver",
    logout: "Cerrar sesión",
    liveTestnet: "Testnet en vivo • Gana MLEO en el juego",
    chooseGame: "Elige tu juego",
    chooseGameDesc: "Dos modos, una bóveda. Juega activamente con mejoras (Miners) o deja que la acumulación pasiva funcione (Token Rush). Puedes cambiar en cualquier momento.",
    miners: "MLEO — Miners",
    minersDesc: "Juego idle y mejoras con regalos de toque y boosts. Integración con bóveda + CLAIM en cadena para progreso estable y manual.",
    active: "Activo",
    howToPlay: "CÓMO JUGAR",
    terms: "TÉRMINOS",
    playMiners: "Jugar Miners",
    acceptTermsToPlay: "🔒 Aceptar términos para jugar",
    rush: "MLEO — Rush",
    rushDesc: "¡Minería avanzada con sistema Prestige! Mina MLEO pasivamente, mejora equipos, gana logros y reinicia para bonos permanentes.",
    passive: "Pasivo",
    playTokenRush: "Jugar Token Rush",
    howToPlayTitle: "Cómo jugar",
    goal: "Objetivo",
    rushGoal: "Objetivo Rush",
    rushGoalDesc: "¡Mina tokens MLEO pasivamente y construye tu imperio! Usa MLEO minado para mejorar equipos, ganar logros y prestige para bonos permanentes. Cuanto más juegues, más fuerte te vuelves.",
    rushGameplay: "Jugabilidad",
    rushGameplaySteps: [
      "Mina MLEO pasivamente - tu equipo funciona automáticamente",
      "Haz clic en BOOST para aumentar temporalmente la velocidad de minería (+2% por clic)",
      "Recoge MLEO minado a tu bóveda para mejoras y reclamaciones",
      "Compra mejoras: Auto-Drill, Helmet, Cart y Leo Bot para minería más rápida",
      "Gana logros alcanzando hitos para recompensas bonus",
      "Prestige en 10M MLEO para reiniciar progreso por bonos permanentes"
    ],
    rushFeatures: "Características clave",
    rushFeaturesList: [
      "Sistema Prestige: Reinicia mejoras por +2% permanente por punto de prestige",
      "Logros: 6 logros diferentes con recompensas de puntos Prestige",
      "Mejoras: 4 tipos de equipo con múltiples niveles cada uno",
      "Sistema Boost: Aumento temporal de velocidad que decae con el tiempo",
      "Sistema de gremios: Únete a gremios de minería para multiplicadores bonus",
      "Puente: Transfiere MLEO del juego Miners a la bóveda Rush"
    ],
    goalDesc: "Fusiona perros (mineros), rompe rocas y gana monedas. Las monedas son un recurso del juego usado para mejoras y comprar más mineros. Algunas actividades en el juego también pueden acumular MLEO (ver \"Minería y tokens\" abajo).",
    boardMerging: "Tablero y fusión",
    boardSteps: [
      "Toca ADD en una ranura vacía para colocar un perro. El costo aumenta con el tiempo.",
      "Arrastra dos perros del mismo nivel juntos para fusionarlos en un nivel más alto.",
      "Cada perro añade daño por segundo (DPS) a su carril. Cuando una roca se rompe recibes monedas."
    ],
    upgradesBonuses: "Mejoras y bonos",
    upgradesList: [
      "Las mejoras DPS hacen que las rocas se rompan más rápido.",
      "Las mejoras GOLD aumentan las monedas que recibes de cada roca en 10% por mejora.",
      "Regalos, perros automáticos y otros bonos pueden aparecer de vez en cuando. Los tiempos exactos, tipos de gota y valores de balance son dinámicos y pueden cambiar sin aviso.",
      "Los diamantes pueden recogerse y gastarse por recompensas especiales. Disponibilidad y recompensas no están garantizadas."
    ],
    miningTokens: "Minería y tokens (MLEO)",
    miningList: [
      "Cómo se acumula MLEO: Solo romper rocas puede generar MLEO. Una porción de las monedas que ganas de romper rocas puede convertirse en MLEO a una tasa variable sujeta a balance del juego, límites diarios y protecciones anti-abuso.",
      "Límites diarios y atenuación: Para mantener justicia, la acumulación diaria puede atenuarse al acercarte a tu límite personal del día. Los límites y cálculos son internos y pueden cambiar.",
      "Progreso offline: Se simula progreso offline limitado con eficiencia reducida comparado al juego activo. Los valores exactos son internos y pueden cambiar.",
      "CLAIM: Tu MLEO acumulado aparece como balance. Reclamar lo mueve a tu bóveda del juego. Si/cuando las reclamaciones on-chain estén disponibles, pueden aplicarse ventanas de desbloqueo adicionales y restricciones.",
      "Sin promesa de valor: MLEO en este juego es un token utilitario para entretenimiento. No tiene valor monetario intrínseco o garantizado. Nada aquí es oferta, solicitud o promesa de valor futuro."
    ],
    goodToKnow: "Bueno saber",
    goodToKnowList: [
      "El balance del juego, tasas de gota, límites y horarios son dinámicos y pueden cambiarse, pausarse o reiniciarse en cualquier momento por estabilidad, justicia o mantenimiento.",
      "El progreso puede ajustarse para abordar bugs, exploits o abuso.",
      "Esta es una versión de testnet. Los datos pueden borrarse o reiniciarse durante desarrollo.",
      "Conecta tu wallet para reclamar tokens MLEO on-chain cuando estén disponibles."
    ],
    arcadeWhat: "¿Qué es MLEO Arcade?",
    arcadeWhatDesc: "MLEO Arcade es una colección de 24 emocionantes minijuegos donde puedes ganar tokens MLEO! Cada juego tiene mecánicas y multiplicadores únicos.",
    arcadeHowToPlay: "Cómo jugar",
    arcadeSteps: [
      "Elige cualquier juego del arcade",
      "Cada juego cuesta 1,000 MLEO por ronda (deducido de tu bóveda)",
      "Sigue las instrucciones específicas del juego",
      "¡Gana premios y multiplicadores de hasta 10,000 MLEO!",
      "Todas las ganancias se agregan automáticamente a tu bóveda"
    ],
    arcadeFreePlay: "Tokens de juego gratis",
    arcadeFreePlayList: [
      "Gana 1 token de juego gratis cada hora (máx 5 tokens)",
      "Usa tokens para jugar cualquier juego sin gastar MLEO",
      "¡Las ganancias de juego gratis aún se agregan a tu bóveda!"
    ],
    arcadeGoodToKnow: "Bueno saber",
    arcadeGoodToKnowList: [
      "Tu bóveda se comparte entre todos los juegos MLEO",
      "Cada juego rastrea tus estadísticas personales",
      "Todos los juegos usan generación de números aleatorios justos",
      "Haz clic en el botón ℹ️ en cada juego para reglas específicas"
    ],
  },
  fr: {
    name: "Français", dir: "ltr", code: "fr",
    back: "← Retour",
    logout: "Se déconnecter",
    liveTestnet: "Testnet en direct • Gagnez MLEO dans le jeu",
    chooseGame: "Choisissez votre jeu",
    chooseGameDesc: "Deux modes, un coffre-fort. Jouez activement avec des améliorations (Miners) ou laissez l'accumulation passive fonctionner (Token Rush). Vous pouvez changer à tout moment.",
    miners: "MLEO — Miners",
    minersDesc: "Jeu idle et améliorations avec cadeaux de clic et boosts. Intégration coffre-fort + CLAIM en chaîne pour progression stable et manuelle.",
    active: "Actif",
    howToPlay: "COMMENT JOUER",
    terms: "TERMES",
    playMiners: "Jouer Miners",
    acceptTermsToPlay: "🔒 Accepter les termes pour jouer",
    rush: "MLEO — Rush",
    rushDesc: "Mining avancé avec système Prestige ! Minez MLEO passivement, améliorez l'équipement, gagnez des succès et réinitialisez pour des bonus permanents.",
    passive: "Passif",
    playTokenRush: "Jouer Token Rush",
    howToPlayTitle: "Comment jouer",
    goal: "Objectif",
    rushGoal: "Objectif Rush",
    rushGoalDesc: "Minez des tokens MLEO passivement et construisez votre empire ! Utilisez MLEO miné pour améliorer l'équipement, gagner des succès et prestige pour des bonus permanents. Plus vous jouez, plus vous devenez fort.",
    rushGameplay: "Gameplay",
    rushGameplaySteps: [
      "Minez MLEO passivement - votre équipement fonctionne automatiquement",
      "Cliquez BOOST pour augmenter temporairement la vitesse de mining (+2% par clic)",
      "Collectez MLEO miné dans votre coffre-fort pour améliorations et réclamations",
      "Achetez améliorations: Auto-Drill, Helmet, Cart et Leo Bot pour mining plus rapide",
      "Gagnez succès en atteignant des jalons pour récompenses bonus",
      "Prestige à 10M MLEO pour réinitialiser progression pour bonus permanents"
    ],
    rushFeatures: "Caractéristiques clés",
    rushFeaturesList: [
      "Système Prestige: Réinitialise améliorations pour +2% permanent par point de prestige",
      "Succès: 6 succès différents avec récompenses de points Prestige",
      "Améliorations: 4 types d'équipement avec multiples niveaux chacun",
      "Système Boost: Augmentation temporaire de vitesse qui diminue avec le temps",
      "Système de guilde: Rejoignez guildes de mining pour multiplicateurs bonus",
      "Pont: Transférez MLEO du jeu Miners vers le coffre-fort Rush"
    ],
    goalDesc: "Fusionnez chiens (mineurs), cassez rochers et gagnez pièces. Les pièces sont une ressource de jeu utilisée pour améliorations et acheter plus de mineurs. Certaines activités dans le jeu peuvent aussi accumuler MLEO (voir \"Mining et tokens\" ci-dessous).",
    boardMerging: "Plateau et fusion",
    boardSteps: [
      "Touchez ADD sur un emplacement vide pour placer un chien. Le coût augmente avec le temps.",
      "Glissez deux chiens du même niveau ensemble pour les fusionner en niveau plus élevé.",
      "Chaque chien ajoute dégâts par seconde (DPS) à sa voie. Quand un rocher se casse vous recevez des pièces."
    ],
    upgradesBonuses: "Améliorations et bonus",
    upgradesList: [
      "Les améliorations DPS font que les rochers se cassent plus vite.",
      "Les améliorations GOLD augmentent les pièces que vous recevez de chaque rocher de 10% par amélioration.",
      "Cadeaux, chiens automatiques et autres bonus peuvent apparaître de temps en temps. Les timings exacts, types de drop et valeurs de balance sont dynamiques et peuvent changer sans préavis.",
      "Les diamants peuvent être collectés et dépensés pour récompenses spéciales. Disponibilité et récompenses ne sont pas garanties."
    ],
    miningTokens: "Mining et tokens (MLEO)",
    miningList: [
      "Comment MLEO s'accumule: Seulement casser des rochers peut générer MLEO. Une portion des pièces que vous gagnez en cassant des rochers peut se convertir en MLEO à un taux variable soumis au balancement du jeu, limites quotidiennes et protections anti-abus.",
      "Limites quotidiennes et atténuation: Pour maintenir l'équité, l'accumulation quotidienne peut s'atténuer en approchant votre limite personnelle du jour. Les limites et calculs sont internes et peuvent changer.",
      "Progrès offline: Un progrès offline limité est simulé avec efficacité réduite comparé au jeu actif. Les valeurs exactes sont internes et peuvent changer.",
      "CLAIM: Votre MLEO accumulé apparaît comme balance. Réclamer le déplace vers votre coffre-fort de jeu. Si/quand les réclamations on-chain deviennent disponibles, des fenêtres de déverrouillage supplémentaires et restrictions peuvent s'appliquer.",
      "Pas de promesse de valeur: MLEO dans ce jeu est un token utilitaire pour divertissement. Il n'a pas de valeur monétaire intrinsèque ou garantie. Rien ici n'est offre, sollicitation ou promesse de valeur future."
    ],
    goodToKnow: "Bon à savoir",
    goodToKnowList: [
      "Le balance du jeu, taux de drop, limites et horaires sont dynamiques et peuvent être changés, mis en pause ou réinitialisés à tout moment pour stabilité, équité ou maintenance.",
      "Le progrès peut être ajusté pour adresser bugs, exploits ou abus.",
      "Ceci est une version testnet. Les données peuvent être effacées ou réinitialisées pendant développement.",
      "Connectez votre wallet pour réclamer tokens MLEO on-chain quand disponibles."
    ],
    arcadeWhat: "Qu'est-ce que MLEO Arcade?",
    arcadeWhatDesc: "MLEO Arcade est une collection de 24 mini-jeux excitants où vous pouvez gagner des tokens MLEO! Chaque jeu a des mécaniques et multiplicateurs uniques.",
    arcadeHowToPlay: "Comment jouer",
    arcadeSteps: [
      "Choisissez n'importe quel jeu de l'arcade",
      "Chaque jeu coûte 1,000 MLEO par partie (déduit de votre coffre)",
      "Suivez les instructions spécifiques du jeu",
      "Gagnez des prix et multiplicateurs jusqu'à 10,000 MLEO!",
      "Tous les gains sont automatiquement ajoutés à votre coffre"
    ],
    arcadeFreePlay: "Tokens de jeu gratuit",
    arcadeFreePlayList: [
      "Gagnez 1 token de jeu gratuit chaque heure (up to 5 stored)",
      "Utilisez les tokens pour jouer à n'importe quel jeu sans dépenser de MLEO",
      "Les gains de jeu gratuit sont toujours ajoutés à votre coffre!"
    ],
    arcadeGoodToKnow: "Bon à savoir",
    arcadeGoodToKnowList: [
      "Votre coffre est partagé entre tous les jeux MLEO",
      "Chaque jeu suit vos statistiques personnelles",
      "Tous les jeux utilisent une génération de nombres aléatoires équitable",
      "Cliquez sur le bouton ℹ️ sur chaque jeu pour les règles spécifiques"
    ],
  },
  de: {
    name: "Deutsch", dir: "ltr", code: "de",
    back: "← Zurück",
    logout: "Abmelden",
    liveTestnet: "Live Testnet • Verdiene MLEO im Spiel",
    chooseGame: "Wähle dein Spiel",
    chooseGameDesc: "Zwei Modi, ein Vault. Spiele aktiv mit Upgrades (Miners) oder lass passives Sammeln laufen (Token Rush). Du kannst jederzeit wechseln.",
    miners: "MLEO — Miners",
    minersDesc: "Idle-Spiel und Upgrades mit Klick-Geschenken und Boosts. Vault-Integration + On-Chain CLAIM für stetigen, manuellen Fortschritt.",
    active: "Aktiv",
    howToPlay: "WIE MAN SPIELT",
    terms: "BEDINGUNGEN",
    playMiners: "Spiele Miners",
    acceptTermsToPlay: "🔒 Bedingungen akzeptieren zum Spielen",
    rush: "MLEO — Rush",
    rushDesc: "Fortgeschrittenes Mining mit Prestige-System! Mine MLEO passiv, verbessere Ausrüstung, verdiene Erfolge und setze zurück für permanente Boni.",
    passive: "Passiv",
    playTokenRush: "Spiele Token Rush",
    howToPlayTitle: "Wie man spielt",
    goal: "Ziel",
    rushGoal: "Rush-Ziel",
    rushGoalDesc: "Mine MLEO-Token passiv und baue dein Imperium! Nutze gemintes MLEO für Ausrüstungsverbesserungen, Erfolge und Prestige für permanente Boni. Je mehr du spielst, desto stärker wirst du.",
    rushGameplay: "Gameplay",
    rushGameplaySteps: [
      "Mine MLEO passiv - deine Ausrüstung arbeitet automatisch",
      "Klicke BOOST um Mining-Geschwindigkeit temporär zu erhöhen (+2% pro Klick)",
      "Sammle gemintes MLEO in deinen Vault für Upgrades und Claims",
      "Kaufe Upgrades: Auto-Drill, Helmet, Cart und Leo Bot für schnelleres Mining",
      "Verdiene Erfolge durch Erreichen von Meilensteinen für Bonus-Belohnungen",
      "Prestige bei 10M MLEO um Fortschritt für permanente Boni zurückzusetzen"
    ],
    rushFeatures: "Hauptmerkmale",
    rushFeaturesList: [
      "Prestige-System: Setze Upgrades zurück für permanente +2% pro Prestige-Punkt",
      "Erfolge: 6 verschiedene Erfolge mit Prestige-Punkt-Belohnungen",
      "Upgrades: 4 Ausrüstungstypen mit mehreren Stufen jeweils",
      "Boost-System: Temporäre Geschwindigkeitserhöhung die mit der Zeit abnimmt",
      "Gilden-System: Tritt Mining-Gilden für Bonus-Multiplikatoren bei",
      "Brücke: Übertrage MLEO vom Miners-Spiel zum Rush-Vault"
    ],
    goalDesc: "Verbinde Hunde (Miner), zerschlage Steine und verdiene Münzen. Münzen sind eine In-Game-Ressource für Upgrades und Kauf mehrerer Miner. Manche Aktivitäten im Spiel können auch MLEO sammeln (siehe \"Mining & Tokens\" unten).",
    boardMerging: "Board & Verbinden",
    boardSteps: [
      "Tippe ADD auf leeren Slot um Hund zu platzieren. Kosten steigen über Zeit.",
      "Ziehe zwei Hunde gleicher Stufe zusammen um sie in höhere Stufe zu verbinden.",
      "Jeder Hund fügt Schaden pro Sekunde (DPS) zu seiner Spur hinzu. Wenn Stein zerbricht erhältst du Münzen."
    ],
    upgradesBonuses: "Upgrades & Boni",
    upgradesList: [
      "DPS-Upgrades lassen Steine schneller zerbrechen.",
      "GOLD-Upgrades erhöhen Münzen die du von jedem Stein erhältst um 10% pro Upgrade.",
      "Geschenke, Auto-Hunde und andere Boni können von Zeit zu Zeit erscheinen. Exakte Zeiten, Drop-Typen und Balance-Werte sind dynamisch und können sich ohne Vorwarnung ändern.",
      "Diamanten können gesammelt und für spezielle Belohnungen ausgegeben werden. Verfügbarkeit und Belohnungen sind nicht garantiert."
    ],
    miningTokens: "Mining & Tokens (MLEO)",
    miningList: [
      "Wie MLEO gesammelt wird: Nur Steine zerbrechen kann MLEO generieren. Ein Teil der Münzen die du vom Steinbrechen verdienst kann sich in MLEO zu variabler Rate konvertieren, abhängig von Spiel-Balance, täglichen Limits und Anti-Missbrauch-Schutz.",
      "Tägliche Limits & Abschwächung: Um Fairness zu wahren, kann tägliches Sammeln abflachen wenn du dein persönliches Tageslimit erreichst. Limits und Berechnungen sind intern und können sich ändern.",
      "Offline-Fortschritt: Begrenzter Offline-Fortschritt wird simuliert mit reduzierter Effizienz verglichen mit aktivem Spiel. Exakte Werte sind intern und können sich ändern.",
      "CLAIM: Dein gesammeltes MLEO erscheint als Balance. Claimen bewegt es in deinen In-Game-Vault. Wenn/falls On-Chain-Claims verfügbar werden, können zusätzliche Entsperrungsfenster und Einschränkungen gelten.",
      "Kein Wertversprechen: MLEO in diesem Spiel ist ein Utility-Token zur Unterhaltung. Es hat keinen intrinsischen oder garantierten Geldwert. Nichts hier ist Angebot, Aufforderung oder Versprechen zukünftigen Werts."
    ],
    goodToKnow: "Gut zu wissen",
    goodToKnowList: [
      "Spiel-Balance, Drop-Raten, Limits und Zeitpläne sind dynamisch und können jederzeit für Stabilität, Fairness oder Wartung geändert, pausiert oder zurückgesetzt werden.",
      "Fortschritt kann angepasst werden um Bugs, Exploits oder Missbrauch zu beheben.",
      "Dies ist eine Testnet-Version. Daten können während Entwicklung gelöscht oder zurückgesetzt werden.",
      "Verbinde deine Wallet um MLEO-Token on-chain zu claimen wenn verfügbar."
    ],
    arcadeWhat: "Was ist MLEO Arcade?",
    arcadeWhatDesc: "MLEO Arcade ist eine Sammlung von 24 spannenden Mini-Spielen, bei denen Sie MLEO-Token gewinnen können! Jedes Spiel hat einzigartige Mechaniken und Multiplikatoren.",
    arcadeHowToPlay: "Wie man spielt",
    arcadeSteps: [
      "Wählen Sie ein beliebiges Spiel aus der Arcade",
      "Jedes Spiel kostet 1.000 MLEO pro Runde (von Ihrer Tresor abgezogen)",
      "Folgen Sie den spielspezifischen Anweisungen",
      "Sammeln Sie Belohnungen und Multiplikatoren bis zu 10.000 MLEO!",
      "Alle Gewinne werden automatisch zu Ihrem Tresor hinzugefügt"
    ],
    arcadeFreePlay: "Kostenlose Spiel-Token",
    arcadeFreePlayList: [
      "Verdienen Sie 1 kostenloses Spiel-Token jede Stunde (max 5 Token)",
      "Verwenden Sie Token, um jedes Spiel zu spielen, ohne MLEO auszugeben",
      "Kostenlose Spielgewinne werden trotzdem zu Ihrem Tresor hinzugefügt!"
    ],
    arcadeGoodToKnow: "Gut zu wissen",
    arcadeGoodToKnowList: [
      "Ihr Tresor wird von allen MLEO-Spielen geteilt",
      "Jedes Spiel verfolgt Ihre persönlichen Statistiken",
      "Alle Spiele verwenden faire Zufallszahlengenerierung",
      "Klicken Sie auf die ℹ️-Schaltfläche bei jedem Spiel für spezifische Regeln"
    ],
  },
  zh: {
    name: "中文", dir: "ltr", code: "zh",
    back: "← 返回",
    logout: "退出登录",
    liveTestnet: "实时测试网 • 在游戏中赚取MLEO",
    chooseGame: "选择你的游戏",
    chooseGameDesc: "两种模式，一个金库。主动升级游戏（矿工）或让被动累积运行（代币冲刺）。你可以随时切换。",
    miners: "MLEO — 矿工",
    minersDesc: "休闲游戏和升级，有点击礼物和加速。金库集成 + 链上CLAIM实现稳定、手动进度。",
    active: "主动",
    howToPlay: "如何游戏",
    terms: "条款",
    playMiners: "玩矿工",
    acceptTermsToPlay: "🔒 接受条款开始游戏",
    rush: "MLEO — 冲刺",
    rushDesc: "高级挖矿与声望系统！被动挖取MLEO，升级装备，获得成就，重置永久奖励。",
    passive: "被动",
    playTokenRush: "玩代币冲刺",
    howToPlayTitle: "如何游戏",
    goal: "目标",
    rushGoal: "冲刺目标",
    rushGoalDesc: "被动挖取MLEO代币并建立你的帝国！使用挖取的MLEO升级装备，获得成就和声望以获得永久奖励。你玩得越多，变得越强。",
    rushGameplay: "游戏玩法",
    rushGameplaySteps: [
      "被动挖取MLEO - 你的装备自动工作",
      "点击BOOST临时增加挖矿速度（+2%每次点击）",
      "收集挖取的MLEO到你的金库进行升级和提取",
      "购买升级：自动钻头、头盔、推车和Leo机器人进行更快挖矿",
      "通过达到里程碑获得成就以获得奖励",
      "在10M MLEO时声望以重置进度获得永久奖励"
    ],
    rushFeatures: "主要特点",
    rushFeaturesList: [
      "声望系统：重置升级获得永久+2%每声望点",
      "成就：6个不同成就带声望点奖励",
      "升级：4种装备类型每种多级",
      "加速系统：临时速度增加随时间衰减",
      "公会系统：加入挖矿公会获得奖励倍数",
      "桥梁：从矿工游戏转移MLEO到冲刺金库"
    ],
    goalDesc: "合并狗（矿工），砸石头，赚取硬币。硬币是游戏内资源用于升级和购买更多矿工。游戏中的一些活动也可能累积MLEO（见下面\"挖矿与代币\"）。",
    boardMerging: "棋盘与合并",
    boardSteps: [
      "在空槽点击ADD放置狗。成本随时间上升。",
      "拖拽两个同等级狗一起合并到更高等级。",
      "每只狗向它的车道添加每秒伤害（DPS）。当石头破碎时你收到硬币。"
    ],
    upgradesBonuses: "升级与奖励",
    upgradesList: [
      "DPS升级让石头破碎更快。",
      "GOLD升级增加你从每块石头获得的硬币10%每升级。",
      "礼物、自动狗和其他奖励可能不时出现。确切时间、掉落类型和平衡值是动态的，可能无通知更改。",
      "钻石可以收集并花费获得特殊奖励。可用性和奖励不保证。"
    ],
    miningTokens: "挖矿与代币（MLEO）",
    miningList: [
      "MLEO如何累积：只有砸石头能生成MLEO。你从砸石头赚取的硬币部分可能以可变速率转换为MLEO，受游戏平衡、每日限制和反滥用保护约束。",
      "每日限制与衰减：为保持公平，每日累积可能在你接近个人每日限制时衰减。限制和计算是内部的，可能更改。",
      "离线进度：有限离线进度以降低效率相比主动游戏模拟。确切值是内部的，可能更改。",
      "CLAIM：你的累积MLEO显示为余额。提取将其移动到你的游戏内金库。如果/当链上提取可用时，可能适用额外解锁窗口和限制。",
      "无价值承诺：游戏中的MLEO是娱乐实用代币。它没有内在或保证的货币价值。这里没有提供、招揽或未来价值承诺。"
    ],
    goodToKnow: "好要知道",
    goodToKnowList: [
      "游戏平衡、掉落率、限制和时间表是动态的，可能随时为稳定性、公平性或维护而更改、暂停或重置。",
      "进度可能调整以解决错误、利用或滥用。",
      "这是测试网版本。数据可能在开发期间被擦除或重置。",
      "连接你的钱包以在可用时链上提取MLEO代币。"
    ],
    arcadeWhat: "MLEO街机是什么？",
    arcadeWhatDesc: "MLEO街机是24款激动人心的迷你游戏合集，您可以赢取MLEO代币！每款游戏都有独特的机制和倍数。",
    arcadeHowToPlay: "如何游玩",
    arcadeSteps: [
      "从街机中选择任何游戏",
      "每款游戏每轮花费1,000 MLEO（从您的金库中扣除）",
      "遵循游戏特定的说明",
      "赢取最高10,000 MLEO的奖品和倍数！",
      "所有奖金自动添加到您的金库"
    ],
    arcadeFreePlay: "免费游玩代币",
    arcadeFreePlayList: [
      "每小时获得1个免费游玩代币（最多5个代币）",
      "使用代币玩任何游戏而无需花费MLEO",
      "免费游玩的奖金仍然添加到您的金库！"
    ],
    arcadeGoodToKnow: "须知",
    arcadeGoodToKnowList: [
      "您的金库在所有MLEO游戏中共享",
      "每款游戏跟踪您的个人统计",
      "所有游戏使用公平的随机数生成",
      "点击每款游戏的ℹ️按钮查看具体规则"
    ],
  },
  ja: {
    name: "日本語", dir: "ltr", code: "ja",
    back: "← 戻る",
    logout: "ログアウト",
    liveTestnet: "ライブテストネット • ゲーム内でMLEOを獲得",
    chooseGame: "ゲームを選択",
    chooseGameDesc: "2つのモード、1つのVault。アップグレードでアクティブにプレイ（Miners）またはパッシブ蓄積を実行（Token Rush）。いつでも切り替え可能。",
    miners: "MLEO — マイナー",
    minersDesc: "アイドルゲームとアップグレード、クリックギフトとブースト。Vault統合 + オンチェーンCLAIMで安定した手動進行。",
    active: "アクティブ",
    howToPlay: "遊び方",
    terms: "利用規約",
    playMiners: "マイナーをプレイ",
    acceptTermsToPlay: "🔒 プレイするには利用規約に同意",
    rush: "MLEO — ラッシュ",
    rushDesc: "プレステージシステム付き高度マイニング！MLEOをパッシブにマイニング、装備アップグレード、実績獲得、永続ボーナスでリセット。",
    passive: "パッシブ",
    playTokenRush: "トークンラッシュをプレイ",
    howToPlayTitle: "遊び方",
    goal: "目標",
    rushGoal: "ラッシュ目標",
    rushGoalDesc: "MLEOトークンをパッシブにマイニングして帝国を建設！マイニングしたMLEOで装備アップグレード、実績獲得、永続ボーナスのプレステージ。プレイするほど強くなる。",
    rushGameplay: "ゲームプレイ",
    rushGameplaySteps: [
      "MLEOをパッシブにマイニング - 装備が自動動作",
      "BOOSTをクリックしてマイニング速度を一時的に増加（+2%クリック毎）",
      "マイニングしたMLEOをVaultに収集してアップグレードと請求",
      "アップグレード購入：より速いマイニングのAuto-Drill、Helmet、Cart、Leo Bot",
      "マイルストーン達成で実績獲得してボーナス報酬",
      "10M MLEOでプレステージして永続ボーナスのため進歩リセット"
    ],
    rushFeatures: "主要機能",
    rushFeaturesList: [
      "プレステージシステム：永続+2%プレステージポイント毎でアップグレードリセット",
      "実績：プレステージポイント報酬付き6つの異なる実績",
      "アップグレード：各複数レベル付き4種類の装備",
      "ブーストシステム：時間とともに減衰する一時速度増加",
      "ギルドシステム：ボーナス乗数のマイニングギルド参加",
      "ブリッジ：MinersゲームからRush VaultへMLEO転送"
    ],
    goalDesc: "犬（マイナー）をマージ、岩を壊し、コインを獲得。コインはアップグレードとより多くのマイナー購入に使用されるゲーム内リソース。ゲーム内の一部活動もMLEOを蓄積可能（下記「マイニング＆トークン」参照）。",
    boardMerging: "ボード＆マージ",
    boardSteps: [
      "空スロットでADDをタップして犬を配置。コストは時間とともに上昇。",
      "同じレベルの2匹の犬を一緒にドラッグしてより高いレベルにマージ。",
      "各犬はそのレーンに毎秒ダメージ（DPS）を追加。岩が壊れるとコインを受け取る。"
    ],
    upgradesBonuses: "アップグレード＆ボーナス",
    upgradesList: [
      "DPSアップグレードで岩がより速く壊れる。",
      "GOLDアップグレードで各岩からのコイン獲得をアップグレード毎10%増加。",
      "ギフト、自動犬、その他のボーナスが時々現れる可能性。正確なタイミング、ドロップタイプ、バランス値は動的で予告なく変更可能。",
      "ダイヤモンドは収集して特別報酬に使用可能。可用性と報酬は保証されない。"
    ],
    miningTokens: "マイニング＆トークン（MLEO）",
    miningList: [
      "MLEO蓄積方法：岩を壊すことのみがMLEOを生成可能。岩破壊で獲得するコインの一部がゲームバランス、日次制限、アンチアビューズ保護に従い可変レートでMLEOに変換される可能性。",
      "日次制限＆テーパリング：公平性維持のため、個人日次制限に近づくと日次蓄積がテーパリングされる可能性。制限と計算は内部で変更可能。",
      "オフラインプログレス：アクティブプレイと比較して効率低下で限定的オフラインプログレスがシミュレート。正確な値は内部的で変更可能。",
      "CLAIM：蓄積されたMLEOがバランスとして表示。クレームでゲーム内Vaultに移動。オンチェーンクレームが利用可能になった場合、追加アンロックウィンドウと制限が適用される可能性。",
      "価値約束なし：このゲームのMLEOは娯楽用ユーティリティトークン。内在的または保証された金銭的価値なし。ここには提供、勧誘、将来価値約束はない。"
    ],
    goodToKnow: "知っておくと良い",
    goodToKnowList: [
      "ゲームバランス、ドロップ率、制限、スケジュールは動的で、安定性、公平性、メンテナンスのためいつでも変更、一時停止、リセット可能。",
      "バグ、エクスプロイト、アビューズ対応のため進歩が調整される可能性。",
      "これはテストネット版。開発中にデータが消去またはリセットされる可能性。",
      "利用可能時にオンチェーンでMLEOトークンをクレームするためウォレット接続。"
    ],
    arcadeWhat: "MLEO Arcadeとは？",
    arcadeWhatDesc: "MLEO Arcadeは、MLEOトークンを獲得できる24種類のエキサイティングなミニゲームのコレクションです！各ゲームはユニークなメカニクスとマルチプライヤーがあります。",
    arcadeHowToPlay: "プレイ方法",
    arcadeSteps: [
      "アーケードから任意のゲームを選択",
      "各ゲームは1ラウンド1,000 MLEOかかります（ボールトから差し引かれます）",
      "ゲーム固有の指示に従う",
      "最大10,000 MLEOの賞品とマルチプライヤーを獲得！",
      "すべての賞金は自動的にボールトに追加されます"
    ],
    arcadeFreePlay: "無料プレイトークン",
    arcadeFreePlayList: [
      "1時間ごとに1つの無料プレイトークンを獲得（最大5トークン）",
      "トークンを使用してMLEOを使わずに任意のゲームをプレイ",
      "無料プレイの賞金もボールトに追加されます！"
    ],
    arcadeGoodToKnow: "知っておくと良いこと",
    arcadeGoodToKnowList: [
      "ボールトはすべてのMLEOゲーム間で共有されます",
      "各ゲームは個人統計を追跡します",
      "すべてのゲームは公平な乱数生成を使用",
      "各ゲームのℹ️ボタンをクリックして特定のルールを確認"
    ],
  },
  ko: {
    name: "한국어", dir: "ltr", code: "ko",
    back: "← 돌아가기",
    logout: "로그아웃",
    liveTestnet: "라이브 테스트넷 • 게임에서 MLEO 획득",
    chooseGame: "게임 선택",
    chooseGameDesc: "두 가지 모드, 하나의 금고. 업그레이드로 활발히 플레이(마이너) 또는 패시브 적립 실행(토큰 러시). 언제든지 전환 가능.",
    miners: "MLEO — 마이너",
    minersDesc: "아이들 게임과 업그레이드, 클릭 선물과 부스트. 금고 통합 + 온체인 CLAIM으로 안정적이고 수동적인 진행.",
    active: "활성",
    howToPlay: "플레이 방법",
    terms: "약관",
    playMiners: "마이너 플레이",
    acceptTermsToPlay: "🔒 플레이하려면 약관 동의",
    rush: "MLEO — 러시",
    rushDesc: "프레스티지 시스템이 있는 고급 채굴! MLEO를 패시브하게 채굴하고, 장비를 업그레이드하고, 성과를 얻고, 영구 보너스를 위해 리셋.",
    passive: "패시브",
    playTokenRush: "토큰 러시 플레이",
    howToPlayTitle: "플레이 방법",
    goal: "목표",
    rushGoal: "러시 목표",
    rushGoalDesc: "MLEO 토큰을 패시브하게 채굴하고 제국을 건설하세요! 채굴한 MLEO를 사용해 장비를 업그레이드하고, 성과를 얻고, 영구 보너스를 위한 프레스티지. 더 많이 플레이할수록 강해집니다.",
    rushGameplay: "게임플레이",
    rushGameplaySteps: [
      "MLEO를 패시브하게 채굴 - 장비가 자동으로 작동",
      "BOOST 클릭하여 채굴 속도를 일시적으로 증가 (+2% 클릭당)",
      "채굴한 MLEO를 금고에 수집하여 업그레이드와 청구",
      "업그레이드 구매: 더 빠른 채굴을 위한 Auto-Drill, Helmet, Cart, Leo Bot",
      "마일스톤 달성으로 성과 획득하여 보너스 보상",
      "10M MLEO에서 프레스티지하여 영구 보너스를 위해 진행 리셋"
    ],
    rushFeatures: "주요 특징",
    rushFeaturesList: [
      "프레스티지 시스템: 프레스티지 포인트당 영구 +2%를 위해 업그레이드 리셋",
      "성과: 프레스티지 포인트 보상이 있는 6가지 다른 성과",
      "업그레이드: 각각 여러 레벨이 있는 4가지 장비 유형",
      "부스트 시스템: 시간이 지나면서 감소하는 일시적 속도 증가",
      "길드 시스템: 보너스 배수를 위한 채굴 길드 참여",
      "브리지: 마이너 게임에서 러시 금고로 MLEO 전송"
    ],
    goalDesc: "개(마이너)를 병합하고, 바위를 깨고, 코인을 획득하세요. 코인은 업그레이드와 더 많은 마이너 구매에 사용되는 게임 내 자원입니다. 게임의 일부 활동도 MLEO를 적립할 수 있습니다(아래 \"채굴 및 토큰\" 참조).",
    boardMerging: "보드 및 병합",
    boardSteps: [
      "빈 슬롯에서 ADD를 탭하여 개를 배치. 비용은 시간이 지나면서 증가.",
      "같은 레벨의 두 마리의 개를 함께 드래그하여 더 높은 레벨로 병합.",
      "각 개는 해당 레인에 초당 피해(DPS)를 추가. 바위가 깨지면 코인을 받습니다."
    ],
    upgradesBonuses: "업그레이드 및 보너스",
    upgradesList: [
      "DPS 업그레이드는 바위가 더 빨리 깨지게 합니다.",
      "GOLD 업그레이드는 각 바위에서 받는 코인을 업그레이드당 10% 증가시킵니다.",
      "선물, 자동 개 및 기타 보너스가 때때로 나타날 수 있습니다. 정확한 타이밍, 드롭 유형 및 밸런스 값은 동적이며 사전 통지 없이 변경될 수 있습니다.",
      "다이아몬드는 수집하여 특별 보상에 사용할 수 있습니다. 가용성과 보상은 보장되지 않습니다."
    ],
    miningTokens: "채굴 및 토큰 (MLEO)",
    miningList: [
      "MLEO 적립 방식: 바위를 깨는 것만이 MLEO를 생성할 수 있습니다. 바위를 깨서 획득한 코인의 일부는 게임 밸런스, 일일 제한 및 남용 방지 보호에 따라 가변 비율로 MLEO로 변환될 수 있습니다.",
      "일일 제한 및 테이퍼링: 공정성을 유지하기 위해 개인 일일 제한에 가까워질수록 일일 적립이 점진적으로 감소할 수 있습니다. 제한과 계산은 내부적이며 변경될 수 있습니다.",
      "오프라인 진행: 제한적인 오프라인 진행이 활성 플레이와 비교하여 낮은 효율로 시뮬레이션됩니다. 정확한 값은 내부적이며 변경될 수 있습니다.",
      "CLAIM: 적립된 MLEO가 잔액으로 표시됩니다. 청구하면 게임 내 금고로 이동합니다. 온체인 청구가 사용 가능해지면 추가 잠금 해제 창과 제한이 적용될 수 있습니다.",
      "가치 약속 없음: 이 게임의 MLEO는 엔터테인먼트용 유틸리티 토큰입니다. 본질적이거나 보장된 금전적 가치가 없습니다. 여기에는 제안, 권유 또는 미래 가치 약속이 없습니다."
    ],
    goodToKnow: "알면 좋은 것",
    goodToKnowList: [
      "게임 밸런스, 드롭률, 제한 및 일정은 동적이며 안정성, 공정성 또는 유지보수를 위해 언제든지 변경, 일시 중지 또는 리셋될 수 있습니다.",
      "버그, 악용 또는 남용을 해결하기 위해 진행이 조정될 수 있습니다.",
      "이는 테스트넷 버전입니다. 개발 중에 데이터가 삭제되거나 리셋될 수 있습니다.",
      "사용 가능할 때 온체인에서 MLEO 토큰을 청구하려면 지갑을 연결하세요."
    ],
    arcadeWhat: "MLEO Arcade란?",
    arcadeWhatDesc: "MLEO Arcade는 MLEO 토큰을 획득할 수 있는 24개의 흥미진진한 미니 게임 모음입니다! 각 게임은 고유한 메커니즘과 배수를 가지고 있습니다.",
    arcadeHowToPlay: "플레이 방법",
    arcadeSteps: [
      "아케이드에서 원하는 게임 선택",
      "각 게임은 라운드당 1,000 MLEO가 소요됩니다(금고에서 차감)",
      "게임별 지침 따르기",
      "최대 10,000 MLEO의 상금과 배수 획득!",
      "모든 상금은 자동으로 금고에 추가됩니다"
    ],
    arcadeFreePlay: "무료 플레이 토큰",
    arcadeFreePlayList: [
      "매시간 1개의 무료 플레이 토큰 획득(최대 5개 토큰)",
      "토큰을 사용하여 MLEO를 소비하지 않고 모든 게임 플레이",
      "무료 플레이 상금도 금고에 추가됩니다!"
    ],
    arcadeGoodToKnow: "알아두면 좋은 정보",
    arcadeGoodToKnowList: [
      "금고는 모든 MLEO 게임에서 공유됩니다",
      "각 게임은 개인 통계를 추적합니다",
      "모든 게임은 공정한 난수 생성 사용",
      "특정 규칙은 각 게임의 ℹ️ 버튼 클릭"
    ],
  },
  tr: {
    name: "Türkçe", dir: "ltr", code: "tr",
    back: "← Geri",
    logout: "Çıkış Yap",
    liveTestnet: "Canlı Testnet • Oyunda MLEO Kazanın",
    chooseGame: "Oyununuzu Seçin",
    chooseGameDesc: "İki mod, bir kasa. Yükseltmelerle aktif oynayın (Minerlar) veya pasif birikim çalıştırın (Token Rush). İstediğiniz zaman değiştirebilirsiniz.",
    miners: "MLEO — Minerlar",
    minersDesc: "Boş oyun ve yükseltmeler, tıklama hediyeleri ve artışlarla. Kasa entegrasyonu + zincir üzeri CLAIM ile istikrarlı, manuel ilerleme.",
    active: "Aktif",
    howToPlay: "NASIL OYNANIR",
    terms: "ŞARTLAR",
    playMiners: "Minerlar Oyna",
    acceptTermsToPlay: "🔒 Oynamak için şartları kabul et",
    rush: "MLEO — Rush",
    rushDesc: "Prestige sistemi ile gelişmiş madencilik! MLEO'yu pasif olarak kazın, ekipmanı yükseltin, başarılar kazanın ve kalıcı bonuslar için sıfırlayın.",
    passive: "Pasif",
    playTokenRush: "Token Rush Oyna",
    howToPlayTitle: "Nasıl oynanır",
    goal: "Hedef",
    rushGoal: "Rush Hedefi",
    rushGoalDesc: "MLEO tokenlerini pasif olarak kazın ve imparatorluğunuzu inşa edin! Kazılan MLEO'yu ekipman yükseltmeleri, başarılar ve kalıcı bonuslar için prestij için kullanın. Ne kadar çok oynarsanız, o kadar güçlü olursunuz.",
    rushGameplay: "Oyun",
    rushGameplaySteps: [
      "MLEO'yu pasif olarak kazın - ekipmanınız otomatik çalışır",
      "Madencilik hızını geçici olarak artırmak için BOOST'a tıklayın (+%2 tıklama başına)",
      "Kazılan MLEO'yu yükseltmeler ve talepler için kasınıza toplayın",
      "Yükseltme satın alın: Daha hızlı madencilik için Auto-Drill, Helmet, Cart ve Leo Bot",
      "Bonus ödüller için kilometre taşlarına ulaşarak başarılar kazanın",
      "Kalıcı bonuslar için ilerlemeyi sıfırlamak için 10M MLEO'da prestij"
    ],
    rushFeatures: "Ana özellikler",
    rushFeaturesList: [
      "Prestige Sistemi: Prestij puanı başına kalıcı +%2 için yükseltmeleri sıfırla",
      "Başarılar: Prestige Puan ödülleri olan 6 farklı başarı",
      "Yükseltmeler: Her biri birden fazla seviye olan 4 ekipman türü",
      "Boost Sistemi: Zamanla azalan geçici hız artışı",
      "Lonca Sistemi: Bonus çarpanları için madencilik loncalarına katılın",
      "Köprü: Minerlar oyunundan Rush kasasına MLEO transfer edin"
    ],
    goalDesc: "Köpekleri (minerlar) birleştirin, kayaları kırın ve jeton kazanın. Jetonlar, yükseltmeler ve daha fazla minar satın almak için kullanılan oyun içi kaynaktır. Oyundaki bazı aktiviteler de MLEO biriktirebilir (aşağıdaki \"Madencilik ve Tokenlar\" bölümüne bakın).",
    boardMerging: "Tahta ve Birleştirme",
    boardSteps: [
      "Köpek yerleştirmek için boş yuvada ADD'e dokunun. Maliyet zamanla artar.",
      "Aynı seviyedeki iki köpeği birlikte sürükleyerek daha yüksek seviyeye birleştirin.",
      "Her köpek şeridine saniye başına hasar (DPS) ekler. Kaya kırıldığında jeton alırsınız."
    ],
    upgradesBonuses: "Yükseltmeler ve Bonuslar",
    upgradesList: [
      "DPS yükseltmeleri kayaların daha hızlı kırılmasını sağlar.",
      "GOLD yükseltmeleri her kayadan aldığınız jetonları yükseltme başına %10 artırır.",
      "Hediyeler, otomatik köpekler ve diğer bonuslar zaman zaman görünebilir. Kesin zamanlamalar, düşürme türleri ve denge değerleri dinamiktir ve önceden haber verilmeksizin değişebilir.",
      "Elmaslar toplanabilir ve özel ödüller için harcanabilir. Kullanılabilirlik ve ödüller garanti edilmez."
    ],
    miningTokens: "Madencilik ve Tokenlar (MLEO)",
    miningList: [
      "MLEO nasıl birikir: Sadece kayaları kırmak MLEO üretebilir. Kaya kırmaktan kazandığınız jetonların bir kısmı, oyun dengesi, günlük limitler ve kötüye kullanım korumasına tabi olarak değişken oranda MLEO'ya dönüşebilir.",
      "Günlük limitler ve daraltma: Adaleti korumak için, kişisel günlük limitinize yaklaştıkça günlük birikim yavaş yavaş azalabilir. Limitler ve hesaplamalar dahili olup değişebilir.",
      "Çevrimdışı ilerleme: Sınırlı çevrimdışı ilerleme, aktif oyunla karşılaştırıldığında düşük verimlilikle simüle edilir. Kesin değerler dahili olup değişebilir.",
      "CLAIM: Biriken MLEO'nuz bakiye olarak görünür. Talep etmek onu oyun içi kasınıza taşır. Zincir üzeri talepler kullanılabilir hale gelirse, ek kilid açma pencereleri ve kısıtlamalar uygulanabilir.",
      "Değer vaadi yok: Bu oyundaki MLEO eğlence için bir fayda tokenıdır. İçsel veya garanti edilmiş parasal değeri yoktur. Burada hiçbir şey teklif, teşvik veya gelecek değer vaadi değildir."
    ],
    goodToKnow: "Bilmeniz Gerekenler",
    goodToKnowList: [
      "Oyun dengesi, düşürme oranları, limitler ve programlar dinamiktir ve istikrar, adalet veya bakım için her zaman değiştirilebilir, duraklatılabilir veya sıfırlanabilir.",
      "İlerleme, hataları, sömürüleri veya kötüye kullanımı ele almak için ayarlanabilir.",
      "Bu bir testnet versiyonudur. Veriler geliştirme sırasında silinebilir veya sıfırlanabilir.",
      "MLEO tokenlerini zincir üzerinde talep etmek için cüzdanınızı bağlayın."
    ],
    arcadeWhat: "MLEO Arcade nedir?",
    arcadeWhatDesc: "MLEO Arcade, MLEO tokenleri kazanabileceğiniz 24 heyecan verici mini oyun koleksiyonudur! Her oyunun benzersiz mekanikleri ve çarpanları vardır.",
    arcadeHowToPlay: "Nasıl oynanır",
    arcadeSteps: [
      "Arcade'dan herhangi bir oyun seçin",
      "Her oyun tur başına 1,000 MLEO maliyetlidir (kasanızdan düşülür)",
      "Oyuna özel talimatları izleyin",
      "10,000 MLEO'ya kadar ödüller ve çarpanlar kazanın!",
      "Tüm kazançlar otomatik olarak kasanıza eklenir"
    ],
    arcadeFreePlay: "Ücretsiz oyun tokenleri",
    arcadeFreePlayList: [
      "Her saat 1 ücretsiz oyun tokeni kazanın (maksimum 5 token)",
      "MLEO harcamadan herhangi bir oyunu oynamak için token kullanın",
      "Ücretsiz oyun kazançları yine de kasanıza eklenir!"
    ],
    arcadeGoodToKnow: "Bilmekte fayda var",
    arcadeGoodToKnowList: [
      "Kasanız tüm MLEO oyunları arasında paylaşılır",
      "Her oyun kişisel istatistiklerinizi izler",
      "Tüm oyunlar adil rastgele sayı üretimi kullanır",
      "Özel kurallar için her oyundaki ℹ️ düğmesine tıklayın"
    ],
  },
  it: {
    name: "Italiano", dir: "ltr", code: "it",
    back: "← Indietro",
    logout: "Esci",
    liveTestnet: "Testnet Live • Guadagna MLEO nel gioco",
    chooseGame: "Scegli il tuo gioco",
    chooseGameDesc: "Due modalità, una cassaforte. Gioca attivamente con miglioramenti (Miner) o lascia funzionare l'accumulo passivo (Token Rush). Puoi cambiare in qualsiasi momento.",
    miners: "MLEO — Miner",
    minersDesc: "Gioco idle e miglioramenti con regali click e boost. Integrazione cassaforte + CLAIM on-chain per progresso stabile e manuale.",
    active: "Attivo",
    howToPlay: "COME GIOCARE",
    terms: "TERMINI",
    playMiners: "Gioca Miner",
    acceptTermsToPlay: "🔒 Accetta termini per giocare",
    rush: "MLEO — Rush",
    rushDesc: "Mining avanzato con sistema Prestige! Mina MLEO passivamente, migliora equipaggiamento, guadagna risultati e resetta per bonus permanenti.",
    passive: "Passivo",
    playTokenRush: "Gioca Token Rush",
    howToPlayTitle: "Come giocare",
    goal: "Obiettivo",
    rushGoal: "Obiettivo Rush",
    rushGoalDesc: "Mina token MLEO passivamente e costruisci il tuo impero! Usa MLEO minato per migliorare equipaggiamento, guadagnare risultati e prestigio per bonus permanenti. Più giochi, più diventi forte.",
    rushGameplay: "Gameplay",
    rushGameplaySteps: [
      "Mina MLEO passivamente - il tuo equipaggiamento funziona automaticamente",
      "Clicca BOOST per aumentare temporaneamente la velocità di mining (+2% per click)",
      "Raccogli MLEO minato nella tua cassaforte per miglioramenti e richieste",
      "Compra miglioramenti: Auto-Drill, Helmet, Cart e Leo Bot per mining più veloce",
      "Guadagna risultati raggiungendo traguardi per ricompense bonus",
      "Prestigio a 10M MLEO per resettare progresso per bonus permanenti"
    ],
    rushFeatures: "Caratteristiche chiave",
    rushFeaturesList: [
      "Sistema Prestige: Resetta miglioramenti per +2% permanente per punto prestigio",
      "Risultati: 6 diversi risultati con ricompense punti Prestige",
      "Miglioramenti: 4 tipi di equipaggiamento con livelli multipli ciascuno",
      "Sistema Boost: Aumento temporaneo di velocità che diminuisce nel tempo",
      "Sistema gilda: Unisciti a gilde di mining per moltiplicatori bonus",
      "Ponte: Trasferisci MLEO dal gioco Miner alla cassaforte Rush"
    ],
    goalDesc: "Fondi cani (miner), rompi rocce e guadagna monete. Le monete sono una risorsa in-game usata per miglioramenti e comprare più miner. Alcune attività nel gioco possono anche accumulare MLEO (vedi \"Mining e Token\" sotto).",
    boardMerging: "Board e Fusione",
    boardSteps: [
      "Tocca ADD su uno slot vuoto per posizionare un cane. Il costo aumenta nel tempo.",
      "Trascina due cani dello stesso livello insieme per fondere in livello più alto.",
      "Ogni cane aggiunge danni al secondo (DPS) alla sua corsia. Quando una roccia si rompe ricevi monete."
    ],
    upgradesBonuses: "Miglioramenti e Bonus",
    upgradesList: [
      "I miglioramenti DPS fanno rompere le rocce più velocemente.",
      "I miglioramenti GOLD aumentano le monete che ricevi da ogni roccia del 10% per miglioramento.",
      "Regali, cani automatici e altri bonus possono apparire di tanto in tanto. I tempi esatti, tipi di drop e valori di bilanciamento sono dinamici e possono cambiare senza preavviso.",
      "I diamanti possono essere raccolti e spesi per ricompense speciali. Disponibilità e ricompense non sono garantite."
    ],
    miningTokens: "Mining e Token (MLEO)",
    miningList: [
      "Come MLEO si accumula: Solo rompere rocce può generare MLEO. Una porzione delle monete che guadagni rompendo rocce può convertirsi in MLEO a un tasso variabile soggetto a bilanciamento del gioco, limiti giornalieri e protezioni anti-abuso.",
      "Limiti giornalieri e attenuazione: Per mantenere equità, l'accumulo giornaliero può attenuarsi avvicinandosi al tuo limite personale giornaliero. Limiti e calcoli sono interni e possono cambiare.",
      "Progresso offline: Un progresso offline limitato è simulato con efficienza ridotta rispetto al gioco attivo. I valori esatti sono interni e possono cambiare.",
      "CLAIM: Il tuo MLEO accumulato appare come saldo. Richiedere lo sposta nella tua cassaforte in-game. Se/quando le richieste on-chain diventano disponibili, potrebbero applicarsi finestre di sblocco aggiuntive e restrizioni.",
      "Nessuna promessa di valore: MLEO in questo gioco è un token di utilità per intrattenimento. Non ha valore monetario intrinseco o garantito. Niente qui è offerta, sollecitazione o promessa di valore futuro."
    ],
    goodToKnow: "Buono da sapere",
    goodToKnowList: [
      "Il bilanciamento del gioco, tassi di drop, limiti e programmi sono dinamici e possono essere cambiati, messi in pausa o resettati in qualsiasi momento per stabilità, equità o manutenzione.",
      "Il progresso può essere aggiustato per affrontare bug, exploit o abuso.",
      "Questa è una versione testnet. I dati possono essere cancellati o resettati durante lo sviluppo.",
      "Connetti il tuo wallet per richiedere token MLEO on-chain quando disponibili."
    ],
    arcadeWhat: "Cos'è MLEO Arcade?",
    arcadeWhatDesc: "MLEO Arcade è una collezione di 24 entusiasmanti mini-giochi dove puoi vincere token MLEO! Ogni gioco ha meccaniche e moltiplicatori unici.",
    arcadeHowToPlay: "Come giocare",
    arcadeSteps: [
      "Scegli qualsiasi gioco dall'arcade",
      "Ogni gioco costa 1.000 MLEO per session (dedotto dalla tua cassaforte)",
      "Segui le istruzioni specifiche del gioco",
      "Vinci premi e moltiplicatori fino a 10.000 MLEO!",
      "Tutte le vincite vengono automaticamente aggiunte alla tua cassaforte"
    ],
    arcadeFreePlay: "Token gioco gratuito",
    arcadeFreePlayList: [
      "Guadagna 1 token gioco gratuito ogni ora (massimo 5 token)",
      "Usa i token per giocare a qualsiasi gioco senza spendere MLEO",
      "Le vincite di gioco gratuito vengono comunque aggiunte alla tua cassaforte!"
    ],
    arcadeGoodToKnow: "Buono a sapersi",
    arcadeGoodToKnowList: [
      "La tua cassaforte è condivisa tra tutti i giochi MLEO",
      "Ogni gioco tiene traccia delle tue statistiche personali",
      "Tutti i giochi utilizzano generazione di numeri casuali equa",
      "Fai clic sul pulsante ℹ️ su ogni gioco per le regole specifiche"
    ],
  },
  ka: {
    name: "ქართული", dir: "ltr", code: "ka",
    back: "← უკან",
    logout: "გასვლა",
    liveTestnet: "ცოცხალი ტესტნეტი • მიიღე MLEO თამაშში",
    chooseGame: "აირჩიე შენი თამაში",
    chooseGameDesc: "ორი რეჟიმი, ერთი საცავი. ითამაშე აქტივურად გაუმჯობესებებით (მაინერები) ან დაუშვი პასიური დაგროვება (ტოკენ ბუმი). შეგიძლია ნებისმიერ დროს შეცვალო.",
    miners: "MLEO — მაინერები",
    minersDesc: "უმოქმედო თამაში და გაუმჯობესებები, დაწკაპუნების საჩუქრებით და ბუსტებით. საცავის ინტეგრაცია + ონჩეინ CLAIM სტაბილური, ხელით პროგრესისთვის.",
    active: "აქტიური",
    howToPlay: "როგორ ვითამაშოთ",
    terms: "პირობები",
    playMiners: "ითამაშე მაინერები",
    acceptTermsToPlay: "🔒 მიიღე პირობები თამაშისთვის",
    rush: "MLEO — ბუმი",
    rushDesc: "მოწინავე მაინინგი პრესტიჟის სისტემით! მოიპოვე MLEO პასიურად, გააუმჯობესე აღჭურვილობა, მიიღე მიღწევები და გადატვირთე მუდმივი ბონუსებისთვის.",
    passive: "პასიური",
    playTokenRush: "ითამაშე ტოკენ ბუმი",
    howToPlayTitle: "როგორ ვითამაშოთ",
    goal: "მიზანი",
    rushGoal: "ბუმის მიზანი",
    rushGoalDesc: "მოიპოვე MLEO ტოკენები პასიურად და ააშენე შენი იმპერია! გამოიყენე მოპოვებული MLEO აღჭურვილობის გასაუმჯობესებლად, მიღწევების მისაღებად და პრესტიჟისთვის მუდმივი ბონუსებისთვის. რაც უფრო მეტს თამაშობ, მით უფრო ძლიერი ხდები.",
    rushGameplay: "თამაშის პროცესი",
    rushGameplaySteps: [
      "მოიპოვე MLEO პასიურად - შენი აღჭურვილობა ავტომატურად მუშაობს",
      "დააწკაპუნე BOOST-ზე მაინინგის სიჩქარის დროებით გასაზრდელად (+2% ყოველ დაწკაპუნებაზე)",
      "შეაგროვე მოპოვებული MLEO შენს საცავში გაუმჯობესებებისთვის და მოთხოვნებისთვის",
      "იყიდე გაუმჯობესებები: Auto-Drill, Helmet, Cart და Leo Bot უფრო სწრაფი მაინინგისთვის",
      "მიიღე მიღწევები მიზნების მიღწევით ბონუს ჯილდოებისთვის",
      "პრესტიჟი 10M MLEO-ზე პროგრესის გადატვირთვისთვის მუდმივი ბონუსებისთვის"
    ],
    rushFeatures: "მთავარი მახასიათებლები",
    rushFeaturesList: [
      "პრესტიჟის სისტემა: გადატვირთე გაუმჯობესებები მუდმივი +2%-ისთვის ყოველ პრესტიჟის ქულაზე",
      "მიღწევები: 6 განსხვავებული მიღწევა პრესტიჟის ქულების ჯილდოებით",
      "გაუმჯობესებები: 4 აღჭურვილობის ტიპი ყოველში მრავალი დონით",
      "ბუსტის სისტემა: დროებითი სიჩქარის გაზრდა, რომელიც დროთა განმავლობაში მცირდება",
      "გილდიის სისტემა: შეუერთდი მაინინგის გილდიებს ბონუს მულტიპლიკატორებისთვის",
      "ხიდი: გადაიტანე MLEO მაინერების თამაშიდან ბუმის საცავში"
    ],
    goalDesc: "შეაერთე ძაღლები (მაინერები), მოტეხე ქვები და მიიღე მონეტები. მონეტები არის თამაშის რესურსი, რომელიც გამოიყენება გაუმჯობესებებისთვის და მეტი მაინერის შესაძენად. თამაშში გარკვეული აქტივობები ასევე შეიძლება დაგროვდეს MLEO (იხილე \"მაინინგი და ტოკენები\" ქვემოთ).",
    boardMerging: "დაფა და შერწყმა",
    boardSteps: [
      "დააწკაპუნე ADD ცარიელ სლოტზე ძაღლის დასაყენებლად. ღირებულება დროთა განმავლობაში იზრდება.",
      "გადაიტანე ორი ძაღლი იგივე დონის ერთად მაღალ დონეზე შერწყმისთვის.",
      "ყოველი ძაღლი ამატებს ზიანს წამში (DPS) მის ღერძზე. როცა ქვა იშლება, მიიღებ მონეტებს."
    ],
    upgradesBonuses: "გაუმჯობესებები და ბონუსები",
    upgradesList: [
      "DPS გაუმჯობესებები ქვებს უფრო სწრაფად იშლება.",
      "GOLD გაუმჯობესებები იზრდება მონეტებს, რომლებსაც მიიღებ ყოველი ქვისგან 10%-ით ყოველ გაუმჯობესებაზე.",
      "საჩუქრები, ავტო-ძაღლები და სხვა ბონუსები შეიძლება დროდადრო გამოჩნდეს. ზუსტი დროები, ვარდნის ტიპები და ბალანსის მნიშვნელობები დინამიურია და შეიძლება შეიცვალოს წინასწარ შეტყობინების გარეშე.",
      "ბრილიანტები შეიძლება შეაგროვო და დახარჯო სპეციალური ჯილდოებისთვის. ხელმისაწვდომობა და ჯილდოები გარანტირებული არაა."
    ],
    miningTokens: "მაინინგი და ტოკენები (MLEO)",
    miningList: [
      "როგორ გროვდება MLEO: მხოლოდ ქვების მოტეხვა შეუძლია MLEO-ს გენერირება. მონეტების ნაწილი, რომლებსაც მიიღებ ქვების მოტეხვით, შეიძლება გადაიქცეს MLEO-დ ცვალებადი კურსით, რომელიც ექვემდებარება თამაშის ბალანსს, დღიურ ლიმიტებს და ბოროტად გამოყენებისგან დაცვას.",
      "დღიური ლიმიტები და შემცირება: სამართლიანობის შესანარჩუნებლად, დღიური დაგროვება შეიძლება შემცირდეს პირადი დღიური ლიმიტის მიახლოებისას. ლიმიტები და გამოთვლები შიდაა და შეიძლება შეიცვალოს.",
      "ოფლაინ პროგრესი: შეზღუდული ოფლაინ პროგრესი სიმულაციაა შემცირებული ეფექტიანობით აქტიური თამაშის მიმართ. ზუსტი მნიშვნელობები შიდაა და შეიძლება შეიცვალოს.",
      "CLAIM: შენი დაგროვებული MLEO ჩნდება როგორც ბალანსი. მოთხოვნა გადააქვს მას შენს თამაშის საცავში. თუ/როცა ონჩეინ მოთხოვნები ხელმისაწვდომი გახდება, შეიძლება დაემატოს დამატებითი გახსნის ფანჯრები და შეზღუდვები.",
      "ღირებულების შეთანხმება არაა: ამ თამაშში MLEO არის გასართობი სასარგებლო ტოკენი. მას არ აქვს შინაგანი ან გარანტირებული ფულადი ღირებულება. აქ არაფერია შეთავაზება, მოთხოვნა ან მომავალი ღირებულების შეთანხმება."
    ],
    goodToKnow: "კარგია ვიცოდეთ",
    goodToKnowList: [
      "თამაშის ბალანსი, ვარდნის კურსები, ლიმიტები და გრაფიკები დინამიურია და შეიძლება შეიცვალოს, შეჩერდეს ან გადატვირთოს ნებისმიერ დროს სტაბილურობისთვის, სამართლიანობისთვის ან მოვლისთვის.",
      "პროგრესი შეიძლება დარეგულირდეს ბაგების, ექსპლოიტების ან ბოროტად გამოყენების გადასაჭრელად.",
      "ეს არის ტესტნეტის ვერსია. მონაცემები შეიძლება წაიშალოს ან გადატვირთოს განვითარების დროს.",
      "დაუკავშირდი შენს საფულეს MLEO ტოკენების ონჩეინ მოთხოვნისთვის, როცა ხელმისაწვდომი იქნება."
    ],
    arcadeWhat: "რა არის MLEO Arcade?",
    arcadeWhatDesc: "MLEO Arcade არის 24 საინტერესო მინი-თამაშის კოლექცია, სადაც შეგიძლია მოიგო MLEO ტოკენები! თითოეულ თამაშს აქვს უნიკალური მექანიზმები და მულტიპლიკატორები.",
    arcadeHowToPlay: "როგორ ვითამაშოთ",
    arcadeSteps: [
      "აირჩიე ნებისმიერი თამაში არკადიდან",
      "თითოეული თამაში ჯდება 1,000 MLEO რაუნდზე (გაიქვითება შენი საცავიდან)",
      "მიჰყევი თამაშის სპეციფიურ ინსტრუქციებს",
      "მოიგე პრიზები და მულტიპლიკატორები 10,000 MLEO-მდე!",
      "ყველა მოგება ავტომატურად ემატება შენს საცავს"
    ],
    arcadeFreePlay: "უფასო თამაშის ტოკენები",
    arcadeFreePlayList: [
      "მიიღე 1 უფასო თამაშის ტოკენი ყოველ საათში (მაქს 5 ტოკენი)",
      "გამოიყენე ტოკენები ნებისმიერი თამაშის სათამაშოდ MLEO-ს დახარჯვის გარეშე",
      "უფასო თამაშის მოგებები მაინც ემატება შენს საცავს!"
    ],
    arcadeGoodToKnow: "კარგი იცოდე",
    arcadeGoodToKnowList: [
      "შენი საცავი გაზიარებულია ყველა MLEO თამაშს შორის",
      "თითოეული თამაში ადევნებს შენ პირად სტატისტიკას",
      "ყველა თამაში იყენებს სამართლიან შემთხვევითი რიცხვების გენერირებას",
      "დააწკაპუნე ℹ️ ღილაკზე თითოეულ თამაშზე სპეციფიური წესებისთვის"
    ],
  },
  pl: {
    name: "Polski", dir: "ltr", code: "pl",
    back: "← Wstecz",
    logout: "Wyloguj",
    liveTestnet: "Live Testnet • Zarabiaj MLEO w grze",
    chooseGame: "Wybierz swoją grę",
    chooseGameDesc: "Dwa tryby, jeden skarbiec. Graj aktywnie z ulepszeniami (Górnicy) lub pozwól pasywnemu gromadzeniu działać (Token Rush). Możesz przełączać się w dowolnym momencie.",
    miners: "MLEO — Górnicy",
    minersDesc: "Gra idle i ulepszenia z prezentami kliknięć i boostami. Integracja skarbca + CLAIM on-chain dla stabilnego, ręcznego postępu.",
    active: "Aktywny",
    howToPlay: "JAK GRAĆ",
    terms: "WARUNKI",
    playMiners: "Graj Górnicy",
    acceptTermsToPlay: "🔒 Zaakceptuj warunki aby grać",
    rush: "MLEO — Rush",
    rushDesc: "Zaawansowane kopanie z systemem Prestige! Kop MLEO pasywnie, ulepszaj sprzęt, zdobywaj osiągnięcia i resetuj dla stałych bonusów.",
    passive: "Pasywny",
    playTokenRush: "Graj Token Rush",
    howToPlayTitle: "Jak grać",
    goal: "Cel",
    rushGoal: "Cel Rush",
    rushGoalDesc: "Kop tokeny MLEO pasywnie i buduj swoje imperium! Używaj wykopanego MLEO do ulepszania sprzętu, zdobywania osiągnięć i prestiżu dla stałych bonusów. Im więcej grasz, tym silniejszy się stajesz.",
    rushGameplay: "Rozgrywka",
    rushGameplaySteps: [
      "Kop MLEO pasywnie - twój sprzęt działa automatycznie",
      "Kliknij BOOST aby tymczasowo zwiększyć prędkość kopania (+2% na kliknięcie)",
      "Zbieraj wykopane MLEO do swojego skarbca na ulepszenia i roszczenia",
      "Kup ulepszenia: Auto-Drill, Helmet, Cart i Leo Bot dla szybszego kopania",
      "Zdobywaj osiągnięcia osiągając kamienie milowe dla bonusowych nagród",
      "Prestiż przy 10M MLEO aby zresetować postęp dla stałych bonusów"
    ],
    rushFeatures: "Kluczowe funkcje",
    rushFeaturesList: [
      "System Prestige: Resetuj ulepszenia dla stałych +2% na punkt prestiżu",
      "Osiągnięcia: 6 różnych osiągnięć z nagrodami punktów Prestige",
      "Ulepszenia: 4 typy sprzętu z wieloma poziomami każdy",
      "System Boost: Tymczasowy wzrost prędkości który maleje z czasem",
      "System gildii: Dołącz do gildii kopania dla bonusowych mnożników",
      "Most: Transferuj MLEO z gry Górnicy do skarbca Rush"
    ],
    goalDesc: "Łącz psy (górników), łam skały i zarabiaj monety. Monety to zasób w grze używany do ulepszeń i kupowania więcej górników. Niektóre aktywności w grze mogą też gromadzić MLEO (zobacz \"Kopanie i Tokeny\" poniżej).",
    boardMerging: "Plansza i Łączenie",
    boardSteps: [
      "Dotknij ADD na pustym slocie aby umieścić psa. Koszt rośnie z czasem.",
      "Przeciągnij dwa psy tego samego poziomu razem aby połączyć w wyższy poziom.",
      "Każdy pies dodaje obrażenia na sekundę (DPS) do swojego pasa. Gdy skała się złamie otrzymujesz monety."
    ],
    upgradesBonuses: "Ulepszenia i Bonusy",
    upgradesList: [
      "Ulepszenia DPS sprawiają że skały łamią się szybciej.",
      "Ulepszenia GOLD zwiększają monety które otrzymujesz z każdej skały o 10% na ulepszenie.",
      "Prezenty, automatyczne psy i inne bonusy mogą pojawiać się od czasu do czasu. Dokładne czasy, typy dropów i wartości balansu są dynamiczne i mogą się zmieniać bez powiadomienia.",
      "Diamenty mogą być zbierane i wydawane na specjalne nagrody. Dostępność i nagrody nie są gwarantowane."
    ],
    miningTokens: "Kopanie i Tokeny (MLEO)",
    miningList: [
      "Jak MLEO się gromadzi: Tylko łamanie skał może generować MLEO. Część monet które zarabiasz łamiąc skały może konwertować się na MLEO w zmiennej stopie podlegającej balansowi gry, dziennym limitom i ochronie przed nadużyciami.",
      "Dzienne limity i zmniejszanie: Aby utrzymać sprawiedliwość, dzienne gromadzenie może się zmniejszać gdy zbliżasz się do swojego osobistego dziennego limitu. Limity i kalkulacje są wewnętrzne i mogą się zmieniać.",
      "Postęp offline: Ograniczony postęp offline jest symulowany z obniżoną efektywnością w porównaniu do aktywnej gry. Dokładne wartości są wewnętrzne i mogą się zmieniać.",
      "CLAIM: Twoje nagromadzone MLEO pojawia się jako balans. Roszczenie przenosi je do twojego skarbca w grze. Jeśli/kiedy roszczenia on-chain staną się dostępne, mogą zastosować dodatkowe okna odblokowania i ograniczenia.",
      "Brak obietnicy wartości: MLEO w tej grze to token użytkowy dla rozrywki. Nie ma wewnętrznej lub gwarantowanej wartości pieniężnej. Nic tu nie jest ofertą, zachętą lub obietnicą przyszłej wartości."
    ],
    goodToKnow: "Warto wiedzieć",
    goodToKnowList: [
      "Balans gry, stopy dropów, limity i harmonogramy są dynamiczne i mogą być zmieniane, wstrzymywane lub resetowane w dowolnym momencie dla stabilności, sprawiedliwości lub konserwacji.",
      "Postęp może być dostosowany aby rozwiązać błędy, eksploity lub nadużycia.",
      "To jest wersja testnet. Dane mogą być usunięte lub zresetowane podczas rozwoju.",
      "Połącz swój portfel aby rościć tokeny MLEO on-chain gdy będą dostępne."
    ],
    arcadeWhat: "Co to jest MLEO Arcade?",
    arcadeWhatDesc: "MLEO Arcade to kolekcja 24 ekscytujących mini-gier, w których możesz wygrać tokeny MLEO! Każda gra ma unikalne mechaniki i multiplikatory.",
    arcadeHowToPlay: "Jak grać",
    arcadeSteps: [
      "Wybierz dowolną grę z arcade",
      "Każda gra kosztuje 1,000 MLEO za rundę (odliczone od twojego skarbca)",
      "Postępuj zgodnie z instrukcjami specyficznymi dla gry",
      "Wygrywaj nagrody i multiplikatory do 10,000 MLEO!",
      "Wszystkie wygrane są automatycznie dodawane do twojego skarbca"
    ],
    arcadeFreePlay: "Tokeny darmowej gry",
    arcadeFreePlayList: [
      "Zdobądź 1 token darmowej gry co godzinę (maksimum 5 tokenów)",
      "Użyj tokenów do grania w dowolną grę bez wydawania MLEO",
      "Wygrane z darmowej gry nadal są dodawane do twojego skarbca!"
    ],
    arcadeGoodToKnow: "Dobrze wiedzieć",
    arcadeGoodToKnowList: [
      "Twój skarbiec jest wspólny dla wszystkich gier MLEO",
      "Każda gra śledzi twoje osobiste statystyki",
      "Wszystkie gry używają uczciwej generacji liczb losowych",
      "Kliknij przycisk ℹ️ w każdej grze, aby zobaczyć konkretne zasady"
    ],
  },
  ro: {
    name: "Română", dir: "ltr", code: "ro",
    back: "← Înapoi",
    logout: "Deconectare",
    liveTestnet: "Testnet Live • Câștigă MLEO în joc",
    chooseGame: "Alege jocul tău",
    chooseGameDesc: "Două moduri, un seif. Joacă activ cu upgrade-uri (Mineri) sau lasă acumularea pasivă să funcționeze (Token Rush). Poți schimba oricând.",
    miners: "MLEO — Mineri",
    minersDesc: "Joc idle și upgrade-uri cu cadouri click și boost-uri. Integrare seif + CLAIM on-chain pentru progres stabil și manual.",
    active: "Activ",
    howToPlay: "CUM SE JOACĂ",
    terms: "TERMENI",
    playMiners: "Joacă Mineri",
    acceptTermsToPlay: "🔒 Acceptă termenii pentru a juca",
    rush: "MLEO — Rush",
    rushDesc: "Mining avansat cu sistem Prestige! Minează MLEO pasiv, îmbunătățește echipamentul, câștigă realizări și resetează pentru bonusuri permanente.",
    passive: "Pasiv",
    playTokenRush: "Joacă Token Rush",
    howToPlayTitle: "Cum se joacă",
    goal: "Obiectiv",
    rushGoal: "Obiectiv Rush",
    rushGoalDesc: "Minează token-uri MLEO pasiv și construiește imperiul tău! Folosește MLEO minat pentru îmbunătățirea echipamentului, câștigarea realizărilor și prestigiu pentru bonusuri permanente. Cu cât joci mai mult, cu atât devii mai puternic.",
    rushGameplay: "Gameplay",
    rushGameplaySteps: [
      "Minează MLEO pasiv - echipamentul tău funcționează automat",
      "Apasă BOOST pentru a crește temporar viteza de mining (+2% per click)",
      "Colectează MLEO minat în seiful tău pentru upgrade-uri și cereri",
      "Cumpără upgrade-uri: Auto-Drill, Helmet, Cart și Leo Bot pentru mining mai rapid",
      "Câștigă realizări atingând repere pentru recompense bonus",
      "Prestigiu la 10M MLEO pentru a reseta progresul pentru bonusuri permanente"
    ],
    rushFeatures: "Caracteristici cheie",
    rushFeaturesList: [
      "Sistem Prestige: Resetează upgrade-urile pentru +2% permanent per punct prestigiu",
      "Realizări: 6 realizări diferite cu recompense puncte Prestige",
      "Upgrade-uri: 4 tipuri de echipament cu mai multe niveluri fiecare",
      "Sistem Boost: Creștere temporară de viteză care scade în timp",
      "Sistem guild: Alătură-te guild-urilor de mining pentru multiplicatori bonus",
      "Pod: Transferă MLEO din jocul Mineri în seiful Rush"
    ],
    goalDesc: "Fuzionează câini (mineri), sparge pietre și câștigă monede. Monedele sunt o resursă în joc folosită pentru upgrade-uri și cumpărarea mai multor mineri. Unele activități în joc rewardPool de asemenea acumula MLEO (vezi \"Mining și Token-uri\" mai jos).",
    boardMerging: "Board și Fuzionare",
    boardSteps: [
      "Atinge ADD pe un slot gol pentru a plasa un câine. Costul crește în timp.",
      "Trage doi câini de același nivel împreună pentru a fuziona într-un nivel mai înalt.",
      "Fiecare câine adaugă daune pe secundă (DPS) la banda sa. Când o piatră se sparge primești monede."
    ],
    upgradesBonuses: "Upgrade-uri și Bonusuri",
    upgradesList: [
      "Upgrade-urile DPS fac pietrele să se spargă mai repede.",
      "Upgrade-urile GOLD cresc monedele pe care le primești de la fiecare piatră cu 10% per upgrade.",
      "Cadourile, câinii automat și alte bonusuri rewardPool apărea din când în când. Timpii exacți, tipurile de drop și valorile de balans sunt dinamice și rewardPool schimba fără notificare.",
      "Diamantele rewardPool fi colectate și cheltuite pentru recompense speciale. Disponibilitatea și recompensele nu sunt garantate."
    ],
    miningTokens: "Mining și Token-uri (MLEO)",
    miningList: [
      "Cum se acumulează MLEO: Doar spargerea pietrelor poate genera MLEO. O porțiune din monedele pe care le câștigi spargând pietre se poate converti în MLEO la o rată variabilă supusă balansului jocului, limitelor zilnice și protecțiilor anti-abuz.",
      "Limite zilnice și atenuare: Pentru a menține echitatea, acumularea zilnică se poate atenua când te apropii de limita ta personală zilnică. Limitele și calculele sunt interne și se rewardPool schimba.",
      "Progres offline: Progresul offline limitat este simulat cu eficiență redusă comparat cu jocul activ. Valorile exacte sunt interne și se rewardPool schimba.",
      "CLAIM: MLEO-ul tău acumulat apare ca balans. Cererea îl mută în seiful tău în joc. Dacă/când cererile on-chain devin disponibile, se rewardPool aplica ferestre de deblocare suplimentare și restricții.",
      "Fără promisiune de valoare: MLEO în acest joc este un token utilitar pentru divertisment. Nu are valoare monetară intrinsecă sau garantată. Nimic aici nu este ofertă, solicitare sau promisiune de valoare viitoare."
    ],
    goodToKnow: "Bun de știut",
    goodToKnowList: [
      "Balansul jocului, ratele de drop, limitele și programele sunt dinamice și rewardPool fi schimbate, puse în pauză sau resetate oricând pentru stabilitate, echitate sau întreținere.",
      "Progresul poate fi ajustat pentru a aborda bug-uri, exploit-uri sau abuz.",
      "Aceasta este o versiune testnet. Datele rewardPool fi șterse sau resetate în timpul dezvoltării.",
      "Conectează-ți portofelul pentru a cere token-uri MLEO on-chain când sunt disponibile."
    ],
    arcadeWhat: "Ce este MLEO Arcade?",
    arcadeWhatDesc: "MLEO Arcade este o colecție de 24 mini-jocuri interesante unde poți câștiga token-uri MLEO! Fiecare joc are mecanici și multiplicatori unici.",
    arcadeHowToPlay: "Cum să joci",
    arcadeSteps: [
      "Alege orice joc din arcade",
      "Fiecare joc costă 1,000 MLEO pe rundă (dedus din seiful tău)",
      "Urmează instrucțiunile specifice jocului",
      "Câștigă premii și multiplicatori până la 10,000 MLEO!",
      "Toate câștigurile sunt adăugate automat în seiful tău"
    ],
    arcadeFreePlay: "Token-uri joc gratuit",
    arcadeFreePlayList: [
      "Câștigă 1 token joc gratuit în fiecare oră (maximum 5 token-uri)",
      "Folosește token-uri pentru a juca orice joc fără a cheltui MLEO",
      "Câștigurile de joc gratuit sunt tot adăugate în seiful tău!"
    ],
    arcadeGoodToKnow: "Bine de știut",
    arcadeGoodToKnowList: [
      "Seiful tău este partajat între toate jocurile MLEO",
      "Fiecare joc urmărește statisticile tale personale",
      "Toate jocurile folosesc generare echitabilă de numere aleatoare",
      "Apasă butonul ℹ️ pe fiecare joc pentru reguli specifice"
    ],
  },
  cs: {
    name: "Čeština", dir: "ltr", code: "cs",
    back: "← Zpět",
    logout: "Odhlásit se",
    liveTestnet: "Live Testnet • Získejte MLEO ve hře",
    chooseGame: "Vyberte si hru",
    chooseGameDesc: "Dva režimy, jeden trezor. Hrajte aktivně s vylepšeními (Horníci) nebo nechte pasivní akumulaci běžet (Token Rush). Můžete kdykoli přepnout.",
    miners: "MLEO — Horníci",
    minersDesc: "Idle hra a vylepšení s klikacími dárky a boosty. Integrace trezoru + CLAIM on-chain pro stabilní, manuální pokrok.",
    active: "Aktivní",
    howToPlay: "JAK HRÁT",
    terms: "PODMÍNKY",
    playMiners: "Hraj Horníci",
    acceptTermsToPlay: "🔒 Přijmout podmínky pro hraní",
    rush: "MLEO — Rush",
    rushDesc: "Pokročilé těžba se systémem Prestige! Těžte MLEO pasivně, vylepšujte vybavení, získávejte úspěchy a resetujte pro trvalé bonusy.",
    passive: "Pasivní",
    playTokenRush: "Hraj Token Rush",
    howToPlayTitle: "Jak hrát",
    goal: "Cíl",
    rushGoal: "Cíl Rush",
    rushGoalDesc: "Těžte MLEO tokeny pasivně a budujte své impérium! Používejte vytěžené MLEO pro vylepšení vybavení, získávání úspěchů a prestiž pro trvalé bonusy. Čím více hrajete, tím silnější se stáváte.",
    rushGameplay: "Hratelnost",
    rushGameplaySteps: [
      "Těžte MLEO pasivně - vaše vybavení funguje automaticky",
      "Klikněte BOOST pro dočasné zvýšení rychlosti těžby (+2% na kliknutí)",
      "Sbírejte vytěžené MLEO do svého trezoru pro vylepšení a nároky",
      "Kupujte vylepšení: Auto-Drill, Helmet, Cart a Leo Bot pro rychlejší těžbu",
      "Získávejte úspěchy dosahováním milníků pro bonusové odměny",
      "Prestiž při 10M MLEO pro reset pokroku pro trvalé bonusy"
    ],
    rushFeatures: "Klíčové funkce",
    rushFeaturesList: [
      "Systém Prestige: Resetujte vylepšení pro trvalé +2% na bod prestiže",
      "Úspěchy: 6 různých úspěchů s odměnami bodů Prestige",
      "Vylepšení: 4 typy vybavení s více úrovněmi každý",
      "Systém Boost: Dočasné zvýšení rychlosti které se časem snižuje",
      "Systém cechů: Připojte se k těžebním cechům pro bonusové multiplikátory",
      "Most: Přeneste MLEO z hry Horníci do trezoru Rush"
    ],
    goalDesc: "Slučujte psy (horníky), lámejte kameny a vydělávejte mince. Mince jsou herní zdroj používaný pro vylepšení a nákup více horníků. Některé aktivity ve hře mohou také akumulovat MLEO (viz \"Těžba a Tokeny\" níže).",
    boardMerging: "Deska a Slučování",
    boardSteps: [
      "Klikněte ADD na prázdný slot pro umístění psa. Náklady rostou v čase.",
      "Přetáhněte dva psy stejné úrovně dohromady pro sloučení na vyšší úroveň.",
      "Každý pes přidává poškození za sekundu (DPS) ke své dráze. Když se kámen zlomí, dostanete mince."
    ],
    upgradesBonuses: "Vylepšení a Bonusy",
    upgradesList: [
      "DPS vylepšení způsobují, že kameny se lámou rychleji.",
      "GOLD vylepšení zvyšují mince, které dostanete z každého kamene o 10% na vylepšení.",
      "Dárky, automatické psi a jiné bonusy se mohou objevovat čas od času. Přesné časy, typy dropů a hodnoty vyvážení jsou dynamické a mohou se změnit bez upozornění.",
      "Diamanty mohou být sbírány a utráceny za speciální odměny. Dostupnost a odměny nejsou zaručeny."
    ],
    miningTokens: "Těžba a Tokeny (MLEO)",
    miningList: [
      "Jak se MLEO akumuluje: Pouze lámání kamenů může generovat MLEO. Část mincí, které vyděláte lámáním kamenů, se může převést na MLEO při proměnlivé sazbě podléhající hernímu vyvážení, denním limitům a ochraně proti zneužití.",
      "Denní limity a útlum: Pro udržení spravedlnosti se denní akumulace může utlumit, když se blížíte k vašemu osobnímu dennímu limitu. Limity a výpočty jsou interní a mohou se změnit.",
      "Offline pokrok: Omezený offline pokrok je simulován s redukovanou účinností ve srovnání s aktivní hrou. Přesné hodnoty jsou interní a mohou se změnit.",
      "CLAIM: Vaše akumulované MLEO se zobrazuje jako zůstatek. Nárok ho přesune do vašeho herního trezoru. Pokud/když se stanou dostupné on-chain nároky, mohou se použít další odblokovací okna a omezení.",
      "Žádný slib hodnoty: MLEO v této hře je utilitní token pro zábavu. Nemá vnitřní ani zaručenou peněžní hodnotu. Nic zde není nabídka, vybídka nebo slib budoucí hodnoty."
    ],
    goodToKnow: "Dobré vědět",
    goodToKnowList: [
      "Herní vyvážení, sazby dropů, limity a rozvrhy jsou dynamické a mohou být změněny, pozastaveny nebo resetovány kdykoli pro stabilitu, spravedlnost nebo údržbu.",
      "Pokrok může být upraven pro řešení chyb, exploitů nebo zneužití.",
      "Toto je testnet verze. Data mohou být vymazána nebo resetována během vývoje.",
      "Připojte svou peněženku pro nárok na MLEO tokeny on-chain, když budou dostupné."
    ],
    arcadeWhat: "Co je MLEO Arcade?",
    arcadeWhatDesc: "MLEO Arcade je kolekce 24 vzrušujících mini-her, kde můžete vyhrát MLEO tokeny! Každá hra má unikátní mechaniky a multiplikátory.",
    arcadeHowToPlay: "Jak hrát",
    arcadeSteps: [
      "Vyberte jakoukoliv hru z arkády",
      "Každá hra stojí 1,000 MLEO za kolo (odečte se z vašeho trezoru)",
      "Postupujte podle specifických pokynů hry",
      "Vyhrávejte ceny a multiplikátory až do 10,000 MLEO!",
      "Všechny výhry se automaticky přidají do vašeho trezoru"
    ],
    arcadeFreePlay: "Tokeny zdarma",
    arcadeFreePlayList: [
      "Získejte 1 token zdarma každou hodinu (maximum 5 tokenů)",
      "Použijte tokeny k hraní jakékoliv hry bez utrácení MLEO",
      "Výhry zdarma se stále přidávají do vašeho trezoru!"
    ],
    arcadeGoodToKnow: "Dobré vědět",
    arcadeGoodToKnowList: [
      "Váš trezor je sdílen mezi všemi MLEO hrami",
      "Každá hra sleduje vaše osobní statistiky",
      "Všechny hry používají spravedlivou generaci náhodných čísel",
      "Klikněte na tlačítko ℹ️ u každé hry pro specifická pravidla"
    ],
  },
  nl: {
    name: "Nederlands", dir: "ltr", code: "nl",
    back: "← Terug",
    logout: "Uitloggen",
    liveTestnet: "Live Testnet • Verdien MLEO in het spel",
    chooseGame: "Kies je spel",
    chooseGameDesc: "Twee modi, één kluis. Speel actief met upgrades (Mijnwerkers) of laat passieve accumulatie draaien (Token Rush). Je kunt altijd wisselen.",
    miners: "MLEO — Mijnwerkers",
    minersDesc: "Idle spel en upgrades met klik geschenken en boosts. Kluis integratie + on-chain CLAIM voor stabiele, handmatige voortgang.",
    active: "Actief",
    howToPlay: "HOE TE SPELEN",
    terms: "VOORWAARDEN",
    playMiners: "Speel Mijnwerkers",
    acceptTermsToPlay: "🔒 Accepteer voorwaarden om te spelen",
    rush: "MLEO — Rush",
    rushDesc: "Geavanceerd mijnen met Prestige systeem! Mijn MLEO passief, upgrade uitrusting, verdien prestaties en reset voor permanente bonussen.",
    passive: "Passief",
    playTokenRush: "Speel Token Rush",
    howToPlayTitle: "Hoe te spelen",
    goal: "Doel",
    rushGoal: "Rush Doel",
    rushGoalDesc: "Mijn MLEO tokens passief en bouw je rijk! Gebruik gemijnde MLEO voor uitrusting upgrades, prestaties verdienen en prestige voor permanente bonussen. Hoe meer je speelt, hoe sterker je wordt.",
    rushGameplay: "Gameplay",
    rushGameplaySteps: [
      "Mijn MLEO passief - je uitrusting werkt automatisch",
      "Klik BOOST om tijdelijk mijnsnelheid te verhogen (+2% per klik)",
      "Verzamel gemijnde MLEO naar je kluis voor upgrades en claims",
      "Koop upgrades: Auto-Drill, Helmet, Cart en Leo Bot voor sneller mijnen",
      "Verdien prestaties door mijlpalen te bereiken voor bonus beloningen",
      "Prestige op 10M MLEO om voortgang te resetten voor permanente bonussen"
    ],
    rushFeatures: "Sleutel kenmerken",
    rushFeaturesList: [
      "Prestige Systeem: Reset upgrades voor permanente +2% per prestige punt",
      "Prestaties: 6 verschillende prestaties met Prestige Punt beloningen",
      "Upgrades: 4 uitrustingstypes met meerdere niveaus elk",
      "Boost Systeem: Tijdelijke snelheidsverhoging die in de loop van de tijd afneemt",
      "Gilde Systeem: Word lid van mijn gildes voor bonus vermenigvuldigers",
      "Brug: Transfer MLEO van Mijnwerkers spel naar Rush kluis"
    ],
    goalDesc: "Voeg honden (mijnwerkers) samen, breek stenen en verdien munten. Munten zijn een in-game resource gebruikt voor upgrades en het kopen van meer mijnwerkers. Sommige activiteiten in het spel kunnen ook MLEO accumuleren (zie \"Mijnen en Tokens\" hieronder).",
    boardMerging: "Bord en Samenvoegen",
    boardSteps: [
      "Tik ADD op een lege slot om een hond te plaatsen. Kosten stijgen in de loop van de tijd.",
      "Sleep twee honden van hetzelfde niveau samen om te fuseren naar een hoger niveau.",
      "Elke hond voegt schade per seconde (DPS) toe aan zijn baan. Wanneer een steen breekt krijg je munten."
    ],
    upgradesBonuses: "Upgrades en Bonussen",
    upgradesList: [
      "DPS upgrades zorgen ervoor dat stenen sneller breken.",
      "GOLD upgrades verhogen de munten die je van elke steen krijgt met 10% per upgrade.",
      "Geschenken, automatische honden en andere bonussen kunnen van tijd tot tijd verschijnen. Exacte timings, drop types en balans waarden zijn dynamisch en kunnen zonder kennisgeving veranderen.",
      "Diamanten kunnen worden verzameld en uitgegeven voor speciale beloningen. Beschikbaarheid en beloningen zijn niet gegarandeerd."
    ],
    miningTokens: "Mijnen en Tokens (MLEO)",
    miningList: [
      "Hoe MLEO accumuleert: Alleen stenen breken kan MLEO genereren. Een deel van de munten die je verdient door stenen te breken kan converteren naar MLEO tegen een variabele snelheid onderworpen aan spel balans, dagelijkse limieten en anti-misbruik bescherming.",
      "Dagelijkse limieten en afzwakking: Om eerlijkheid te behouden kan dagelijkse accumulatie afzwakken wanneer je je persoonlijke dagelijkse limiet nadert. Limieten en berekeningen zijn intern en kunnen veranderen.",
      "Offline voortgang: Beperkte offline voortgang wordt gesimuleerd met verminderde efficiëntie vergeleken met actief spelen. Exacte waarden zijn intern en kunnen veranderen.",
      "CLAIM: Je geaccumuleerde MLEO verschijnt als balans. Claimen verplaatst het naar je in-game kluis. Als/wanneer on-chain claims beschikbaar worden, kunnen extra ontgrendel vensters en beperkingen van toepassing zijn.",
      "Geen waarde belofte: MLEO in dit spel is een utility token voor entertainment. Het heeft geen intrinsieke of gegarandeerde monetaire waarde. Niets hier is een aanbod, uitnodiging of belofte van toekomstige waarde."
    ],
    goodToKnow: "Goed om te weten",
    goodToKnowList: [
      "Spel balans, drop rates, limieten en schema's zijn dynamisch en kunnen op elk moment worden gewijzigd, gepauzeerd of gereset voor stabiliteit, eerlijkheid of onderhoud.",
      "Voortgang kan worden aangepast om bugs, exploits of misbruik aan te pakken.",
      "Dit is een testnet versie. Data kan worden gewist of gereset tijdens ontwikkeling.",
      "Verbind je wallet om MLEO tokens on-chain te claimen wanneer beschikbaar."
    ],
    arcadeWhat: "Wat is MLEO Arcade?",
    arcadeWhatDesc: "MLEO Arcade is een collectie van 24 spannende mini-games waar je MLEO tokens kunt winnen! Elk spel heeft unieke mechanica en vermenigvuldigers.",
    arcadeHowToPlay: "Hoe te spelen",
    arcadeSteps: [
      "Kies een willekeurig spel uit de arcade",
      "Elk spel kost 1,000 MLEO per ronde (afgetrokken van je kluis)",
      "Volg de spelspecifieke instructies",
      "Verzamel beloningen en vermenigvuldigers tot 10,000 MLEO!",
      "Alle winsten worden automatisch toegevoegd aan je kluis"
    ],
    arcadeFreePlay: "Gratis speel tokens",
    arcadeFreePlayList: [
      "Verdien 1 gratis speel token elk uur (up to 5 stored)",
      "Gebruik tokens om elk spel te spelen zonder MLEO uit te geven",
      "Gratis speel winsten worden nog steeds toegevoegd aan je kluis!"
    ],
    arcadeGoodToKnow: "Goed om te weten",
    arcadeGoodToKnowList: [
      "Je kluis wordt gedeeld tussen alle MLEO spellen",
      "Elk spel volgt je persoonlijke statistieken",
      "Alle spellen gebruiken eerlijke willekeurige getalsgeneratie",
      "Klik op de ℹ️ knop bij elk spel voor specifieke regels"
    ],
  },
  el: {
    name: "Ελληνικά", dir: "ltr", code: "el",
    back: "← Πίσω",
    logout: "Αποσύνδεση",
    liveTestnet: "Live Testnet • Κέρδισε MLEO στο παιχνίδι",
    chooseGame: "Επίλεξε το παιχνίδι σου",
    chooseGameDesc: "Δύο λειτουργίες, ένα θησαυροφυλάκιο. Παίξε ενεργά με αναβαθμίσεις (Εξορυκτές) ή άσε την παθητική συσσώρευση να τρέχει (Token Rush). Μπορείς να αλλάξεις ανά πάσα στιγμή.",
    miners: "MLEO — Εξορυκτές",
    minersDesc: "Αδρανές παιχνίδι και αναβαθμίσεις με δώρα κλικ και ενισχύσεις. Ενσωμάτωση θησαυροφυλακίου + CLAIM on-chain για σταθερή, χειροκίνητη πρόοδο.",
    active: "Ενεργό",
    howToPlay: "ΠΩΣ ΝΑ ΠΑΙΞΕΙΣ",
    terms: "ΟΡΟΙ",
    playMiners: "Παίξε Εξορυκτές",
    acceptTermsToPlay: "🔒 Αποδέξου όρους για να παίξεις",
    rush: "MLEO — Rush",
    rushDesc: "Προηγμένη εξόρυξη με σύστημα Prestige! Εξόρυξε MLEO παθητικά, αναβαθμίσε εξοπλισμό, κέρδισε επιτεύγματα και επαναφορά για μόνιμα μπόνους.",
    passive: "Παθητικό",
    playTokenRush: "Παίξε Token Rush",
    howToPlayTitle: "Πώς να παίξεις",
    goal: "Στόχος",
    rushGoal: "Στόχος Rush",
    rushGoalDesc: "Εξόρυξε MLEO tokens παθητικά και χτίσε την αυτοκρατορία σου! Χρησιμοποίησε εξορυχθέντα MLEO για αναβαθμίσεις εξοπλισμού, κέρδισμα επιτευγμάτων και prestige για μόνιμα μπόνους. Όσο περισσότερο παίζεις, τόσο πιο δυνατός γίνεσαι.",
    rushGameplay: "Παιχνίδι",
    rushGameplaySteps: [
      "Εξόρυξε MLEO παθητικά - ο εξοπλισμός σου λειτουργεί αυτόματα",
      "Κάνε κλικ BOOST για προσωρινή αύξηση ταχύτητας εξόρυξης (+2% ανά κλικ)",
      "Συλλέγει εξορυχθέντα MLEO στο θησαυροφυλάκιό σου για αναβαθμίσεις και αξιώσεις",
      "Αγόρασε αναβαθμίσεις: Auto-Drill, Helmet, Cart και Leo Bot για ταχύτερη εξόρυξη",
      "Κέρδισε επιτεύγματα φτάνοντας ορόσημα για μπόνους ανταμοιβές",
      "Prestige στα 10M MLEO για επαναφορά προόδου για μόνιμα μπόνους"
    ],
    rushFeatures: "Κύρια χαρακτηριστικά",
    rushFeaturesList: [
      "Σύστημα Prestige: Επαναφορά αναβαθμίσεων για μόνιμο +2% ανά σημείο prestige",
      "Επιτεύγματα: 6 διαφορετικά επιτεύγματα με ανταμοιβές σημείων Prestige",
      "Αναβαθμίσεις: 4 τύποι εξοπλισμού με πολλαπλά επίπεδα ο καθένας",
      "Σύστημα Boost: Προσωρινή αύξηση ταχύτητας που μειώνεται με τον χρόνο",
      "Σύστημα σωματείων: Γίνε μέλος σωματείων εξόρυξης για μπόνους πολλαπλασιαστές",
      "Γέφυρα: Μεταφορά MLEO από το παιχνίδι Εξορυκτές στο θησαυροφυλάκιο Rush"
    ],
    goalDesc: "Συνένωσε σκυλιά (εξορυκτές), σπάσε πέτρες και κέρδισε νομίσματα. Τα νομίσματα είναι πόρος εντός παιχνιδιού που χρησιμοποιείται για αναβαθμίσεις και αγορά περισσότερων εξορυκτών. Μερικές δραστηριότητες στο παιχνίδι μπορούν επίσης να συσσωρεύσουν MLEO (βλέπε \"Εξόρυξη και Tokens\" παρακάτω).",
    boardMerging: "Ταμπλό και Συγχώνευση",
    boardSteps: [
      "Πάτα ADD σε κενό slot για να τοποθετήσεις σκυλί. Το κόστος αυξάνεται με τον χρόνο.",
      "Σύρε δύο σκυλιά του ίδιου επιπέδου μαζί για συγχώνευση σε υψηλότερο επίπεδο.",
      "Κάθε σκυλί προσθέτει ζημιά ανά δευτερόλεπτο (DPS) στη λωρίδα του. Όταν μια πέτρα σπάει λαμβάνεις νομίσματα."
    ],
    upgradesBonuses: "Αναβαθμίσεις και Μπόνους",
    upgradesList: [
      "Οι αναβαθμίσεις DPS κάνουν τις πέτρες να σπάνε πιο γρήγορα.",
      "Οι αναβαθμίσεις GOLD αυξάνουν τα νομίσματα που λαμβάνεις από κάθε πέτρα κατά 10% ανά αναβάθμιση.",
      "Δώρα, αυτόματα σκυλιά και άλλα μπόνους μπορούν να εμφανίζονται κατά καιρούς. Οι ακριβείς χρονοδιαγράμματα, τύποι drop και τιμές ισορροπίας είναι δυναμικές και μπορούν να αλλάξουν χωρίς ειδοποίηση.",
      "Τα διαμάντια μπορούν να συλλεχθούν και να δαπανηθούν για ειδικές ανταμοιβές. Η διαθεσιμότητα και οι ανταμοιβές δεν είναι εγγυημένες."
    ],
    miningTokens: "Εξόρυξη και Tokens (MLEO)",
    miningList: [
      "Πώς συσσωρεύεται το MLEO: Μόνο το σπάσιμο πετρών μπορεί να δημιουργήσει MLEO. Ένα μέρος των νομισμάτων που κερδίζεις σπάζοντας πέτρες μπορεί να μετατραπεί σε MLEO σε μεταβλητό ρυθμό υπόκειται σε ισορροπία παιχνιδιού, ημερήσια όρια και προστασία κατά κατάχρησης.",
      "Ημερήσια όρια και εξασθένηση: Για να διατηρηθεί η δικαιοσύνη, η ημερήσια συσσώρευση μπορεί να εξασθενούν όταν πλησιάζεις το προσωπικό σου ημερήσιο όριο. Τα όρια και οι υπολογισμοί είναι εσωτερικοί και μπορούν να αλλάξουν.",
      "Εκτός σύνδεσης πρόοδος: Περιορισμένη εκτός σύνδεσης πρόοδος προσομοιώνεται με μειωμένη αποτελεσματικότητα σε σύγκριση με ενεργό παιχνίδι. Οι ακριβείς τιμές είναι εσωτερικές και μπορούν να αλλάξουν.",
      "CLAIM: Το συσσωρευμένο MLEO σου εμφανίζεται ως υπόλοιπο. Η αξίωση το μετακινεί στο θησαυροφυλάκιό σου εντός παιχνιδιού. Αν/όταν οι on-chain αξιώσεις γίνουν διαθέσιμες, μπορούν να εφαρμοστούν επιπλέον παράθυρα ξεκλειδώματος και περιορισμοί.",
      "Χωρίς υπόσχεση αξίας: Το MLEO σε αυτό το παιχνίδι είναι ένα utility token για διασκέδαση. Δεν έχει εγγενή ή εγγυημένη νομισματική αξία. Τίποτα εδώ δεν είναι προσφορά, παροτρύνση ή υπόσχεση μελλοντικής αξίας."
    ],
    goodToKnow: "Καλό να ξέρεις",
    goodToKnowList: [
      "Η ισορροπία παιχνιδιού, τα ποσοστά drop, τα όρια και τα χρονοδιαγράμματα είναι δυναμικά και μπορούν να αλλάξουν, να παυθούν ή να επαναφερθούν ανά πάσα στιγμή για σταθερότητα, δικαιοσύνη ή συντήρηση.",
      "Η πρόοδος μπορεί να προσαρμοστεί για να αντιμετωπίσει bugs, exploits ή κατάχρηση.",
      "Αυτή είναι μια testnet έκδοση. Τα δεδομένα μπορούν να διαγραφούν ή να επαναφερθούν κατά την ανάπτυξη.",
      "Συνδέσε το πορτοφόλι σου για να αξιώσεις MLEO tokens on-chain όταν είναι διαθέσιμα."
    ],
    arcadeWhat: "Τι είναι το MLEO Arcade;",
    arcadeWhatDesc: "Το MLEO Arcade είναι μια συλλογή από 24 συναρπαστικά mini-games όπου μπορείτε να κερδίσετε MLEO tokens! Κάθε παιχνίδι έχει μοναδικούς μηχανισμούς και πολλαπλασιαστές.",
    arcadeHowToPlay: "Πώς να παίξετε",
    arcadeSteps: [
      "Επιλέξτε οποιοδήποτε παιχνίδι από το arcade",
      "Κάθε παιχνίδι κοστίζει 1,000 MLEO ανά γύρο (αφαιρείται από το θησαυροφυλάκιό σας)",
      "Ακολουθήστε τις οδηγίες του παιχνιδιού",
      "Κερδίστε βραβεία και πολλαπλασιαστές έως 10,000 MLEO!",
      "Όλα τα κέρδη προστίθενται αυτόματα στο θησαυροφυλάκιό σας"
    ],
    arcadeFreePlay: "Δωρεάν παιχνίδι tokens",
    arcadeFreePlayList: [
      "Κερδίστε 1 δωρεάν παιχνίδι token κάθε ώρα (up to 5 stored)",
      "Χρησιμοποιήστε tokens για να παίξετε οποιοδήποτε παιχνίδι χωρίς να ξοδέψετε MLEO",
      "Τα κέρδη από δωρεάν παιχνίδι προστίθενται ακόμα στο θησαυροφυλάκιό σας!"
    ],
    arcadeGoodToKnow: "Καλό να ξέρετε",
    arcadeGoodToKnowList: [
      "Το θησαυροφυλάκιό σας είναι κοινό σε όλα τα MLEO παιχνίδια",
      "Κάθε παιχνίδι παρακολουθεί τα προσωπικά σας στατιστικά",
      "Όλα τα παιχνίδια χρησιμοποιούν δίκαιη γέννηση τυχαίων αριθμών",
      "Κάντε κλικ στο κουμπί ℹ️ σε κάθε παιχνίδι για συγκεκριμένους κανόνες"
    ],
  },
  he: {
    name: "עברית", dir: "rtl", code: "he",
    back: "← חזרה",
    logout: "התנתק",
    liveTestnet: "רשת בדיקה חיה • הרוויחו MLEO במשחק",
    chooseGame: "בחר את המשחק שלך",
    chooseGameDesc: "שני מצבים, Vault אחד. שחק באופן פעיל עם שדרוגים (כורים) או תן לצבירה פסיבית לרוץ (Token Rush). אתה יכול להחליף בכל עת.",
    miners: "MLEO — כורים",
    minersDesc: "משחק מנוחה ושדרוגים עם מתנות לחיצה והגברות. אינטגרציה עם Vault + CLAIM על השרשרת להתקדמות יציבה וידנית.",
    active: "פעיל",
    howToPlay: "איך לשחק",
    terms: "תנאים",
    playMiners: "שחק כורים",
    acceptTermsToPlay: "🔒 קבל תנאים כדי לשחק",
    rush: "MLEO — Rush",
    rushDesc: "כרייה מתקדמת עם מערכת Prestige! כרה MLEO פסיבית, שדרג ציוד, השג הישגים ואיפוס עבור בונוסים קבועים.",
    passive: "פסיבי",
    playTokenRush: "שחק Token Rush",
    howToPlayTitle: "איך לשחק",
    goal: "מטרה",
    rushGoal: "מטרת Rush",
    rushGoalDesc: "כרה מטבעות MLEO פסיבית ובנה את האימפריה שלך! השתמש ב-MLEO הכרו לשדרוג ציוד, השג הישגים ו-prestige עבור בונוסים קבועים. ככל שתשחק יותר, תהיה חזק יותר.",
    rushGameplay: "משחק",
    rushGameplaySteps: [
      "כרה MLEO פסיבית - הציוד שלך עובד אוטומטית",
      "לחץ BOOST כדי להגדיל זמנית את מהירות הכרייה (+2% לכל לחיצה)",
      "אסוף MLEO כרו ל-Vault שלך לשדרוגים ותביעות",
      "קנה שדרוגים: Auto-Drill, Helmet, Cart ו-Leo Bot לכרייה מהירה יותר",
      "השג הישגים על ידי הגעה לאבני דרך עבור תגמולי בונוס",
      "Prestige ב-10M MLEO כדי לאפס התקדמות עבור בונוסים קבועים"
    ],
    rushFeatures: "תכונות עיקריות",
    rushFeaturesList: [
      "מערכת Prestige: אפס שדרוגים עבור +2% קבוע לכל נקודת prestige",
      "הישגים: 6 הישגים שונים עם תגמולי נקודות Prestige",
      "שדרוגים: 4 סוגי ציוד עם מספר רמות כל אחד",
      "מערכת Boost: הגדלת מהירות זמנית שמדעכת עם הזמן",
      "מערכת Guild: הצטרף לגילדות כרייה עבור מכפילי בונוס",
      "Bridge: העבר MLEO ממשחק Miners ל-Vault של Rush"
    ],
    goalDesc: "מזג כלבים (כורים), שבור סלעים והרווח מטבעות. מטבעות הם משאב במשחק המשמש לשדרוגים וקניית כורים נוספים. פעילות מסוימת במשחק יכולה גם לצבור MLEO (ראה \"כרייה ומטבעות\" למטה).",
    boardMerging: "לוח ומיזוג",
    boardSteps: [
      "לחץ על ADD במשבצת ריקה כדי למקם כלב. העלות עולה עם הזמן.",
      "גרור שני כלבים מאותו רמה יחד כדי למזג לרמה גבוהה יותר.",
      "כל כלב מוסיף נזק לשנייה (DPS) לנתיב שלו. כשסלע נשבר אתה מקבל מטבעות."
    ],
    upgradesBonuses: "שדרוגים ובונוסים",
    upgradesList: [
      "שדרוגי DPS גורמים לסלעים להישבר מהר יותר.",
      "שדרוגי GOLD מגדילים את המטבעות שאתה מקבל מכל סלע ב-10% לכל שדרוג.",
      "מתנות, כלבים אוטומטיים ובונוסים אחרים עשויים להופיע מעת לעת. זמנים מדויקים, סוגי נפילה וערכי איזון הם דינמיים ועשויים להשתנות ללא הודעה.",
      "יהלומים יכולים להיאסף ולהוצא על תגמולים מיוחדים. זמינות ותגמולים אינם מובטחים."
    ],
    miningTokens: "כרייה ומטבעות (MLEO)",
    miningList: [
      "איך MLEO נצבר: רק שבירת סלעים יכולה ליצור MLEO. חלק מהמטבעות שאתה מרוויח משבירת סלעים עשוי להפוך ל-MLEO בקצב משתנה הכפוף לאיזון במשחק, מגבלות יומיות והגנות מפני התעללות.",
      "מגבלות יומיות והצטמצמות: כדי לשמור על הוגנות, צבירה יומית עשויה להצטמצם ככל שאתה מתקרב למגבלה האישית שלך ליום. מגבלות וחישובים הם פנימיים ועשויים להשתנות.",
      "התקדמות אופליין: התקדמות אופליין מוגבלת מדומה ביעילות מופחתת בהשוואה למשחק פעיל. ערכים מדויקים הם פנימיים ועשויים להשתנות.",
      "CLAIM: ה-MLEO הנצבר שלך מופיע כערך. טעינה מעבירה אותו ל-Vault במשחק שלך. אם/כאשר תביעות על השרשרת יהיו זמינות, חלונות שחרור נוספים והגבלות עשויים לחול.",
      "אין הבטחת ערך: MLEO במשחק זה הוא מטבע שירות לבידור. אין לו ערך כספי מהותי או מובטח. שום דבר כאן אינו הצעה, סוליסיטציה או הבטחת ערך עתידי."
    ],
    goodToKnow: "טוב לדעת",
    goodToKnowList: [
      "איזון המשחק, שיעורי נפילה, מגבלות ולוחות זמנים הם דינמיים ועשויים להשתנות, להיעצר או להתאפס בכל עת ליציבות, הוגנות או תחזוקה.",
      "התקדמות עשויה להיות מותאמת לטיפול בבאגים, ניצול לרעה או התעללות.",
      "זוהי גרסת רשת בדיקה. נתונים עשויים להימחק או להתאפס במהלך הפיתוח.",
      "חבר את הארנק שלך לתביעת מטבעות MLEO על השרשרת כשהם זמינים."
    ],
    arcadeWhat: "מה זה MLEO Arcade?",
    arcadeWhatDesc: "MLEO Arcade הוא אוסף של 24 משחקוני מיני מרגשים שבהם אפשר לזכות בטוקנים של MLEO! לכל משחק יש מכניקות ומכפילים ייחודיים.",
    arcadeHowToPlay: "איך משחקים",
    arcadeSteps: [
      "בחר כל משחק מהארקייד",
      "כל משחק עולה 1,000 MLEO לסיבוב (מנוכה מהכספת שלך)",
      "עקוב אחר הוראות המשחק הספציפיות",
      "זכה בפרסים ומכפילים עד 10,000 MLEO!",
      "כל הזכיות מתווספות אוטומטית לכספת שלך"
    ],
    arcadeFreePlay: "טוקנים של משחק חינם",
    arcadeFreePlayList: [
      "קבל טוקן משחק חינם אחד כל שעה (מקסימום 5 טוקנים)",
      "השתמש בטוקנים כדי לשחק בכל משחק מבלי להוציא MLEO",
      "זכיות במשחק חינם עדיין מתווספות לכספת שלך!"
    ],
    arcadeGoodToKnow: "טוב לדעת",
    arcadeGoodToKnowList: [
      "הכספת שלך משותפת בין כל משחקי MLEO",
      "כל משחק עוקב אחר הסטטיסטיקות האישיות שלך",
      "כל המשחקים משתמשים ביצירת מספרים אקראיים הוגנת",
      "לחץ על כפתור ℹ️ בכל משחק לכללים ספציפיים"
    ],
  }
};

// ===== Terms Functions =====
function isTermsAccepted() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("mleoGames_termsAccepted") === "true";
}

function acceptTerms() {
  if (typeof window === "undefined") return;
  localStorage.setItem("mleoGames_termsAccepted", "true");
}

// ===== Modal Component =====
function Modal({ isOpen, onClose, children, maxWidth = "2xl", padding = "6" }) {
  if (!isOpen) return null;
  
  const maxWidthClass = {
    "sm": "max-w-sm",
    "md": "max-w-md",
    "lg": "max-w-lg",
    "xl": "max-w-xl",
    "2xl": "max-w-2xl"
  }[maxWidth] || "max-w-2xl";
  
  const paddingClass = {
    "3": "p-3",
    "4": "p-4",
    "5": "p-5",
    "6": "p-6"
  }[padding] || "p-6";
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose}></div>
      <div className={`relative bg-white text-black rounded-2xl ${maxWidthClass} w-full max-h-[80vh] overflow-y-auto`}>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-2xl font-bold text-gray-500 hover:text-gray-700"
        >
          ×
        </button>
        <div className={paddingClass}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ===== How to Play Component =====
function HowToPlay({ lang, onClose, gameType = "miners" }) {
  const text = TEXT[lang];
  
  if (gameType === "rush") {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-4">{text.howToPlayTitle} - Rush</h2>
        
        <section className="mb-6">
          <h3 className="font-bold text-lg mb-2">{text.rushGoal}</h3>
          <p className="text-gray-700">{text.rushGoalDesc}</p>
        </section>
        
        <section className="mb-6">
          <h3 className="font-bold text-lg mb-2">{text.rushGameplay}</h3>
          <ol className="list-decimal ml-5 space-y-2">
            {text.rushGameplaySteps.map((step, index) => (
              <li key={index} className="text-gray-700">{step}</li>
            ))}
          </ol>
        </section>
        
        <section className="mb-6">
          <h3 className="font-bold text-lg mb-2">{text.rushFeatures}</h3>
          <ul className="list-disc ml-5 space-y-2">
            {text.rushFeaturesList.map((item, index) => (
              <li key={index} className="text-gray-700">{item}</li>
            ))}
          </ul>
        </section>
      </div>
    );
  }
  
  if (gameType === "arcade") {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-4">{text.howToPlayTitle} - Arcade</h2>
        
        <section className="mb-6">
          <h3 className="font-bold text-lg mb-2">{text.arcadeWhat}</h3>
          <p className="text-gray-700">{text.arcadeWhatDesc}</p>
        </section>
        
        <section className="mb-6">
          <h3 className="font-bold text-lg mb-2">{text.arcadeHowToPlay}</h3>
          <ol className="list-decimal ml-5 space-y-2">
            {text.arcadeSteps.map((step, index) => (
              <li key={index} className="text-gray-700">{step}</li>
            ))}
          </ol>
        </section>
        
        <section className="mb-6">
          <h3 className="font-bold text-lg mb-2">{text.arcadeFreePlay}</h3>
          <ul className="list-disc ml-5 space-y-2">
            {text.arcadeFreePlayList.map((item, index) => (
              <li key={index} className="text-gray-700">{item}</li>
            ))}
          </ul>
        </section>
        
        <section>
          <h3 className="font-bold text-lg mb-2">{text.arcadeGoodToKnow}</h3>
          <ul className="list-disc ml-5 space-y-2">
            {text.arcadeGoodToKnowList.map((item, index) => (
              <li key={index} className="text-gray-700">{item}</li>
            ))}
          </ul>
        </section>
      </div>
    );
  }
  
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">{text.howToPlayTitle} - Miners</h2>
      
      <section className="mb-6">
        <h3 className="font-bold text-lg mb-2">{text.goal}</h3>
        <p className="text-gray-700">{text.goalDesc}</p>
      </section>
      
      <section className="mb-6">
        <h3 className="font-bold text-lg mb-2">{text.boardMerging}</h3>
        <ol className="list-decimal ml-5 space-y-2">
          {text.boardSteps.map((step, index) => (
            <li key={index} className="text-gray-700">{step}</li>
          ))}
        </ol>
      </section>
      
      <section className="mb-6">
        <h3 className="font-bold text-lg mb-2">{text.upgradesBonuses}</h3>
        <ul className="list-disc ml-5 space-y-2">
          {text.upgradesList.map((item, index) => (
            <li key={index} className="text-gray-700">{item}</li>
          ))}
        </ul>
      </section>
      
      <section className="mb-6">
        <h3 className="font-bold text-lg mb-2">{text.miningTokens}</h3>
        <ul className="list-disc ml-5 space-y-2">
          {text.miningList.map((item, index) => (
            <li key={index} className="text-gray-700">{item}</li>
          ))}
        </ul>
      </section>
      
      <section>
        <h3 className="font-bold text-lg mb-2">{text.goodToKnow}</h3>
        <ul className="list-disc ml-5 space-y-2">
          {text.goodToKnowList.map((item, index) => (
            <li key={index} className="text-gray-700">{item}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// ===== Terms Component =====
function Terms({ onAccept, onDecline }) {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Terms & Conditions</h2>
      
      <div className="space-y-4 text-sm">
        <section className="bg-yellow-50 border-2 border-yellow-400 p-4 rounded-lg">
          <h3 className="font-bold text-black mb-2 text-lg">⚠️ IMPORTANT: Entertainment Only - NO Real Money Gaming</h3>
          <ul className="list-disc ml-5 space-y-2 text-black">
            <li><strong>This is a FREE entertainment game platform.</strong> All games use in-game tokens (MLEO) for gameplay purposes only.</li>
            <li><strong>NO REAL MONEY GAMING:</strong> This platform does NOT support, facilitate, or allow gaming with real money, cryptocurrencies, or any assets of monetary value.</li>
            <li><strong>NO REAL MONEY DEPOSITS:</strong> You cannot and will never be able to deposit real money, cryptocurrency, or any assets for the purpose of gaming on this platform.</li>
            <li><strong>NO REAL MONEY WITHDRAWALS:</strong> You cannot and will never be able to withdraw real money or convert in-game tokens to real money or cryptocurrency for monetary gain.</li>
            <li><strong>WE ARE AGAINST GAMING:</strong> This platform is designed purely for entertainment and skill-based gaming. We do not support, endorse, or facilitate any form of real money gaming, playing, or gaming.</li>
            <li><strong>MLEO TOKENS:</strong> MLEO tokens earned in-game are virtual utility tokens for gameplay mechanics only. They have NO monetary value, cannot be sold, traded, or exchanged for real money or cryptocurrency.</li>
            <li><strong>FUTURE POLICY:</strong> This platform will NEVER introduce real money gaming features. Any future cryptocurrency integration will be strictly limited to non-gaming use cases (e.g., rewards, collectibles, or utility) and will never involve playing, gaming, or gaming with cryptocurrency.</li>
          </ul>
        </section>
        
        <section className="bg-blue-50 border-2 border-blue-400 p-4 rounded-lg">
          <h3 className="font-bold text-black mb-2 text-lg">🔞 Age Requirement & Legal Compliance</h3>
          <ul className="list-disc ml-5 space-y-2 text-black">
            <li><strong>MINIMUM AGE:</strong> You must be at least 18 years old to use this platform. In certain jurisdictions, the minimum age may be 21 years or higher as required by local law.</li>
            <li><strong>AGE VERIFICATION:</strong> By using this platform, you represent and warrant that you meet the minimum age requirement in your jurisdiction.</li>
            <li><strong>PARENTAL RESPONSIBILITY:</strong> If you are a parent or guardian and become aware that your child has accessed this platform without meeting the age requirement, please contact us immediately.</li>
            <li><strong>LOCAL LAW COMPLIANCE:</strong> You are solely responsible for ensuring that your use of this platform complies with all applicable laws, regulations, and restrictions in your jurisdiction, including age restrictions, gaming laws, and cryptocurrency regulations.</li>
            <li><strong>PROHIBITED JURISDICTIONS:</strong> If online gaming, cryptocurrency usage, or any feature of this platform is restricted or prohibited in your jurisdiction, you are prohibited from accessing or using this platform.</li>
            <li><strong>NO LIABILITY FOR VIOLATIONS:</strong> We are not responsible for any violations of local laws by users. You agree to indemnify us against any claims arising from your violation of applicable laws.</li>
          </ul>
        </section>
        
        <section className="bg-green-50 border-2 border-green-400 p-4 rounded-lg">
          <h3 className="font-bold text-black mb-2 text-lg">🔒 Privacy, Data Protection & Third-Party Disclosure</h3>
          <ul className="list-disc ml-5 space-y-2 text-black">
            <li><strong>DATA COLLECTION:</strong> We may collect limited personal information such as wallet addresses, gameplay statistics, and device information solely for the purpose of providing and improving our services.</li>
            <li><strong>NO THIRD-PARTY SALES:</strong> We do NOT sell, rent, lease, or transfer your personal information to third parties for commercial purposes.</li>
            <li><strong>NO MARKETING DISCLOSURES:</strong> Your data will NOT be shared with third parties for marketing, advertising, or promotional purposes without your explicit consent.</li>
            <li><strong>LIMITED DISCLOSURES:</strong> We may only disclose your information: (a) to service providers who assist in operating the platform under strict confidentiality agreements, (b) when required by law, legal process, or government authorities, (c) to protect our rights, safety, or property, or (d) in connection with a business transfer or acquisition.</li>
            <li><strong>DATA SECURITY:</strong> We implement reasonable security measures to protect your data. However, no method of transmission or storage is 100% secure, and we cannot guarantee absolute security.</li>
            <li><strong>DATA RETENTION:</strong> We retain your data only as long as necessary to provide services or as required by law. You may request deletion of your data subject to legal and operational requirements.</li>
            <li><strong>COOKIES & TRACKING:</strong> We may use cookies and similar technologies for functionality and analytics. You can control cookie settings through your browser, but disabling cookies may affect functionality.</li>
            <li><strong>YOUR RIGHTS:</strong> Depending on your jurisdiction, you may have rights to access, correct, delete, or export your personal data. Contact us to exercise these rights.</li>
          </ul>
        </section>
        <section>
          <h3 className="font-bold text-black mb-1">1) Acceptance</h3>
          <p>By playing, you agree to these terms. If you disagree, please do not play.</p>
        </section>
        <section>
          <h3 className="font-bold text-black mb-1">2) No Financial Advice</h3>
          <p>Nothing here is investment, legal, accounting or tax advice. You are solely responsible for your decisions.</p>
        </section>
        <section>
          <h3 className="font-bold text-black mb-1">3) Gameplay, Balancing & Progress</h3>
          <ul className="list-disc ml-5 space-y-1">
            <li>Rates/limits/drop tables/schedules/offline behavior are internal and may change, pause or reset at any time.</li>
            <li>We may adjust/rollback progress to address bugs, exploits or irregular activity.</li>
            <li>Feature availability may depend on time, region, device or account status.</li>
          </ul>
        </section>
        <section>
          <h3 className="font-bold text-black mb-1">4) Mining, Vault & Claims</h3>
          <ul className="list-disc ml-5 space-y-1">
            <li>Only certain actions (e.g., breaking rocks) may accrue MLEO under variable, capped rules.</li>
            <li>"CLAIM" moves accrued MLEO to your in-app <b>Vault</b>. If on-chain claims open later, they may be subject to unlock windows, rate limits, eligibility checks and other restrictions.</li>
            <li>We may change, delay or discontinue vaulting and/or on-chain claiming at any time.</li>
          </ul>
        </section>
        <section>
          <h3 className="font-bold text-black mb-1">5) Wallets & Third-Party Services</h3>
          <ul className="list-disc ml-5 space-y-1">
            <li>Wallet connection is optional and via third parties outside our control. Keep your devices, keys and wallets secure.</li>
            <li>Blockchain transactions are irreversible and may incur network fees. We are not responsible for losses due to user error, phishing, gas volatility, forks/reorgs, downtime or smart-contract risks.</li>
          </ul>
        </section>
        <section>
          <h3 className="font-bold text-black mb-1">6) Fair Play & Prohibited Conduct</h3>
          <ul className="list-disc ml-5 space-y-1">
            <li>No bots, automation, multi-account abuse, exploits, reverse engineering or service interference.</li>
            <li>We may suspend, reset or terminate access and remove balances obtained through prohibited behavior.</li>
          </ul>
        </section>
        <section>
          <h3 className="font-bold text-black mb-1">7) Availability, Data & Updates</h3>
          <ul className="list-disc ml-5 space-y-1">
            <li>Service may be unavailable, interrupted or updated at any time.</li>
            <li>We may modify/discontinue features, wipe test data or migrate saves.</li>
          </ul>
        </section>
        <section>
          <h3 className="font-bold text-black mb-1">8) Airdrops, Promotions & Rewards</h3>
          <p>Any events or rewards are discretionary, may change, and can have eligibility requirements. Participation does not guarantee receipt or value.</p>
        </section>
        <section>
          <h3 className="font-bold text-black mb-1">9) Taxes</h3>
          <p>You are solely responsible for any taxes related to your use of the game and any rewards you may receive.</p>
        </section>
        <section>
          <h3 className="font-bold text-black mb-1">10) Limitation of Liability & Disclaimers</h3>
          <ul className="list-disc ml-5 space-y-1">
            <li><strong>NO WARRANTIES:</strong> This platform and all services are provided "AS IS" and "AS AVAILABLE" without warranties of any kind, express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, title, or non-infringement.</li>
            <li><strong>NO GUARANTEE OF AVAILABILITY:</strong> We do not guarantee that the platform will be uninterrupted, timely, secure, error-free, or free from viruses or other harmful components.</li>
            <li><strong>NO GUARANTEE OF VALUE:</strong> We make no representations or warranties that MLEO tokens, rewards, or any in-game assets will have any present or future value, utility, or transferability.</li>
            <li><strong>LIMITATION OF LIABILITY:</strong> To the maximum extent permitted by law, we and our affiliates, officers, directors, employees, agents, and licensors shall NOT be liable for any indirect, incidental, special, consequential, punitive, or exemplary damages, including but not limited to: loss of profits, revenue, data, goodwill, or other intangible losses; cost of substitute services; business interruption; personal injury; emotional distress; or any damages arising from your use or inability to use the platform.</li>
            <li><strong>MAXIMUM LIABILITY CAP:</strong> In no event shall our total aggregate liability exceed the greater of (a) $100 USD or (b) the amount you paid to us (if any) in the 12 months preceding the claim.</li>
            <li><strong>THIRD-PARTY SERVICES:</strong> We are not responsible for any losses, damages, or issues arising from third-party services, wallets, blockchain networks, smart contracts, or external websites linked from this platform.</li>
            <li><strong>USER RESPONSIBILITY:</strong> You acknowledge that your use of this platform is at your sole risk, and you are solely responsible for any damage to your device, loss of data, or any other consequences of your use.</li>
          </ul>
        </section>
        <section>
          <h3 className="font-bold text-black mb-1">11) Indemnification</h3>
          <ul className="list-disc ml-5 space-y-1">
            <li>You agree to indemnify, defend, and hold harmless the platform, its owners, operators, affiliates, officers, directors, employees, agents, licensors, and service providers from and against any and all claims, liabilities, damages, losses, costs, expenses, fees (including reasonable attorneys' fees) arising from or relating to:</li>
            <li>(a) Your use or misuse of the platform;</li>
            <li>(b) Your violation of these Terms or any applicable law;</li>
            <li>(c) Your violation of any rights of any third party;</li>
            <li>(d) Any content or information you submit or transmit through the platform;</li>
            <li>(e) Your representations that you meet age requirements and comply with local laws;</li>
            <li>(f) Any dispute you have with another user;</li>
            <li>(g) Your negligence, willful misconduct, or fraud.</li>
          </ul>
        </section>
        <section>
          <h3 className="font-bold text-black mb-1">12) Representations & Warranties by User</h3>
          <p>By using this platform, you represent and warrant that:</p>
          <ul className="list-disc ml-5 space-y-1">
            <li>You meet the minimum age requirement (18 years or as required by your jurisdiction);</li>
            <li>You have the legal capacity to enter into these Terms;</li>
            <li>Your use of the platform does not violate any applicable laws, regulations, or restrictions in your jurisdiction;</li>
            <li>You are not located in, residing in, or a citizen of any jurisdiction where access to this platform is prohibited;</li>
            <li>You will not use the platform for any illegal, fraudulent, or unauthorized purpose;</li>
            <li>All information you provide is accurate, current, and complete;</li>
            <li>You acknowledge that MLEO tokens have no monetary value and are for entertainment purposes only;</li>
            <li>You understand that this is NOT a gaming platform and no real money gaming occurs on this platform.</li>
          </ul>
        </section>
        <section>
          <h3 className="font-bold text-black mb-1">13) Intellectual Property</h3>
          <ul className="list-disc ml-5 space-y-1">
            <li>All content, features, functionality, trademarks, logos, designs, text, graphics, software, and other materials on this platform are owned by us or our licensors and are protected by copyright, trademark, and other intellectual property laws.</li>
            <li>You are granted a limited, non-exclusive, non-transferable, revocable license to access and use the platform for personal, non-commercial entertainment purposes only.</li>
            <li>You may NOT copy, reproduce, distribute, modify, create derivative works, reverse engineer, decompile, or attempt to extract source code from any part of the platform without our express written permission.</li>
          </ul>
        </section>
        <section>
          <h3 className="font-bold text-black mb-1">14) Modification & Termination</h3>
          <ul className="list-disc ml-5 space-y-1">
            <li><strong>MODIFICATIONS:</strong> We reserve the right to modify, suspend, or discontinue any aspect of the platform, including these Terms, at any time without prior notice. Continued use after modifications constitutes acceptance of the modified Terms.</li>
            <li><strong>ACCOUNT TERMINATION:</strong> We may suspend, restrict, or terminate your access to the platform at any time, with or without cause, with or without notice, for any reason including but not limited to violation of these Terms, suspicious activity, or legal compliance.</li>
            <li><strong>EFFECT OF TERMINATION:</strong> Upon termination, your right to use the platform ceases immediately. We may delete your account, data, and any in-game assets without liability to you.</li>
          </ul>
        </section>
        <section>
          <h3 className="font-bold text-black mb-1">15) Severability & Entire Agreement</h3>
          <ul className="list-disc ml-5 space-y-1">
            <li><strong>SEVERABILITY:</strong> If any provision of these Terms is found to be invalid, illegal, or unenforceable, the remaining provisions shall continue in full force and effect.</li>
            <li><strong>ENTIRE AGREEMENT:</strong> These Terms constitute the entire agreement between you and us regarding the use of this platform and supersede all prior agreements, understandings, and communications.</li>
            <li><strong>NO WAIVER:</strong> Our failure to enforce any provision of these Terms shall not constitute a waiver of that provision or our right to enforce it in the future.</li>
          </ul>
        </section>
        <section>
          <h3 className="font-bold text-black mb-1">16) Force Majeure</h3>
          <p>We shall not be liable for any failure or delay in performance due to causes beyond our reasonable control, including but not limited to acts of God, natural disasters, war, terrorism, riots, embargoes, government actions, labor disputes, network outages, blockchain network failures, or any other force majeure event.</p>
        </section>
        <section>
          <h3 className="font-bold text-black mb-1">17) Governing Law & Dispute Resolution</h3>
          <ul className="list-disc ml-5 space-y-1">
            <li><strong>GOVERNING LAW:</strong> These Terms are governed by and construed in accordance with the laws of <b>[insert jurisdiction]</b>, without regard to its conflict of law provisions.</li>
            <li><strong>DISPUTE RESOLUTION:</strong> Any dispute arising from these Terms or your use of the platform shall be resolved through binding arbitration in accordance with <b>[insert arbitration rules]</b>, except where prohibited by law.</li>
            <li><strong>CLASS ACTION WAIVER:</strong> You agree to resolve disputes on an individual basis only and waive any right to participate in a class action lawsuit or class-wide arbitration.</li>
            <li><strong>VENUE:</strong> If arbitration is not permitted, disputes shall be resolved exclusively in the courts of <b>[insert jurisdiction]</b>.</li>
          </ul>
        </section>
        <section>
          <h3 className="font-bold text-black mb-1">18) Contact & Reporting</h3>
          <p>For questions, concerns, copyright claims, privacy requests, or to report violations of these Terms, please contact us at: <b>[insert contact email]</b>.</p>
        </section>
        <section>
          <h3 className="font-bold text-black mb-1">19) Acknowledgment</h3>
          <p className="font-bold">BY CLICKING "ACCEPT" OR BY USING THIS PLATFORM, YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND AGREE TO BE BOUND BY THESE TERMS & CONDITIONS IN THEIR ENTIRETY.</p>
        </section>
          </div>
      
      <div className="flex gap-3 mt-6">
                <button
                  onClick={onAccept}
          className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-bold"
                >
          Accept
                </button>
              <button
          onClick={onDecline}
          className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-bold"
              >
          Decline
              </button>
          </div>
        </div>
  );
}

// ===== Flags =====
const FLAGS = {
  en: "🇺🇸",
  he: "🇮🇱",
  ar: "🇸🇦",
  ru: "🇷🇺",
  es: "🇪🇸",
  fr: "🇫🇷",
  de: "🇩🇪",
  pt: "🇧🇷",
  zh: "🇨🇳",
  ja: "🇯🇵",
  ko: "🇰🇷",
  tr: "🇹🇷",
  it: "🇮🇹",
  ka: "🇬🇪",
  pl: "🇵🇱",
  ro: "🇷🇴",
  cs: "🇨🇿",
  nl: "🇳🇱",
  el: "🇬🇷",
};

// ===== Helpers =====
const ALL = Object.values(TEXT).map(x => ({ code: x.code, name: x.name }));
const RTL_CODES = new Set(Object.values(TEXT).filter(x => x.dir === "rtl").map(x => x.code));

function pickInitialLang() {
  try {
    // 1) URL ?lang=
    const q = new URLSearchParams(window.location.search);
    const qLang = (q.get("lang") || "").toLowerCase();
    if (qLang && TEXT[qLang]) return qLang;

    // 2) localStorage
    const ls = localStorage.getItem("mleo_lang");
    if (ls && TEXT[ls]) return ls;

    // 3) browser
    const nav = (navigator.language || "en").slice(0,2).toLowerCase();
    const guess = Object.keys(TEXT).find(k => k.startsWith(nav));
    return guess || "en";
  } catch { return "en"; }
}

// ===== Language Selector =====
function LanguageSelector({ currentLang, onLanguageChange }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-2 rounded-xl bg-white/10 border border-white/20 hover:bg-white/15 transition text-sm flex items-center gap-2"
        style={{ fontFamily: "system-ui, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol" }}
      >
        <span className="mr-1">{FLAGS[currentLang] || '🌐'}</span>
        <span>{TEXT[currentLang].name}</span>
        <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setIsOpen(false)} />
          <div 
            className="absolute right-0 top-full mt-2 w-52 bg-white border border-gray-300 rounded-xl shadow-2xl overflow-hidden z-[110] max-h-[400px] overflow-y-auto"
            style={{ 
              fontFamily: "system-ui, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol",
              backgroundColor: "white"
            }}
          >
            {ALL.map(opt => (
              <button
                key={opt.code}
                onClick={() => {
                  onLanguageChange(opt.code);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-3 text-left hover:bg-gray-100 transition flex items-center gap-3 text-sm text-gray-900 ${
                  currentLang === opt.code ? 'bg-blue-100 font-bold' : ''
                }`}
              >
                <span className="text-lg mr-2">{FLAGS[opt.code] || '🌐'}</span>
                <span>{TEXT[opt.code].name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ===== GamesHub Component =====
export default function GamesHub() {
  const router = useRouter();
  const [modal, setModal] = useState(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [lang, setLang] = useState("en");
  const [showMenu, setShowMenu] = useState(false);
  const [userInfo, setUserInfo] = useState({ email: null, username: null, isGuest: true });
  const [vault, setVault] = useState(0);
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [collectAmount, setCollectAmount] = useState(1000);
  const [claiming, setClaiming] = useState(false);
  
  // Auth form state
  const [authMode, setAuthMode] = useState("login"); // "login" or "signup"
  const [authEmail, setAuthEmail] = useState("");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  
  // Wagmi hooks
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const chainId = useChainId();
  
  const open = (id) => setModal(id);
  const close = () => setModal(null);

  // Check terms on mount
  useEffect(() => {
    setMounted(true);
    const accepted = isTermsAccepted();
    setTermsAccepted(accepted);
    
    const init = pickInitialLang();
    setLang(init);
  }, []);

  // Persist + set URL & dir
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem("mleo_lang", lang);
      const url = new URL(window.location.href);
      url.searchParams.set("lang", lang);
      window.history.replaceState({}, "", url.toString());
      document.documentElement.setAttribute("lang", lang);
      document.documentElement.setAttribute("dir", RTL_CODES.has(lang) ? "rtl" : "ltr");
    } catch {}
  }, [lang, mounted]);

  // Load user info from Supabase
  useEffect(() => {
    if (!mounted) return;
    const loadUserInfo = async () => {
      try {
        const { data } = await supabaseMP.auth.getSession();
        if (data?.session?.user) {
          const user = data.session.user;
          setUserInfo({
            email: user.email || null,
            username: user.user_metadata?.username || user.email?.split('@')[0] || 'User',
            isGuest: false
          });
        } else {
          setUserInfo({ email: null, username: null, isGuest: true });
        }
      } catch (error) {
        console.error('Error loading user info:', error);
        setUserInfo({ email: null, username: null, isGuest: true });
      }
    };
    
    loadUserInfo();
    
    // Listen for auth state changes
    const { data: { subscription } } = supabaseMP.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        const user = session.user;
        setUserInfo({
          email: user.email || null,
          username: user.user_metadata?.username || user.email?.split('@')[0] || 'User',
          isGuest: false
        });
      } else {
        setUserInfo({ email: null, username: null, isGuest: true });
      }
    });
    
    return () => {
      subscription.unsubscribe();
    };
  }, [mounted]);

  const handleAcceptTerms = () => {
    acceptTerms();
    setTermsAccepted(true);
    setModal(null);
  };

  const handleLanguageChange = (newLang) => {
    setLang(newLang);
  };

  // Read vault from RUSH game
  function getVault() {
    if (typeof window === "undefined") return 0;
    try {
      const rushData = localStorage.getItem("mleo_rush_core_v4");
      if (!rushData) return 0;
      const data = JSON.parse(rushData);
      return data.vault || 0;
    } catch {
      return 0;
    }
  }
  
  function fmt(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
    return Math.floor(n).toString();
  }

  // Load and update vault
  useEffect(() => {
    if (!mounted) return;
    setVault(getVault());
    
    const interval = setInterval(() => {
      setVault(getVault());
    }, 2000);
    
    return () => clearInterval(interval);
  }, [mounted]);

  // Email validation regex
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

  const handleLogin = async () => {
    setAuthError("");
    
    if (!EMAIL_RE.test(authEmail) || authPassword.length < 8) {
      setAuthError("Please enter a valid email and password (8+ characters).");
      return;
    }

    setAuthSubmitting(true);
    try {
      const { error } = await supabaseMP.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      });
      if (error) throw error;
      
      // Success - user info will be updated by the auth state listener
      setAuthEmail("");
      setAuthPassword("");
      setAuthError("");
      setAuthMode("login");
    } catch (e) {
      setAuthError(e?.message || "Login failed. Please try again.");
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSignup = async () => {
    setAuthError("");
    
    // Validate username
    if (!authUsername || authUsername.trim().length < 3) {
      setAuthError("Username must be at least 3 characters long.");
      return;
    }
    
    if (!EMAIL_RE.test(authEmail) || authPassword.length < 8) {
      setAuthError("Please enter a valid email and password (8+ characters).");
      return;
    }
    
    if (authPassword !== authConfirmPassword) {
      setAuthError("Passwords do not match.");
      return;
    }

    setAuthSubmitting(true);
    try {
      const { error } = await supabaseMP.auth.signUp({
        email: authEmail,
        password: authPassword,
        options: { 
          emailRedirectTo: undefined,
          data: {
            username: authUsername.trim()
          }
        },
      });
      if (error) throw error;
      
      // Success - user info will be updated by the auth state listener
      setAuthEmail("");
      setAuthUsername("");
      setAuthPassword("");
      setAuthConfirmPassword("");
      setAuthError("");
      setAuthMode("login");
    } catch (e) {
      setAuthError(e?.message || "Signup failed. Please try again.");
    } finally {
      setAuthSubmitting(false);
    }
  };

  // Collect MLEO to wallet
  async function collectToWallet() {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }

    if (chainId !== CLAIM_CHAIN_ID) {
      try {
        await switchChain?.({ chainId: CLAIM_CHAIN_ID });
      } catch {
        alert("Switch to BSC Testnet (TBNB)");
        return;
      }
    }

    if (!CLAIM_ADDRESS) {
      alert("Missing CLAIM address");
      return;
    }

    if (collectAmount <= 0 || collectAmount > vault) {
      alert("Invalid amount!");
      return;
    }

    setClaiming(true);
    try {
      const amountUnits = parseUnits(
        Number(collectAmount).toFixed(Math.min(2, MLEO_DECIMALS)),
        MLEO_DECIMALS
      );

      const hash = await writeContractAsync({
        address: CLAIM_ADDRESS,
        abi: MINING_CLAIM_ABI,
        functionName: "claim",
        args: [BigInt(1), amountUnits], // GameId = 1 for Arcade
        chainId: CLAIM_CHAIN_ID,
        account: address,
      });

      await publicClient.waitForTransactionReceipt({ hash });

      // Update local vault
      const newVault = Math.max(0, vault - collectAmount);
      setVault(newVault);
      
      // Update RUSH game vault
      try {
        const rushData = localStorage.getItem("mleo_rush_core_v4");
        if (rushData) {
          const data = JSON.parse(rushData);
          data.vault = newVault;
          localStorage.setItem("mleo_rush_core_v4", JSON.stringify(data));
        }
      } catch (e) {
        console.error("Failed to update RUSH vault:", e);
      }

      alert(`✅ Sent ${fmt(collectAmount)} MLEO to wallet!`);
      setCollectAmount(1000);
    } catch (err) {
      console.error(err);
      alert("Claim failed or rejected");
    } finally {
      setClaiming(false);
    }
  }

  const handleLogout = async () => {
    try {
      await supabaseMP.auth.signOut();
    } catch (e) {
      console.error("supabase signOut failed", e);
    }
    try {
      window.localStorage?.setItem("mleo_remember_me", "false");
    } catch {}
    router.push("/");
  };

  const text = useMemo(() => TEXT[lang] || TEXT.en, [lang]);
  const dir = text.dir || "ltr";

  if (!mounted) {
  return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!termsAccepted) {
    return (
      <Layout>
        <div className="min-h-screen bg-black flex items-center justify-center">
          <div className="text-center text-white">
            <h1 className="text-3xl font-bold mb-4">Welcome to MLEO Games</h1>
            <p className="text-gray-300 mb-6">Please accept our terms and conditions to continue</p>
            <button
              onClick={() => setModal("terms")}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-bold"
            >
              View Terms
            </button>
          </div>
        </div>
        
        <Modal isOpen={modal === "terms"} onClose={close}>
          <Terms onAccept={handleAcceptTerms} onDecline={() => setModal(null)} />
        </Modal>
      </Layout>
    );
  }

  return (
    <Layout>
      <div 
        className="min-h-screen bg-black/90 text-white relative overflow-hidden"
        dir={dir}
        style={{
          backgroundImage: `url(${BG_URL})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundAttachment: 'fixed'
        }}
      >
        <div className="absolute inset-0 bg-black/30"></div>
        <div className="relative z-10 container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto">
            {/* Navigation */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Link href="/">
                  <button className="bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 px-3 py-1.5 rounded-lg text-xs font-bold border border-blue-500/30 transition-colors">
                    {text.back}
                  </button>
                </Link>
                <button
                  onClick={handleLogout}
                  className="bg-red-500/20 hover:bg-red-500/35 text-red-200 px-3 py-1.5 rounded-lg text-xs font-bold border border-red-400/40 transition-colors"
                >
                  {text.logout}
                </button>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 transition-all"
                  title="Menu"
                >
                  <div className="flex flex-col gap-1">
                    <div className="w-5 h-0.5 bg-white"></div>
                    <div className="w-5 h-0.5 bg-white"></div>
                    <div className="w-5 h-0.5 bg-white"></div>
                  </div>
                </button>
              </div>
            </div>

          {/* Header */}
            <header className="text-center mb-8">
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className="text-emerald-400 text-sm font-bold px-2 py-1 rounded-full bg-emerald-400/10 border border-emerald-400/20">
                  {text.liveTestnet}
                </span>
            </div>
            <h1 className="text-[28px] md:text-[40px] font-extrabold tracking-tight mt-3">
                {text.chooseGame}
            </h1>
            <p className="text-zinc-300 mt-2 max-w-2xl mx-auto">
                {text.chooseGameDesc}
            </p>
          </header>

            {/* Cards */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch max-w-[1100px] mx-auto justify-items-center">
  {/* MINERS */}
              <article className="rounded-2xl border border-white/10 bg-black/5 backdrop-blur-md shadow-xl p-6 flex flex-col w-full max-w-[350px] min-h-[320px]">
    <div className="grid grid-cols-[1fr_auto] gap-2 items-start">
                  <div>
                    <h2 className="text-[20px] sm:text-2xl font-extrabold">{text.miners}</h2>
                    <p className="text-[13px] sm:text-sm text-zinc-300 mt-2 leading-6 break-words hyphens-auto">
                      {text.minersDesc}
        </p>
      </div>
                  <span className="rounded-full px-2 py-1 text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    {text.active}
      </span>
    </div>

    <div className="mt-auto">
      <div className="flex flex-wrap gap-2 mb-3 justify-center">
        <button
          onClick={() => open("miners-how")}
                      className="bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 px-4 py-2 rounded-lg text-sm font-bold border border-blue-500/30 transition-colors"
        >
                      {text.howToPlay}
        </button>
        <button
                      onClick={() => open("terms")}
                      className="bg-gray-600/20 hover:bg-gray-600/30 text-gray-300 px-4 py-2 rounded-lg text-sm font-bold border border-gray-500/30 transition-colors"
        >
                      {text.terms}
        </button>
      </div>

                  <Link href="/mleo-miners">
                    <button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 rounded-xl font-bold text-sm transition-colors">
                      {text.playMiners}
          </button>
                  </Link>
    </div>
  </article>

  {/* TOKEN RUSH */}
              <article className="rounded-2xl border border-white/10 bg-black/5 backdrop-blur-md shadow-xl p-6 flex flex-col w-full max-w-[350px] min-h-[320px]">
    <div className="grid grid-cols-[1fr_auto] gap-2 items-start">
                  <div>
                    <h2 className="text-[20px] sm:text-2xl font-extrabold">{text.rush}</h2>
                    <p className="text-[13px] sm:text-sm text-zinc-300 mt-2 leading-6 break-words hyphens-auto">
                      {text.rushDesc}
        </p>
      </div>
                  <span className="rounded-full px-2 py-1 text-xs font-bold bg-orange-500/15 text-orange-300 border border-orange-500/30">
                    {text.passive}
      </span>
    </div>

    <div className="mt-auto">
      <div className="flex flex-wrap gap-2 mb-3 justify-center">
        <button
          onClick={() => open("rush-how")}
                      className="bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 px-4 py-2 rounded-lg text-sm font-bold border border-blue-500/30 transition-colors"
        >
                      {text.howToPlay}
        </button>
        <button
                      onClick={() => open("terms")}
                      className="bg-gray-600/20 hover:bg-gray-600/30 text-gray-300 px-4 py-2 rounded-lg text-sm font-bold border border-gray-500/30 transition-colors"
        >
                      {text.terms}
        </button>
      </div>

                  <Link href="/rush">
                    <button className="w-full bg-orange-600 hover:bg-orange-700 text-white px-4 py-3 rounded-xl font-bold text-sm transition-colors">
                      {text.playTokenRush}
          </button>
                  </Link>
    </div>
  </article>

  {/* ARCADE GAMES */}
              <article className="rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-900/20 to-indigo-900/20 backdrop-blur-md shadow-xl p-6 flex flex-col w-full max-w-[350px] min-h-[320px]">
    <div className="grid grid-cols-[1fr_auto] gap-2 items-start">
                  <div>
                    <h2 className="text-[20px] sm:text-2xl font-extrabold">🎮 MLEO Arcade</h2>
                    <p className="text-[13px] sm:text-sm text-zinc-300 mt-2 leading-6 break-words hyphens-auto">
                      Mini-games arcade! Play Slots, Dice, Wheel & Scratch cards. 1,000 MLEO per session with rewards up to 10,000 MLEO!
        </p>
                  </div>
                  <span className="rounded-full px-2.5 py-1 text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 whitespace-nowrap">
                    Fun
      </span>
    </div>

                  <div className="mt-auto">
                    <div className="flex flex-wrap gap-2 mb-3 justify-center">
                      <button
                        onClick={() => open("arcade-how")}
                        className="bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 px-4 py-2 rounded-lg text-sm font-bold border border-blue-500/30 transition-colors"
                      >
                        {text.howToPlay}
                      </button>
                      <button
                        onClick={() => open("terms")}
                        className="bg-gray-600/20 hover:bg-gray-600/30 text-gray-300 px-4 py-2 rounded-lg text-sm font-bold border border-gray-500/30 transition-colors"
                      >
                        {text.terms}
                      </button>
                    </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Link href="/arcade">
                      <button className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-4 py-3 rounded-xl font-bold text-sm transition-colors shadow-lg">
                        GAMES
                      </button>
                    </Link>
                    <Link href="/arcade-online">
                      <button className="w-full bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white px-4 py-3 rounded-xl font-bold text-sm transition-colors shadow-lg">
                        ONLINE
                      </button>
                    </Link>
                  </div>
    </div>
  </article>
</section>

            {/* Game Pool Stats */}
            <div className="mb-8 max-w-4xl mx-auto">
              <GamePoolStats />
            </div>

          </div>
        </div>
      </div>

      {/* Modals */}
      <Modal isOpen={modal === "miners-how"} onClose={close}>
        <HowToPlay lang={lang} onClose={close} />
        </Modal>

      <Modal isOpen={modal === "rush-how"} onClose={close}>
        <HowToPlay lang={lang} onClose={close} gameType="rush" />
        </Modal>

      <Modal isOpen={modal === "arcade-how"} onClose={close}>
        <HowToPlay lang={lang} onClose={close} gameType="arcade" />
        </Modal>

      <Modal isOpen={modal === "terms"} onClose={close}>
        <Terms onAccept={handleAcceptTerms} onDecline={() => setModal(null)} />
      </Modal>

      {/* Menu Modal */}
      <Modal isOpen={showMenu} onClose={() => setShowMenu(false)} maxWidth="md" padding="3">
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-center mb-2">User Menu</h2>
          
          {/* User Info Section */}
          <div className="space-y-1.5">
            <div className="bg-gray-100 rounded-lg p-2">
              <h3 className="font-bold text-sm mb-1.5">User Information</h3>
              <div className="space-y-1 text-gray-700 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Username:</span>
                  <span>{userInfo.username || 'Guest'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Email:</span>
                  <span>{userInfo.email || 'Not provided'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Status:</span>
                  <span className={`px-2 py-1 rounded text-sm font-bold ${
                    userInfo.isGuest 
                      ? 'bg-gray-300 text-gray-700' 
                      : 'bg-green-300 text-green-700'
                  }`}>
                    {userInfo.isGuest ? 'Guest' : 'Connected'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowVaultModal(true)}
                className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1.5 rounded text-xs font-bold transition-colors"
              >
                VAULT: {fmt(vault)} MLEO
              </button>
            </div>

            {/* Language & Wallet - Same Row */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-100 rounded-lg p-2">
                <h3 className="font-bold text-xs mb-1">Language</h3>
                <LanguageSelector currentLang={lang} onLanguageChange={handleLanguageChange} />
              </div>
              <div className="bg-gray-100 rounded-lg p-2">
                <h3 className="font-bold text-xs mb-1">Wallet</h3>
                <div style={{ transform: 'scale(0.85)' }}>
                  <ConnectButton 
                    chainStatus="none"
                    accountStatus="avatar"
                    showBalance={false}
                    label="CONNECT"
                  />
                </div>
              </div>
            </div>

            {/* Logout Button - Only show for connected users */}
            {!userInfo.isGuest && (
              <div className="bg-gray-100 rounded-lg p-2">
                <button
                  onClick={async () => {
                    await handleLogout();
                    setShowMenu(false);
                  }}
                  className="w-full bg-red-600 hover:bg-red-700 text-white px-2 py-1.5 rounded text-xs font-bold transition-colors"
                >
                  Logout
                </button>
              </div>
            )}

            {/* Auth Section - Only show for guests */}
            {userInfo.isGuest && (
              <div className="bg-gray-100 rounded-lg p-2">
                <h3 className="font-bold text-sm mb-1.5">
                  {authMode === "login" ? "Login" : "Create Account"}
                </h3>
                
                {/* Mode Toggle */}
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => {
                      setAuthMode("login");
                      setAuthError("");
                      setAuthUsername("");
                      setAuthConfirmPassword("");
                    }}
                    className={`flex-1 px-2 py-1.5 rounded text-xs font-semibold transition-colors ${
                      authMode === "login"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                    }`}
                  >
                    Login
                  </button>
                  <button
                    onClick={() => {
                      setAuthMode("signup");
                      setAuthError("");
                    }}
                    className={`flex-1 px-2 py-1.5 rounded text-xs font-semibold transition-colors ${
                      authMode === "signup"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                    }`}
                  >
                    Sign Up
                  </button>
                </div>

                {/* Error Message */}
                {authError && (
                  <div className="mb-1.5 p-1.5 bg-red-100 border border-red-300 rounded text-red-700 text-xs">
                    {authError}
                  </div>
                )}

                {/* Form */}
                <div className="space-y-1.5">
                  {authMode === "signup" && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-0.5">
                        Username
                      </label>
                      <input
                        type="text"
                        value={authUsername}
                        onChange={(e) => setAuthUsername(e.target.value)}
                        placeholder="Choose a username (3+ characters)"
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        disabled={authSubmitting}
                        minLength={3}
                        maxLength={20}
                      />
                    </div>
                  )}
                  
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-0.5">
                      Email
                    </label>
                    <input
                      type="email"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                      disabled={authSubmitting}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-0.5">
                      Password
                    </label>
                    <input
                      type="password"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="8+ characters"
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                      disabled={authSubmitting}
                    />
                  </div>

                  {authMode === "signup" && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-0.5">
                        Confirm Password
                      </label>
                      <input
                        type="password"
                        value={authConfirmPassword}
                        onChange={(e) => setAuthConfirmPassword(e.target.value)}
                        placeholder="Confirm password"
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        disabled={authSubmitting}
                      />
                    </div>
                  )}

                  <button
                    onClick={authMode === "login" ? handleLogin : handleSignup}
                    disabled={authSubmitting}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-2 py-1.5 rounded text-xs font-bold transition-colors"
                  >
                    {authSubmitting
                      ? "Processing..."
                      : authMode === "login"
                      ? "Login"
                      : "Create Account"}
                  </button>
                </div>
              </div>
            )}

            {/* Wallet Connection Section */}
            <div className="bg-gray-100 rounded-lg p-2">
              <h3 className="font-bold text-sm mb-1.5">Wallet Connection</h3>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-700 text-xs">Wallet Status:</span>
                  <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                    isConnected 
                      ? 'bg-green-300 text-green-700' 
                      : 'bg-red-300 text-red-700'
                  }`}>
                    {isConnected ? 'Connected' : 'Not Connected'}
                  </span>
                </div>
                {isConnected && address && (
                  <div className="text-xs text-gray-600 break-all">
                    <span className="font-semibold">Address:</span> {address}
                  </div>
                )}
                <div className="flex gap-2 mt-1.5">
                  {!isConnected ? (
                    <button
                      onClick={() => {
                        openConnectModal?.();
                        setShowMenu(false);
                      }}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-2 py-1.5 rounded text-xs font-bold transition-colors"
                    >
                      Connect Wallet
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          openAccountModal?.();
                          setShowMenu(false);
                        }}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-2 py-1.5 rounded text-xs font-bold transition-colors"
                      >
                        Account
                      </button>
                      <button
                        onClick={() => {
                          disconnect();
                          setShowMenu(false);
                        }}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white px-2 py-1.5 rounded text-xs font-bold transition-colors"
                      >
                        Disconnect
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Vault Modal */}
      <Modal isOpen={showVaultModal} onClose={() => setShowVaultModal(false)} maxWidth="md" padding="4">
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-center mb-2">Player Vault</h2>
          
          {/* Vault Balance */}
          <div className="bg-emerald-100 rounded-lg p-3 border-2 border-emerald-300">
            <div className="text-center">
              <div className="text-sm font-semibold text-gray-700 mb-1">Your MLEO Vault</div>
              <div className="flex items-center justify-center gap-2">
                <span className="text-2xl">💰</span>
                <span className="text-2xl font-bold text-emerald-700">{fmt(vault)} MLEO</span>
              </div>
            </div>
          </div>

          {/* Player Information */}
          <div className="bg-gray-100 rounded-lg p-3">
            <h3 className="font-bold text-sm mb-2">Player Information</h3>
            <div className="space-y-1.5 text-gray-700 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Username:</span>
                <span>{userInfo.username || 'Guest'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold">Email:</span>
                <span className="break-all text-right">{userInfo.email || 'Not provided'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold">Status:</span>
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                  userInfo.isGuest 
                    ? 'bg-gray-300 text-gray-700' 
                    : 'bg-green-300 text-green-700'
                }`}>
                  {userInfo.isGuest ? 'Guest' : 'Connected'}
                </span>
              </div>
            </div>
          </div>

          {/* Wallet Information */}
          {isConnected && address && (
            <div className="bg-gray-100 rounded-lg p-3">
              <h3 className="font-bold text-sm mb-2">Wallet Information</h3>
              <div className="space-y-1.5 text-gray-700 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Status:</span>
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-300 text-green-700">
                    Connected
                  </span>
                </div>
                <div className="break-all">
                  <span className="font-semibold">Address:</span> {address}
                </div>
              </div>
            </div>
          )}

          {/* Collect to Wallet Section */}
          <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
            <h3 className="font-bold text-sm mb-2">Collect to Wallet</h3>
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="number"
                  value={collectAmount}
                  onChange={(e) => setCollectAmount(Number(e.target.value))}
                  className="flex-1 px-2 py-1.5 text-xs rounded border border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="Amount"
                  min="1"
                  max={vault}
                  disabled={claiming}
                />
                <button
                  onClick={() => setCollectAmount(vault)}
                  className="px-3 py-1.5 text-xs rounded bg-amber-500/20 border border-amber-500/30 text-amber-700 hover:bg-amber-500/30 font-semibold"
                  disabled={claiming}
                >
                  MAX
                </button>
              </div>
              <div className="text-xs text-gray-600">
                Available: {fmt(vault)} MLEO
              </div>
              <button
                onClick={collectToWallet}
                disabled={collectAmount <= 0 || collectAmount > vault || claiming || !isConnected}
                className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-3 py-2 rounded text-sm font-bold transition-colors"
              >
                {claiming ? "Claiming..." : `CLAIM ${fmt(collectAmount)} MLEO`}
              </button>
              {!isConnected && (
                <p className="text-xs text-amber-700 text-center">
                  Connect your wallet to claim MLEO tokens
                </p>
              )}
            </div>
          </div>

          {/* Info Section */}
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
            <div className="text-xs text-blue-800">
              <p className="font-semibold mb-1">💡 About Your Vault:</p>
              <ul className="space-y-0.5 list-disc list-inside">
                <li>Your vault is shared between all MLEO games</li>
                <li>Play games to earn more MLEO tokens</li>
                <li>All rewards are automatically added to your vault</li>
                <li>Use free play tokens to play without using vault MLEO</li>
                <li>Connect your wallet and claim MLEO tokens on-chain</li>
              </ul>
            </div>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}