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
import PolicyModal from "../components/PolicyModal";

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
      "Each session uses at least 100 MLEO from your in-app vault. Some modes may use a different session cost",
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
    ],
    chooseGameLobbyShort: "Four modes, one Vault. Pick where to play.",
    minersDescShort: "Idle & upgrades. Vault + on-chain claim.",
    poolStatus: "Pool",
    arcadeGames: "Arcade Games",
    arcadeOnline: "Arcade Online",
    arcadeRegularTitle: "MLEO — Arcade",
    arcadeOnlineTitle: "MLEO — Arcade Online",
    arcadeBadgeLabel: "Arcade",
    onlineBadgeLabel: "Online",
    arcadeDescShort: "Solo mini-games. Shared vault & session rewards.",
    arcadeOnlineDescShort: "Multiplayer & live modes. Same shared vault.",
    arcadeOnlineHowIntro: "Live and online arcade modes use the same shared vault and ecosystem rules as solo arcade. Session costs and rewards may differ per mode.",
    legalShort: "Legal"
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
    arcadeWhatDesc: "MLEO Arcade هي مجموعة من 24 لعبة صغيرة مثيرة حيث يمكنك جمع مكافآت MLEO داخل التطبيق! كل لعبة لها آليات ومضاعفات فريدة.",
    arcadeHowToPlay: "كيف تلعب",
    arcadeSteps: [
      "اختر أي لعبة من الأركيد",
      "كل جلسة تستخدم على الأقل 100 MLEO من خزنتك داخل التطبيق. قد تستخدم بعض الأوضاع تكلفة جلسة مختلفة",
      "اتبع تعليمات اللعبة المحددة",
      "أكمل الجولات، وصل إلى المعالم، وجمع معززات المكافآت بناءً على نتائجك",
      "مكافآت الجلسة تُضاف تلقائيًا إلى خزنتك، بما في ذلك المكافآت المكتسبة من جلسات اللعب المجاني"
    ],
    arcadeFreePlay: "رموز اللعب المجاني",
    arcadeFreePlayList: [
      "احصل على رمز لعب مجاني واحد كل ساعة (حتى 5 مخزنة)",
      "استخدم الرموز لبدء جلسة أركيد واحدة دون استخدام MLEO من الخزنة",
      "المكافآت من جلسات اللعب المجاني تُضاف إلى خزنتك تمامًا مثل مكافآت الجلسة القياسية"
    ],
    arcadeGoodToKnow: "جيد أن تعرف",
    arcadeGoodToKnowList: [
      "خزنتك مشتركة بين جميع ألعاب MLEO",
      "كل لعبة تتبع نشاطك، الجلسات المكتملة، أفضل نتيجة، السلاسل، ومعالم التقدم",
      "بعض الألعاب تستخدم أحداث عشوائية، بينما تركز أخرى على التوقيت، رد الفعل، الذاكرة، أو اتخاذ القرار",
      "انقر على زر ℹ️ في كل بطاقة لعبة لعرض القواعد، التحكم، وهيكل المكافآت"
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
    arcadeWhatDesc: "MLEO Arcade - это коллекция из 24 увлекательных мини-игр, где вы можете собирать внутриигровые награды MLEO! Каждая игра имеет уникальную механику и множители.",
    arcadeHowToPlay: "Как играть",
    arcadeSteps: [
      "Выберите любую игру из аркады",
      "Каждая сессия использует минимум 100 MLEO из вашего внутриигрового хранилища. Некоторые режимы могут использовать другую стоимость сессии",
      "Следуйте инструкциям для конкретной игры",
      "Завершайте раунды, достигайте вех и собирайте бонусы наград на основе ваших результатов",
      "Награды сессии автоматически добавляются в ваше хранилище, включая награды, заработанные в бесплатных сессиях"
    ],
    arcadeFreePlay: "Токены бесплатной игры",
    arcadeFreePlayList: [
      "Получайте 1 токен бесплатной игры каждый час (до 5 хранимых)",
      "Используйте токены для запуска одной аркадной сессии без использования MLEO из хранилища",
      "Награды из бесплатных сессий добавляются в ваше хранилище так же, как и стандартные награды сессии"
    ],
    arcadeGoodToKnow: "Хорошо знать",
    arcadeGoodToKnowList: [
      "Ваше хранилище общее для всех игр MLEO",
      "Каждая игра отслеживает вашу активность, завершенные сессии, лучший результат, серии и вехи прогресса",
      "Некоторые игры используют случайные события, в то время как другие фокусируются на времени, реакции, памяти или принятии решений",
      "Нажмите кнопку ℹ️ на каждой карточке игры, чтобы просмотреть правила, управление и структуру наград"
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
    arcadeWhatDesc: "MLEO Arcade es una colección de 24 emocionantes minijuegos donde puedes recolectar recompensas MLEO dentro de la aplicación! Cada juego tiene mecánicas y multiplicadores únicos.",
    arcadeHowToPlay: "Cómo jugar",
    arcadeSteps: [
      "Elige cualquier juego del arcade",
      "Cada sesión usa al menos 100 MLEO de tu bóveda dentro de la aplicación. Algunos modos pueden usar un costo de sesión diferente",
      "Sigue las instrucciones específicas del juego",
      "Completa rondas, alcanza hitos y recolecta impulsos de recompensa basados en tus resultados",
      "Las recompensas de sesión se agregan automáticamente a tu bóveda, incluyendo recompensas ganadas en sesiones de juego gratis"
    ],
    arcadeFreePlay: "Tokens de juego gratis",
    arcadeFreePlayList: [
      "Recibe 1 token de juego gratis cada hora (hasta 5 almacenados)",
      "Usa tokens para iniciar una sesión de arcade sin usar MLEO de la bóveda",
      "Las recompensas de sesiones de juego gratis se agregan a tu bóveda igual que las recompensas de sesión estándar"
    ],
    arcadeGoodToKnow: "Bueno saber",
    arcadeGoodToKnowList: [
      "Tu bóveda se comparte entre todos los juegos MLEO",
      "Cada juego rastrea tu actividad, sesiones completadas, mejor puntuación, rachas y hitos de progreso",
      "Algunos juegos usan eventos aleatorios, mientras que otros se enfocan en tiempo, reacción, memoria o toma de decisiones",
      "Haz clic en el botón ℹ️ en cada tarjeta de juego para ver las reglas, controles y estructura de recompensas"
    ]
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
    arcadeWhatDesc: "MLEO Arcade est une collection de 24 mini-jeux passionnants où vous pouvez collecter des récompenses MLEO dans l'application! Chaque jeu a des mécaniques et multiplicateurs uniques.",
    arcadeHowToPlay: "Comment jouer",
    arcadeSteps: [
      "Choisissez n'importe quel jeu de l'arcade",
      "Chaque session utilise au moins 100 MLEO de votre coffre dans l'application. Certains modes peuvent utiliser un coût de session différent",
      "Suivez les instructions spécifiques du jeu",
      "Terminez les manches, atteignez les jalons et collectez les boosts de récompense basés sur vos résultats",
      "Les récompenses de session sont automatiquement ajoutées à votre coffre, y compris les récompenses gagnées dans les sessions de jeu gratuit"
    ],
    arcadeFreePlay: "Tokens de jeu gratuit",
    arcadeFreePlayList: [
      "Recevez 1 token de jeu gratuit chaque heure (jusqu'à 5 stockés)",
      "Utilisez les tokens pour démarrer une session d'arcade sans utiliser MLEO du coffre",
      "Les récompenses des sessions de jeu gratuit sont ajoutées à votre coffre comme les récompenses de session standard"
    ],
    arcadeGoodToKnow: "Bon à savoir",
    arcadeGoodToKnowList: [
      "Votre coffre est partagé entre tous les jeux MLEO",
      "Chaque jeu suit votre activité, sessions complétées, meilleur score, séries et jalons de progression",
      "Certains jeux utilisent des événements aléatoires, tandis que d'autres se concentrent sur le timing, la réaction, la mémoire ou la prise de décision",
      "Cliquez sur le bouton ℹ️ sur chaque carte de jeu pour voir les règles, contrôles et structure de récompenses"
    ]
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
    arcadeWhatDesc: "MLEO Arcade ist eine Sammlung von 24 spannenden Mini-Spielen, bei denen Sie MLEO-Belohnungen in der App sammeln können! Jedes Spiel hat einzigartige Mechaniken und Multiplikatoren.",
    arcadeHowToPlay: "Wie man spielt",
    arcadeSteps: [
      "Wählen Sie ein beliebiges Spiel aus der Arcade",
      "Jede Sitzung verwendet mindestens 1.000 MLEO aus Ihrem Tresor in der App. Einige Modi können unterschiedliche Sitzungskosten verwenden",
      "Folgen Sie den spielspezifischen Anweisungen",
      "Vervollständigen Sie Läufe, erreichen Sie Meilensteine und sammeln Sie Belohnungs-Boosts basierend auf Ihren Ergebnissen",
      "Sitzungsbelohnungen werden automatisch zu Ihrem Tresor hinzugefügt, einschließlich Belohnungen aus kostenlosen Spielsitzungen"
    ],
    arcadeFreePlay: "Kostenlose Spiel-Token",
    arcadeFreePlayList: [
      "Erhalten Sie jede Stunde 1 kostenloses Spiel-Token (bis zu 5 gespeichert)",
      "Verwenden Sie Token, um eine Arcade-Sitzung zu starten, ohne MLEO aus dem Tresor zu verwenden",
      "Belohnungen aus kostenlosen Spielsitzungen werden zu Ihrem Tresor hinzugefügt, genau wie Standard-Sitzungsbelohnungen"
    ],
    arcadeGoodToKnow: "Gut zu wissen",
    arcadeGoodToKnowList: [
      "Ihr Tresor wird von allen MLEO-Spielen geteilt",
      "Jedes Spiel verfolgt Ihre Aktivität, abgeschlossene Sitzungen, beste Punktzahl, Serien und Fortschrittsmeilensteine",
      "Einige Spiele verwenden zufällige Ereignisse, während andere sich auf Timing, Reaktion, Gedächtnis oder Entscheidungsfindung konzentrieren",
      "Klicken Sie auf die ℹ️-Schaltfläche auf jeder Spielkarte, um die Regeln, Steuerungen und Belohnungsstruktur anzuzeigen"
    ]
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
    arcadeWhatDesc: "MLEO街机是24款激动人心的迷你游戏合集，您可以收集应用内MLEO奖励！每款游戏都有独特的机制和倍数。",
    arcadeHowToPlay: "如何游玩",
    arcadeSteps: [
      "从街机中选择任何游戏",
      "每场会话至少使用100 MLEO从您的应用内金库。某些模式可能使用不同的会话成本",
      "遵循游戏特定的说明",
      "完成回合，达到里程碑，并根据您的结果收集奖励提升",
      "会话奖励自动添加到您的金库，包括从免费游戏会话中获得的奖励"
    ],
    arcadeFreePlay: "免费游玩代币",
    arcadeFreePlayList: [
      "每小时获得1个免费游玩代币（最多5个代币）",
      "使用代币启动一次街机会话，而无需使用金库MLEO",
      "免费游戏会话的奖励会添加到您的金库，就像标准会话奖励一样"
    ],
    arcadeGoodToKnow: "须知",
    arcadeGoodToKnowList: [
      "您的金库在所有MLEO游戏中共享",
      "每款游戏跟踪您的活动、完成的会话、最佳分数、连胜和进度里程碑",
      "一些游戏使用随机事件，而其他游戏则专注于时间、反应、记忆或决策",
      "点击每款游戏卡上的ℹ️按钮查看规则、控制和奖励结构"
    ]
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
    arcadeWhatDesc: "MLEO Arcadeは、アプリ内MLEO報酬を集めることができる24種類のエキサイティングなミニゲームのコレクションです！各ゲームはユニークなメカニクスとマルチプライヤーがあります。",
    arcadeHowToPlay: "プレイ方法",
    arcadeSteps: [
      "アーケードから任意のゲームを選択",
      "各セッションはアプリ内ボルトから少なくとも100 MLEOを使用します。一部のモードは異なるセッションコストを使用する場合があります",
      "ゲーム固有の指示に従う",
      "ラウンドを完了し、マイルストーンに到達し、結果に基づいて報酬ブーストを収集",
      "セッション報酬は、無料プレイセッションで獲得した報酬を含めて、自動的にボルトに追加されます"
    ],
    arcadeFreePlay: "無料プレイトークン",
    arcadeFreePlayList: [
      "毎時1つの無料プレイトークンを受け取る（最大5つ保存）",
      "トークンを使用してボルトMLEOを使用せずにアーケードセッションを開始",
      "無料プレイセッションからの報酬は、標準セッション報酬と同様にボルトに追加されます"
    ],
    arcadeGoodToKnow: "知っておくと良いこと",
    arcadeGoodToKnowList: [
      "ボルトはすべてのMLEOゲーム間で共有されます",
      "各ゲームは、アクティビティ、完了したセッション、ベストスコア、連勝、進捗マイルストーンを追跡します",
      "一部のゲームはランダムイベントを使用し、他のゲームはタイミング、反応、記憶、または意思決定に焦点を当てています",
      "各ゲームカードのℹ️ボタンをクリックして、ルール、コントロール、報酬構造を表示"
    ]
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
    arcadeWhatDesc: "MLEO Arcade는 앱 내 MLEO 보상을 수집할 수 있는 24개의 흥미진진한 미니 게임 컬렉션입니다! 각 게임은 고유한 메커니즘과 배수를 가지고 있습니다.",
    arcadeHowToPlay: "플레이 방법",
    arcadeSteps: [
      "아케이드에서 아무 게임이나 선택",
      "각 세션은 앱 내 금고에서 최소 100 MLEO를 사용합니다. 일부 모드는 다른 세션 비용을 사용할 수 있습니다",
      "게임별 지침을 따르세요",
      "라운드를 완료하고 마일스톤에 도달하며 결과에 따라 보상 부스트 수집",
      "세션 보상은 무료 플레이 세션에서 획득한 보상을 포함하여 자동으로 금고에 추가됩니다"
    ],
    arcadeFreePlay: "무료 플레이 토큰",
    arcadeFreePlayList: [
      "매시간 1개의 무료 플레이 토큰 받기 (최대 5개 저장)",
      "토큰을 사용하여 금고 MLEO를 사용하지 않고 아케이드 세션 시작",
      "무료 플레이 세션의 보상은 표준 세션 보상과 마찬가지로 금고에 추가됩니다"
    ],
    arcadeGoodToKnow: "알아두면 좋은 정보",
    arcadeGoodToKnowList: [
      "금고는 모든 MLEO 게임 간에 공유됩니다",
      "각 게임은 활동, 완료된 세션, 최고 점수, 연승 및 진행 마일스톤을 추적합니다",
      "일부 게임은 무작위 이벤트를 사용하고 다른 게임은 타이밍, 반응, 기억 또는 의사 결정에 중점을 둡니다",
      "각 게임 카드의 ℹ️ 버튼을 클릭하여 규칙, 컨트롤 및 보상 구조 보기"
    ]
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
    arcadeWhatDesc: "MLEO Arcade, uygulama içi MLEO ödüllerini toplayabileceğiniz 24 heyecan verici mini oyun koleksiyonudur! Her oyunun benzersiz mekanikleri ve çarpanları vardır.",
    arcadeHowToPlay: "Nasıl oynanır",
    arcadeSteps: [
      "Arcade'den herhangi bir oyun seçin",
      "Her oturum uygulama içi kasasından en az 100 MLEO kullanır. Bazı modlar farklı oturum maliyeti kullanabilir",
      "Oyun özel talimatlarını takip edin",
      "Turları tamamlayın, kilometre taşlarına ulaşın ve sonuçlarınıza göre ödül artışları toplayın",
      "Oturum ödülleri, ücretsiz oyun oturumlarında kazanılan ödüller dahil olmak üzere otomatik olarak kasasına eklenir"
    ],
    arcadeFreePlay: "Ücretsiz oyun tokenleri",
    arcadeFreePlayList: [
      "Her saat 1 ücretsiz oyun jetonu alın (en fazla 5 saklanır)",
      "Kasası MLEO kullanmadan bir arcade oturumu başlatmak için jetonları kullanın",
      "Ücretsiz oyun oturumlarından gelen ödüller, standart oturum ödülleri gibi kasasına eklenir"
    ],
    arcadeGoodToKnow: "Bilmekte fayda var",
    arcadeGoodToKnowList: [
      "Kasası tüm MLEO oyunları arasında paylaşılır",
      "Her oyun aktivitenizi, tamamlanan oturumları, en iyi skoru, serileri ve ilerleme kilometre taşlarını takip eder",
      "Bazı oyunlar rastgele olaylar kullanırken, diğerleri zamanlama, tepki, hafıza veya karar vermeye odaklanır",
      "Kuralları, kontrolleri ve ödül yapısını görüntülemek için her oyun kartındaki ℹ️ düğmesine tıklayın"
    ]
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
    arcadeWhatDesc: "MLEO Arcade è una collezione di 24 mini-giochi entusiasmanti dove puoi raccogliere ricompense MLEO nell'app! Ogni gioco ha meccaniche e moltiplicatori unici.",
    arcadeHowToPlay: "Come giocare",
    arcadeSteps: [
      "Scegli qualsiasi gioco dall'arcade",
      "Ogni sessione utilizza almeno 100 MLEO dal tuo caveau nell'app. Alcune modalità possono utilizzare un costo di sessione diverso",
      "Segui le istruzioni specifiche del gioco",
      "Completa i round, raggiungi i traguardi e raccogli i potenziamenti delle ricompense in base ai tuoi risultati",
      "Le ricompense della sessione vengono aggiunte automaticamente al tuo caveau, incluse le ricompense ottenute nelle sessioni di gioco gratuito"
    ],
    arcadeFreePlay: "Token gioco gratuito",
    arcadeFreePlayList: [
      "Ricevi 1 token di gioco gratuito ogni ora (fino a 5 memorizzati)",
      "Usa i token per avviare una sessione arcade senza usare MLEO dal caveau",
      "Le ricompense delle sessioni di gioco gratuito vengono aggiunte al tuo caveau proprio come le ricompense di sessione standard"
    ],
    arcadeGoodToKnow: "Buono a sapersi",
    arcadeGoodToKnowList: [
      "Il tuo caveau è condiviso tra tutti i giochi MLEO",
      "Ogni gioco traccia la tua attività, sessioni completate, miglior punteggio, serie e traguardi di progresso",
      "Alcuni giochi utilizzano eventi casuali, mentre altri si concentrano su tempismo, reazione, memoria o decision making",
      "Clicca il pulsante ℹ️ su ogni scheda del gioco per visualizzare regole, controlli e struttura delle ricompense"
    ]
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
    arcadeWhatDesc: "MLEO Arcade არის 24 საინტერესო მინი-თამაშების კოლექცია, სადაც შეგიძლიათ შეაგროვოთ აპლიკაციაში MLEO ჯილდოები! თითოეულ თამაშს აქვს უნიკალური მექანიკა და მულტიპლიკატორები.",
    arcadeHowToPlay: "როგორ ვითამაშოთ",
    arcadeSteps: [
      "აირჩიეთ ნებისმიერი თამაში არკადიდან",
      "თითოეული სესია იყენებს მინიმუმ 100 MLEO თქვენი აპლიკაციაში ვოლტიდან. ზოგიერთ რეჟიმს შეიძლება გამოიყენოს სხვა სესიის ღირებულება",
      "მიჰყევით თამაშის სპეციფიკურ ინსტრუქციებს",
      "დაასრულეთ რაუნდები, მიაღწიეთ მილიენისტონებს და შეაგროვეთ ჯილდოს ბუსტები თქვენი შედეგების მიხედვით",
      "სესიის ჯილდოები ავტომატურად ემატება თქვენს ვოლტს, მათ შორის უფასო თამაშის სესიებში მოპოვებული ჯილდოები"
    ],
    arcadeFreePlay: "უფასო თამაშის ტოკენები",
    arcadeFreePlayList: [
      "მიიღეთ 1 უფასო თამაშის ტოკენი ყოველ საათში (მაქსიმუმ 5 შენახული)",
      "გამოიყენეთ ტოკენები არკადის სესიის დასაწყებად ვოლტის MLEO-ს გამოყენების გარეშე",
      "უფასო თამაშის სესიებიდან ჯილდოები ემატება თქვენს ვოლტს, ისევე როგორც სტანდარტული სესიის ჯილდოები"
    ],
    arcadeGoodToKnow: "კარგი იცოდე",
    arcadeGoodToKnowList: [
      "თქვენი ვოლტი იზიარება ყველა MLEO თამაშს შორის",
      "თითოეული თამაში ადევნებს თვალს თქვენს აქტივობას, დასრულებულ სესიებს, საუკეთესო ქულას, სერიებსა და პროგრესის მილიენისტონებს",
      "ზოგიერთი თამაში იყენებს შემთხვევით მოვლენებს, ხოლო სხვები ფოკუსირდება დროზე, რეაქციაზე, მეხსენებაზე ან გადაწყვეტილების მიღებაზე",
      "დააწკაპუნეთ ℹ️ ღილაკზე თითოეულ თამაშის ბარათზე წესების, კონტროლებისა და ჯილდოს სტრუქტურის სანახავად"
    ]
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
    arcadeWhatDesc: "MLEO Arcade to kolekcja 24 ekscytujących mini-gier, w których możesz zbierać nagrody MLEO w aplikacji! Każda gra ma unikalną mechanikę i mnożniki.",
    arcadeHowToPlay: "Jak grać",
    arcadeSteps: [
      "Wybierz dowolną grę z salonu gier",
      "Każda sesja używa co najmniej 100 MLEO z twojego skarbca w aplikacji. Niektóre tryby mogą używać innego kosztu sesji",
      "Postępuj zgodnie z instrukcjami specyficznymi dla gry",
      "Ukończ rundy, osiągnij kamienie milowe i zbieraj wzmocnienia nagród na podstawie swoich wyników",
      "Nagrody sesji są automatycznie dodawane do twojego skarbca, w tym nagrody zdobyte w darmowych sesjach gry"
    ],
    arcadeFreePlay: "Tokeny darmowej gry",
    arcadeFreePlayList: [
      "Otrzymuj 1 token darmowej gry co godzinę (do 5 przechowywanych)",
      "Używaj tokenów do rozpoczęcia sesji salonu gier bez używania MLEO ze skarbca",
      "Nagrody z darmowych sesji gry są dodawane do twojego skarbca tak samo jak standardowe nagrody sesji"
    ],
    arcadeGoodToKnow: "Dobrze wiedzieć",
    arcadeGoodToKnowList: [
      "Twój skarbiec jest współdzielony między wszystkimi grami MLEO",
      "Każda gra śledzi twoją aktywność, ukończone sesje, najlepszy wynik, serie i kamienie milowe postępu",
      "Niektóre gry używają losowych wydarzeń, podczas gdy inne skupiają się na czasie, reakcji, pamięci lub podejmowaniu decyzji",
      "Kliknij przycisk ℹ️ na każdej karcie gry, aby wyświetlić zasady, kontrolki i strukturę nagród"
    ]
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
    arcadeWhatDesc: "MLEO Arcade este o colecție de 24 mini-jocuri captivante unde poți colecta recompense MLEO în aplicație! Fiecare joc are mecanici și multiplicatori unici.",
    arcadeHowToPlay: "Cum să joci",
    arcadeSteps: [
      "Alege orice joc din arcade",
      "Fiecare sesiune folosește cel puțin 100 MLEO din seiful tău în aplicație. Unele moduri pot folosi un cost de sesiune diferit",
      "Urmează instrucțiunile specifice jocului",
      "Finalizează runde, atinge obiectivele și colectează impulsuri de recompensă bazate pe rezultatele tale",
      "Recompensele sesiunii sunt adăugate automat în seiful tău, inclusiv recompensele câștigate în sesiunile de joc gratuit"
    ],
    arcadeFreePlay: "Token-uri joc gratuit",
    arcadeFreePlayList: [
      "Primește 1 token de joc gratuit la fiecare oră (până la 5 stocate)",
      "Folosește tokenurile pentru a începe o sesiune arcade fără a folosi MLEO din seif",
      "Recompensele din sesiunile de joc gratuit sunt adăugate în seiful tău la fel ca recompensele standard de sesiune"
    ],
    arcadeGoodToKnow: "Bine de știut",
    arcadeGoodToKnowList: [
      "Seiful tău este partajat între toate jocurile MLEO",
      "Fiecare joc urmărește activitatea ta, sesiunile finalizate, cel mai bun scor, seriile și obiectivele de progres",
      "Unele jocuri folosesc evenimente aleatoare, în timp ce altele se concentrează pe sincronizare, reacție, memorie sau luarea deciziilor",
      "Apasă butonul ℹ️ pe fiecare carte de joc pentru a vedea regulile, controalele și structura recompenselor"
    ]
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
    arcadeWhatDesc: "MLEO Arcade je sbírka 24 vzrušujících miniher, kde můžete sbírat odměny MLEO v aplikaci! Každá hra má jedinečné mechaniky a multiplikátory.",
    arcadeHowToPlay: "Jak hrát",
    arcadeSteps: [
      "Vyberte libovolnou hru z arkád",
      "Každá relace používá alespoň 100 MLEO z vašeho trezoru v aplikaci. Některé režimy mohou používat jiné náklady na relaci",
      "Postupujte podle pokynů specifických pro hru",
      "Dokončete kola, dosáhněte milníků a sbírejte posílení odměn na základě vašich výsledků",
      "Odměny relace jsou automaticky přidávány do vašeho trezoru, včetně odměn získaných v bezplatných herních relacích"
    ],
    arcadeFreePlay: "Tokeny zdarma",
    arcadeFreePlayList: [
      "Získejte 1 token bezplatné hry každou hodinu (až 5 uložených)",
      "Použijte tokeny k zahájení arkádové relace bez použití MLEO z trezoru",
      "Odměny z bezplatných herních relací jsou přidávány do vašeho trezoru stejně jako standardní odměny relace"
    ],
    arcadeGoodToKnow: "Dobré vědět",
    arcadeGoodToKnowList: [
      "Váš trezor je sdílen mezi všemi hrami MLEO",
      "Každá hra sleduje vaši aktivitu, dokončené relace, nejlepší skóre, série a milníky pokroku",
      "Některé hry používají náhodné události, zatímco jiné se zaměřují na načasování, reakci, paměť nebo rozhodování",
      "Klikněte na tlačítko ℹ️ na každé herní kartě pro zobrazení pravidel, ovládacích prvků a struktury odměn"
    ]
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
    arcadeWhatDesc: "MLEO Arcade is een verzameling van 24 spannende mini-games waar je MLEO-beloningen in de app kunt verzamelen! Elke game heeft unieke mechanica en vermenigvuldigers.",
    arcadeHowToPlay: "Hoe te spelen",
    arcadeSteps: [
      "Kies een willekeurige game uit de arcade",
      "Elke sessie gebruikt minimaal 100 MLEO uit je kluis in de app. Sommige modi kunnen verschillende sessiekosten gebruiken",
      "Volg de gamespecifieke instructies",
      "Voltooi rondes, bereik mijlpalen en verzamel beloningsboosts op basis van je resultaten",
      "Sessiebeloningen worden automatisch toegevoegd aan je kluis, inclusief beloningen verdiend in gratis spelsessies"
    ],
    arcadeFreePlay: "Gratis speel tokens",
    arcadeFreePlayList: [
      "Ontvang elk uur 1 gratis speeltoken (tot 5 opgeslagen)",
      "Gebruik tokens om een arcade-sessie te starten zonder kluis MLEO te gebruiken",
      "Beloningen van gratis spelsessies worden toegevoegd aan je kluis, net als standaard sessiebeloningen"
    ],
    arcadeGoodToKnow: "Goed om te weten",
    arcadeGoodToKnowList: [
      "Je kluis wordt gedeeld tussen alle MLEO-games",
      "Elke game volgt je activiteit, voltooide sessies, beste score, reeksen en voortgangsmijlpalen",
      "Sommige games gebruiken willekeurige gebeurtenissen, terwijl andere zich richten op timing, reactie, geheugen of besluitvorming",
      "Klik op de ℹ️-knop op elke gamekaart om de regels, bedieningselementen en beloningsstructuur te bekijken"
    ]
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
    arcadeWhatDesc: "Το MLEO Arcade είναι μια συλλογή 24 συναρπαστικών μίνι παιχνιδιών όπου μπορείτε να συλλέξετε ανταμοιβές MLEO στην εφαρμογή! Κάθε παιχνίδι έχει μοναδικές μηχανικές και πολλαπλασιαστές.",
    arcadeHowToPlay: "Πώς να παίξετε",
    arcadeSteps: [
      "Επιλέξτε οποιοδήποτε παιχνίδι από το arcade",
      "Κάθε συνεδρία χρησιμοποιεί τουλάχιστον 100 MLEO από το χρηματοκιβώτιό σας στην εφαρμογή. Ορισμένες λειτουργίες μπορεί να χρησιμοποιούν διαφορετικό κόστος συνεδρίας",
      "Ακολουθήστε τις οδηγίες ειδικές για το παιχνίδι",
      "Ολοκληρώστε γύρους, φτάστε στα ορόσημα και συλλέξτε ενισχύσεις ανταμοιβών με βάση τα αποτελέσματά σας",
      "Οι ανταμοιβές συνεδρίας προστίθενται αυτόματα στο χρηματοκιβώτιό σας, συμπεριλαμβανομένων των ανταμοιβών που κερδίζονται σε δωρεάν συνεδρίες παιχνιδιού"
    ],
    arcadeFreePlay: "Δωρεάν παιχνίδι tokens",
    arcadeFreePlayList: [
      "Λάβετε 1 δωρεάν token παιχνιδιού κάθε ώρα (έως 5 αποθηκευμένα)",
      "Χρησιμοποιήστε tokens για να ξεκινήσετε μια συνεδρία arcade χωρίς να χρησιμοποιήσετε MLEO από το χρηματοκιβώτιο",
      "Οι ανταμοιβές από δωρεάν συνεδρίες παιχνιδιού προστίθενται στο χρηματοκιβώτιό σας όπως οι τυπικές ανταμοιβές συνεδρίας"
    ],
    arcadeGoodToKnow: "Καλό να ξέρετε",
    arcadeGoodToKnowList: [
      "Το χρηματοκιβώτιό σας μοιράζεται μεταξύ όλων των παιχνιδιών MLEO",
      "Κάθε παιχνίδι παρακολουθεί τη δραστηριότητά σας, τις ολοκληρωμένες συνεδρίες, την καλύτερη βαθμολογία, τις σειρές και τα ορόσημα προόδου",
      "Ορισμένα παιχνίδια χρησιμοποιούν τυχαία γεγονότα, ενώ άλλα εστιάζουν στον συγχρονισμό, την αντίδραση, τη μνήμη ή τη λήψη αποφάσεων",
      "Κάντε κλικ στο κουμπί ℹ️ σε κάθε κάρτα παιχνιδιού για να δείτε τους κανόνες, τα στοιχεία ελέγχου και τη δομή ανταμοιβών"
    ]
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
    arcadeWhatDesc: "MLEO Arcade הוא אוסף של 24 מיני-משחקים מרגשים שבהם תוכלו לאסוף פרסי MLEO בתוך האפליקציה! לכל משחק יש מכניקות ומכפילים ייחודיים.",
    arcadeHowToPlay: "איך משחקים",
    arcadeSteps: [
      "בחרו כל משחק מהארקייד",
      "כל סשן משתמש בלפחות 100 MLEO מהכספת שלכם באפליקציה. חלק מהמצבים עשויים להשתמש בעלות סשן שונה",
      "עקבו אחר ההוראות הספציפיות למשחק",
      "השלימו סבבים, הגיעו לאבני דרך ואספו הגברות פרסים בהתבסס על התוצאות שלכם",
      "פרסי הסשן מתווספים אוטומטית לכספת שלכם, כולל פרסים שהושגו בסשני משחק חינמיים"
    ],
    arcadeFreePlay: "טוקנים של משחק חינם",
    arcadeFreePlayList: [
      "קבלו 1 אסימון משחק חינמי בכל שעה (עד 5 מאוחסנים)",
      "השתמשו באסימונים כדי להתחיל סשן ארקייד אחד ללא שימוש ב-MLEO מהכספת",
      "פרסים מסשני משחק חינמיים מתווספים לכספת שלכם בדיוק כמו פרסי סשן סטנדרטיים"
    ],
    arcadeGoodToKnow: "טוב לדעת",
    arcadeGoodToKnowList: [
      "הכספת שלכם משותפת בין כל משחקי MLEO",
      "כל משחק עוקב אחר הפעילות שלכם, סשנים שהושלמו, הציון הטוב ביותר, רצפים ואבני דרך התקדמות",
      "חלק מהמשחקים משתמשים באירועים אקראיים, בעוד שאחרים מתמקדים בתזמון, תגובה, זיכרון או קבלת החלטות",
      "לחצו על כפתור ℹ️ בכל כרטיס משחק כדי לראות את הכללים, הבקרות ומבנה הפרסים"
    ]
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
  const questText = lang === "he"
    ? {
        title: "איך לשחק - MLEO BASE",
        goal: "מטרת המשחק",
        goalDesc: "MLEO BASE הוא מרכז הפיקוד האסטרטגי שלך באקוסיסטם של MLEO. בנה ושדרג את הבסיס שלך, נהל אנרגיה, הפק משאבים, צא למשלחות, זקק חומרים ל-MLEO שמור ושלח אותו ל-Vault המשותף.",
        gameplay: "איך זה עובד",
        gameplaySteps: [
          "שדרג מבנים",
          "נהל אנרגיה",
          "הפק Ore, Gold, Scrap ו-Data",
          "זקק Banked MLEO",
          "צא למשלחות",
          "שלח MLEO ל-Vault המשותף",
        ],
        features: "מה חשוב לדעת",
        featuresList: [
          "המוד הזה עובד יחד עם Miners ו-Arcade כדי לתמוך בהתקדמות ארוכת טווח, utility חכם ואיזון טוקן בריא.",
          "בנה חכם, גדל בהדרגה, וחזק את הבסיס שלך.",
        ],
      }
    : {
        title: "How to Play - MLEO BASE",
        goal: "Goal",
        goalDesc: "MLEO BASE is the strategic command center of the MLEO ecosystem. Build and upgrade your base, manage energy and stability, produce key resources, launch expeditions, refine materials into banked MLEO, and carefully ship part of it to the shared vault.",
        gameplay: "Your mission",
        gameplaySteps: [
          "Upgrade buildings",
          "Manage energy and base stability",
          "Produce Ore, Gold, Scrap, and Data",
          "Use Data for advanced operations",
          "Refine resources into banked MLEO",
          "Launch expeditions for progression and materials",
          "Ship MLEO to the shared vault with smart timing",
          "Support the wider ecosystem through long-term planning",
        ],
        features: "Good to Know",
        featuresList: [
          "Banked MLEO stays inside BASE until you ship it to the shared vault.",
          "Shipping is controlled by daily limits and efficiency pressure, so smart pacing matters.",
          "This mode works together with Miners and Arcade to support long-term progression, smart utility, and healthier token balance.",
          "Build smart, maintain stability, grow steadily, and strengthen your base.",
        ],
      };
  
  if (gameType === "quest") {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-4">{questText.title}</h2>
        
        <section className="mb-6">
          <h3 className="font-bold text-lg mb-2">{questText.goal}</h3>
          <p className="text-gray-700">{questText.goalDesc}</p>
        </section>
        
        <section className="mb-6">
          <h3 className="font-bold text-lg mb-2">{questText.gameplay}</h3>
          <ol className="list-decimal ml-5 space-y-2">
            {questText.gameplaySteps.map((step, index) => (
              <li key={index} className="text-gray-700">{step}</li>
            ))}
          </ol>
        </section>
        
        <section className="mb-6">
          <h3 className="font-bold text-lg mb-2">{questText.features}</h3>
          <ul className="list-disc ml-5 space-y-2">
            {questText.featuresList.map((item, index) => (
              <li key={index} className="text-gray-700">{item}</li>
            ))}
          </ul>
        </section>
      </div>
    );
  }
  
  if (gameType === "arcade" || gameType === "arcade-online") {
    const isOnline = gameType === "arcade-online";
    return (
      <div>
        <h2 className="text-2xl font-bold mb-4">
          {text.howToPlayTitle}
          {isOnline ? " — Arcade Online" : " — Arcade"}
        </h2>
        {isOnline && text.arcadeOnlineHowIntro && (
          <p className="text-gray-600 mb-4 text-sm leading-relaxed">{text.arcadeOnlineHowIntro}</p>
        )}
        
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
    <div className="max-h-[80vh] overflow-y-auto">
      <h2 className="text-2xl font-bold mb-4">Terms & Conditions</h2>
      <p className="text-xs text-gray-500 mb-4">Last Updated: [Insert Date]</p>
      
      <div className="space-y-4 text-sm">
        <section>
          <p className="mb-4">Welcome to the MLEO game platform (the "<strong>Platform</strong>", "<strong>we</strong>", "<strong>us</strong>", or "<strong>our</strong>"). These Terms & Conditions ("<strong>Terms</strong>") govern your access to and use of the Platform, including our websites, games, applications, features, wallet-related integrations, testnet functionality, community features, promotional campaigns, and any related services.</p>
          <p className="mb-4">By accessing or using the Platform, you confirm that you have read, understood, and agreed to these Terms. If you do not agree, do not access or use the Platform.</p>
        </section>

        <section>
          <h3 className="font-bold text-black mb-2">1. Eligibility</h3>
          <p className="mb-2">You may use the Platform only if:</p>
          <ul className="list-disc ml-5 space-y-1">
            <li>you are at least <strong>18 years old</strong>, or the age of legal majority in your jurisdiction, whichever is higher;</li>
            <li>you have the legal capacity to enter into a binding agreement;</li>
            <li>your use of the Platform is not prohibited by applicable law in your location; and</li>
            <li>you are not accessing the Platform from a jurisdiction where the Platform, digital assets, online games, or related services are restricted or prohibited.</li>
          </ul>
          <p className="mt-2">You are solely responsible for ensuring that your use of the Platform is lawful in your jurisdiction.</p>
        </section>

        <section className="bg-yellow-50 border-2 border-yellow-400 p-4 rounded-lg">
          <h3 className="font-bold text-black mb-2">2. Entertainment Platform Only</h3>
          <p className="mb-2">The Platform is designed for <strong>entertainment, gameplay, community participation, and digital interactive experiences</strong>.</p>
          <p className="mb-2">The Platform is <strong>not</strong> intended to operate as:</p>
          <ul className="list-disc ml-5 space-y-1">
            <li>a casino;</li>
            <li>a gambling or betting service;</li>
            <li>a real-money gaming platform;</li>
            <li>a financial service;</li>
            <li>an exchange, broker, investment platform, or securities offering; or</li>
            <li>a provider of legal, tax, accounting, or investment advice.</li>
          </ul>
          <p className="mt-2">Nothing on the Platform should be interpreted as an invitation to gamble, place bets, make financial decisions, or expect profits.</p>
        </section>

        <section className="bg-red-50 border-2 border-red-400 p-4 rounded-lg">
          <h3 className="font-bold text-black mb-2">3. No Deposits, No Purchase of In-Game Balances</h3>
          <p className="mb-2"><strong>At this time</strong>, the Platform does <strong>not</strong> allow users to deposit fiat currency, cryptocurrency, or any other asset in order to participate in gameplay or obtain in-game balances for gameplay purposes.</p>
          <p className="mb-2"><strong>At this time</strong>, users cannot purchase in-game game balances with money or cryptocurrency for gameplay use on the Platform.</p>
          <p>Any balances, points, rewards, vault amounts, or gameplay progress shown inside the Platform are subject to the rules of the Platform and may exist solely as part of the entertainment experience, test environment, reward mechanics, or technical platform functionality.</p>
        </section>

        <section>
          <h3 className="font-bold text-black mb-2">4. Testnet, Wallet, and Blockchain Features</h3>
          <p className="mb-2">Some Platform features may reference:</p>
          <ul className="list-disc ml-5 space-y-1 mb-2">
            <li>wallet connections;</li>
            <li>blockchain addresses;</li>
            <li>smart contracts;</li>
            <li>testnet environments;</li>
            <li>on-chain claim functions;</li>
            <li>token identifiers; or</li>
            <li>public ledger activity.</li>
          </ul>
          <p className="mb-2">Unless explicitly stated otherwise in a separate written notice published by us, any such feature currently made available through the Platform is provided on a <strong>testnet, experimental, beta, development, or limited-access basis</strong>.</p>
          <div className="bg-orange-50 border border-orange-300 p-3 rounded mt-2">
            <h4 className="font-bold mb-1">Important testnet notice</h4>
            <p className="mb-2">Where a feature is labeled <strong>testnet</strong>, <strong>beta</strong>, <strong>demo</strong>, <strong>development</strong>, or similar:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>it may have <strong>no monetary value</strong>;</li>
              <li>it may be reset, wiped, disabled, delayed, or discontinued at any time;</li>
              <li>it may not correspond to any live or mainnet asset;</li>
              <li>it may not be transferable, redeemable, or exchangeable;</li>
              <li>it may contain bugs, inaccuracies, interruptions, or security vulnerabilities.</li>
            </ul>
            <p className="mt-2">Displaying a wallet address, contract address, pool size, claim status, or other blockchain-related information does <strong>not</strong> mean that any asset has present or future market value, liquidity, redemption rights, or exchangeability.</p>
          </div>
        </section>

        <section>
          <h3 className="font-bold text-black mb-2">5. No Guarantee of Value</h3>
          <p className="mb-2">We make <strong>no representation, warranty, or promise</strong> that any digital item, point, reward, balance, vault amount, token label, testnet claim, leaderboard prize, collectible, or any other feature on the Platform has:</p>
          <ul className="list-disc ml-5 space-y-1">
            <li>present value;</li>
            <li>future value;</li>
            <li>resale value;</li>
            <li>utility outside the Platform;</li>
            <li>market liquidity;</li>
            <li>exchangeability;</li>
            <li>transferability; or</li>
            <li>legal classification favorable to the user.</li>
          </ul>
          <p className="mt-2">You acknowledge that any gameplay-related reward, digital balance, or blockchain-linked item may have <strong>no value at all</strong> and may be modified or discontinued at any time.</p>
        </section>

        <section>
          <h3 className="font-bold text-black mb-2">6. Future Features</h3>
          <p className="mb-2">We may, in our sole discretion, introduce, modify, limit, suspend, or discontinue features in the future, including features involving digital collectibles, utility features, wallet-based integrations, or blockchain-based mechanics.</p>
          <p className="mb-2">If we introduce any materially different feature in the future, including any feature that changes the legal or operational nature of the Platform, we may publish supplemental rules, special terms, campaign rules, token notices, claim rules, participation criteria, or other policy documents that will apply in addition to these Terms.</p>
          <p>Nothing in these Terms obligates us to launch or maintain any future feature.</p>
        </section>

        <section>
          <h3 className="font-bold text-black mb-2">7. Gameplay, Balancing, and Progress</h3>
          <p className="mb-2">The Platform may include games, progression systems, vault systems, idle systems, multipliers, achievements, upgrades, caps, schedules, leaderboards, streaks, bonuses, prestige systems, and promotional mechanics.</p>
          <p className="mb-2">All gameplay systems are subject to change at any time, including:</p>
          <ul className="list-disc ml-5 space-y-1 mb-2">
            <li>reward rates;</li>
            <li>balancing formulas;</li>
            <li>session limits;</li>
            <li>daily or lifetime caps;</li>
            <li>claim windows;</li>
            <li>drop tables;</li>
            <li>scoring models;</li>
            <li>progression speed;</li>
            <li>offline accrual rules;</li>
            <li>eligibility criteria; and</li>
            <li>feature availability.</li>
          </ul>
          <p className="mb-2">We may, at any time and for any reason:</p>
          <ul className="list-disc ml-5 space-y-1">
            <li>rebalance the Platform;</li>
            <li>reset or adjust progress;</li>
            <li>revoke rewards;</li>
            <li>correct errors;</li>
            <li>suspend gameplay features;</li>
            <li>roll back balances;</li>
            <li>remove results affected by bugs, exploits, abuse, or irregular activity.</li>
          </ul>
          <p className="mt-2">You do not acquire ownership rights in gameplay progress merely because it appears in the interface.</p>
        </section>

        <section>
          <h3 className="font-bold text-black mb-2">8. Vault, Rewards, and Claims</h3>
          <p className="mb-2">The Platform may display a Vault, accrued amount, claimable amount, session reward, or similar reward indicator.</p>
          <p className="mb-2">Such indicators may reflect internal gameplay logic, testnet logic, promotional logic, or provisional calculations only. They do not constitute a bank balance, stored value account, deposit, wage, salary, property right, or guaranteed entitlement.</p>
          <p className="mb-2">If the Platform offers a "CLAIM" feature:</p>
          <ul className="list-disc ml-5 space-y-1">
            <li>claim availability may be limited, delayed, paused, or disabled;</li>
            <li>claims may be subject to eligibility checks, anti-abuse rules, smart contract controls, cooldowns, rate limits, and technical restrictions;</li>
            <li>claims may fail due to wallet issues, smart contract issues, network issues, user error, gas issues, front-end issues, or third-party service interruptions;</li>
            <li>claims may be revoked, reversed off-platform where permitted, or denied where abuse, error, ineligibility, or legal risk is identified.</li>
          </ul>
          <p className="mt-2">We reserve the right to determine eligibility for rewards, vaulting, testnet claiming, campaigns, or any similar feature in our sole discretion.</p>
        </section>

        <section>
          <h3 className="font-bold text-black mb-2">9. Optional Wallet Connection</h3>
          <p className="mb-2">Some features may require or allow connection to a third-party wallet. Wallet connection is optional unless explicitly required for a particular feature.</p>
          <p className="mb-2">You understand and agree that:</p>
          <ul className="list-disc ml-5 space-y-1">
            <li>wallets are provided by third parties outside our control;</li>
            <li>you are solely responsible for your wallet, device security, seed phrase, passwords, keys, backups, and approvals;</li>
            <li>blockchain transactions may be irreversible;</li>
            <li>network fees may apply;</li>
            <li>we are not responsible for phishing, wallet compromise, malware, lost keys, user mistakes, incorrect addresses, approval abuse, network congestion, failed transactions, or blockchain forks.</li>
          </ul>
          <p className="mt-2">We do not custody user funds unless explicitly stated otherwise in a separate service agreement.</p>
        </section>

        <section>
          <h3 className="font-bold text-black mb-2">10. Prohibited Conduct</h3>
          <p className="mb-2">You agree not to:</p>
          <ul className="list-disc ml-5 space-y-1">
            <li>use bots, scripts, macros, automation, emulators, or auto-clickers where prohibited;</li>
            <li>exploit bugs, vulnerabilities, timing errors, or reward logic;</li>
            <li>manipulate leaderboards, sessions, rewards, vault balances, or claim calculations;</li>
            <li>create multiple accounts to abuse campaigns or limits;</li>
            <li>impersonate another person or entity;</li>
            <li>interfere with the Platform, servers, APIs, databases, or smart contract operations;</li>
            <li>reverse engineer, decompile, scrape, copy, or extract source code, proprietary logic, or protected content except as permitted by law;</li>
            <li>use the Platform for unlawful, deceptive, abusive, fraudulent, or harmful purposes;</li>
            <li>upload malicious code, spam, or harmful content;</li>
            <li>attempt unauthorized access to accounts, wallets, data, infrastructure, or admin functions.</li>
          </ul>
          <p className="mt-2">We may investigate violations and take any action we consider appropriate, including suspension, resets, removals, permanent bans, denial of claims, revocation of rewards, reporting to authorities, and legal action.</p>
        </section>

        <section>
          <h3 className="font-bold text-black mb-2">11. Promotions, Events, Airdrops, and Campaigns</h3>
          <p className="mb-2">From time to time, we may run promotions, events, community campaigns, leaderboard prizes, whitelists, reward periods, giveaways, or airdrop-style activities.</p>
          <p className="mb-2">Unless expressly stated otherwise in official rules published by us:</p>
          <ul className="list-disc ml-5 space-y-1">
            <li>all such programs are discretionary;</li>
            <li>participation does not guarantee selection, receipt, value, or continued eligibility;</li>
            <li>we may cancel, modify, delay, or terminate any campaign at any time;</li>
            <li>additional eligibility requirements may apply;</li>
            <li>abuse, suspicious activity, duplicate participation, or technical manipulation may result in disqualification.</li>
          </ul>
          <p className="mt-2">Official campaign rules, if published, are incorporated into these Terms by reference.</p>
        </section>

        <section>
          <h3 className="font-bold text-black mb-2">12. No Financial, Legal, Tax, or Investment Advice</h3>
          <p className="mb-2">All information provided on the Platform is for general informational and entertainment purposes only.</p>
          <p className="mb-2">We do not provide:</p>
          <ul className="list-disc ml-5 space-y-1">
            <li>financial advice;</li>
            <li>investment advice;</li>
            <li>legal advice;</li>
            <li>tax advice;</li>
            <li>accounting advice; or</li>
            <li>professional advisory services.</li>
          </ul>
          <p className="mt-2">You are solely responsible for your own decisions and for obtaining independent professional advice where appropriate.</p>
        </section>

        <section>
          <h3 className="font-bold text-black mb-2">13. Third-Party Services</h3>
          <p className="mb-2">The Platform may integrate with or link to third-party services, including:</p>
          <ul className="list-disc ml-5 space-y-1">
            <li>wallet providers;</li>
            <li>blockchain networks;</li>
            <li>RPC services;</li>
            <li>hosting providers;</li>
            <li>analytics providers;</li>
            <li>cloud services;</li>
            <li>community platforms;</li>
            <li>app providers;</li>
            <li>social platforms.</li>
          </ul>
          <p className="mt-2">We do not control and are not responsible for third-party services, their uptime, policies, security, or conduct. Your use of third-party services is governed by their own terms and policies.</p>
        </section>

        <section>
          <h3 className="font-bold text-black mb-2">14. Privacy</h3>
          <p>Your use of the Platform is also subject to our <strong>Privacy Policy</strong>, which explains how we collect, use, store, and disclose personal data.</p>
          <p className="mt-2">By using the Platform, you acknowledge that we may process certain data necessary to provide the Platform, such as wallet identifiers, gameplay activity, technical logs, device/browser data, account identifiers, and support communications, in accordance with our Privacy Policy and applicable law.</p>
        </section>

        <section>
          <h3 className="font-bold text-black mb-2">15. Cookies and Similar Technologies</h3>
          <p className="mb-2">We may use cookies, local storage, session storage, SDKs, pixels, and similar technologies for functionality, security, authentication, performance, analytics, and user experience.</p>
          <p className="mb-2">Where required by applicable law, we will request consent before using non-essential cookies or similar technologies.</p>
          <p>You may be able to manage certain preferences through your browser or device settings, but disabling some technologies may affect functionality.</p>
        </section>

        <section>
          <h3 className="font-bold text-black mb-2">16. Intellectual Property</h3>
          <p className="mb-2">All content, software, design, interfaces, visual elements, text, logos, artwork, sound, video, code, game systems, trademarks, trade dress, and other materials made available through the Platform are owned by us or our licensors and are protected by applicable intellectual property laws.</p>
          <p className="mb-2">Subject to these Terms, we grant you a limited, revocable, non-exclusive, non-transferable, non-sublicensable license to access and use the Platform for personal, lawful, non-commercial use only.</p>
          <p className="mb-2">You may not, without our prior written consent:</p>
          <ul className="list-disc ml-5 space-y-1">
            <li>reproduce, distribute, modify, publish, transmit, perform, display, sell, license, or exploit Platform content;</li>
            <li>create derivative works;</li>
            <li>remove proprietary notices;</li>
            <li>use our marks, brand elements, or materials in a misleading way.</li>
          </ul>
        </section>

        <section>
          <h3 className="font-bold text-black mb-2">17. User Content and Feedback</h3>
          <p>If you submit content, feedback, suggestions, bug reports, ideas, or other materials to us, you grant us a worldwide, non-exclusive, royalty-free, perpetual, irrevocable, sublicensable license to use, reproduce, modify, adapt, publish, translate, distribute, and otherwise exploit such materials for the operation, improvement, marketing, and development of the Platform, subject to applicable law and our Privacy Policy.</p>
          <p className="mt-2">You represent that you have the necessary rights to submit such materials.</p>
        </section>

        <section>
          <h3 className="font-bold text-black mb-2">18. Suspension and Termination</h3>
          <p className="mb-2">We may, in our sole discretion and with or without notice:</p>
          <ul className="list-disc ml-5 space-y-1 mb-2">
            <li>suspend or restrict your access;</li>
            <li>terminate your access;</li>
            <li>disable wallet-related features for your account;</li>
            <li>revoke rewards or balances;</li>
            <li>remove data or content;</li>
            <li>block claims or gameplay participation.</li>
          </ul>
          <p className="mb-2">We may do so for any reason, including legal risk, security concerns, technical abuse, inactivity, policy violations, fraud prevention, or operational needs.</p>
          <p>Upon termination, your right to use the Platform ends immediately.</p>
        </section>

        <section>
          <h3 className="font-bold text-black mb-2">19. Availability and Technical Risks</h3>
          <p className="mb-2">The Platform is provided on an <strong>"AS IS"</strong> and <strong>"AS AVAILABLE"</strong> basis.</p>
          <p className="mb-2">We do not guarantee that the Platform will be:</p>
          <ul className="list-disc ml-5 space-y-1 mb-2">
            <li>uninterrupted;</li>
            <li>secure;</li>
            <li>error-free;</li>
            <li>accurate;</li>
            <li>complete;</li>
            <li>compatible with your device;</li>
            <li>free of bugs, malware, or vulnerabilities;</li>
            <li>continuously available.</li>
          </ul>
          <p>The Platform may be affected by maintenance, outages, software defects, smart contract issues, infrastructure failures, cyberattacks, wallet issues, blockchain congestion, RPC failures, forks, reorgs, validator issues, data corruption, or force majeure events.</p>
        </section>

        <section>
          <h3 className="font-bold text-black mb-2">20. Disclaimer of Warranties</h3>
          <p className="mb-2">To the maximum extent permitted by law, we disclaim all warranties of any kind, whether express, implied, statutory, or otherwise, including warranties of:</p>
          <ul className="list-disc ml-5 space-y-1 mb-2">
            <li>merchantability;</li>
            <li>fitness for a particular purpose;</li>
            <li>title;</li>
            <li>non-infringement;</li>
            <li>uninterrupted access;</li>
            <li>accuracy;</li>
            <li>reliability;</li>
            <li>availability.</li>
          </ul>
          <p>We do not warrant that any reward, token label, testnet functionality, digital item, or blockchain-related feature will have any value, utility, legality, or future existence.</p>
        </section>

        <section>
          <h3 className="font-bold text-black mb-2">21. Limitation of Liability</h3>
          <p className="mb-2">To the maximum extent permitted by law, neither we nor our affiliates, owners, directors, officers, employees, contractors, licensors, service providers, or agents shall be liable for any indirect, incidental, special, consequential, punitive, or exemplary damages, including damages for:</p>
          <ul className="list-disc ml-5 space-y-1 mb-2">
            <li>lost profits;</li>
            <li>lost revenue;</li>
            <li>lost opportunity;</li>
            <li>loss of data;</li>
            <li>loss of goodwill;</li>
            <li>business interruption;</li>
            <li>device damage;</li>
            <li>digital asset loss;</li>
            <li>transaction failure;</li>
            <li>smart contract failure;</li>
            <li>claim failure;</li>
            <li>platform downtime;</li>
            <li>security breach;</li>
            <li>emotional distress.</li>
          </ul>
          <p className="mb-2">To the maximum extent permitted by law, our total aggregate liability arising out of or relating to the Platform or these Terms shall not exceed the greater of:</p>
          <ul className="list-disc ml-5 space-y-1 mb-2">
            <li><strong>USD $100</strong>, or</li>
            <li>the amount, if any, that you paid directly to us for use of the Platform in the <strong>12 months</strong> preceding the event giving rise to the claim.</li>
          </ul>
          <p>Some jurisdictions do not allow certain limitations, so parts of this section may not apply to you.</p>
        </section>

        <section>
          <h3 className="font-bold text-black mb-2">22. Indemnification</h3>
          <p className="mb-2">You agree to defend, indemnify, and hold harmless us and our affiliates, owners, officers, directors, employees, contractors, licensors, and service providers from and against any claims, liabilities, damages, judgments, awards, losses, costs, and expenses, including reasonable legal fees, arising out of or related to:</p>
          <ul className="list-disc ml-5 space-y-1">
            <li>your use or misuse of the Platform;</li>
            <li>your violation of these Terms;</li>
            <li>your violation of applicable law;</li>
            <li>your violation of any third-party rights;</li>
            <li>your fraud, abuse, or misconduct;</li>
            <li>your content, submissions, or communications;</li>
            <li>disputes between you and another user.</li>
          </ul>
        </section>

        <section>
          <h3 className="font-bold text-black mb-2">23. Compliance with Laws and Sanctions</h3>
          <p className="mb-2">You represent and warrant that:</p>
          <ul className="list-disc ml-5 space-y-1">
            <li>you are not subject to sanctions or trade restrictions that prohibit your use of the Platform;</li>
            <li>you will comply with all laws applicable to your use of the Platform;</li>
            <li>you will not use the Platform in connection with unlawful conduct, fraud, money laundering, sanctions evasion, or prohibited activity.</li>
          </ul>
          <p className="mt-2">We may restrict access where necessary for legal or compliance reasons.</p>
        </section>

        <section>
          <h3 className="font-bold text-black mb-2">24. Changes to the Platform and These Terms</h3>
          <p className="mb-2">We may update these Terms from time to time.</p>
          <p className="mb-2">If we make material changes, we may post the updated Terms on the Platform and update the "Last Updated" date. Your continued use of the Platform after the updated Terms become effective constitutes your acceptance of the revised Terms.</p>
          <p>We may also modify, suspend, or discontinue any part of the Platform at any time.</p>
        </section>

        <section>
          <h3 className="font-bold text-black mb-2">25. Governing Law</h3>
          <p>These Terms and any dispute arising out of or relating to them or the Platform shall be governed by the laws of <strong>[Insert Jurisdiction]</strong>, without regard to conflict of law principles.</p>
        </section>

        <section>
          <h3 className="font-bold text-black mb-2">26. Dispute Resolution</h3>
          <p className="mb-2">Any dispute, claim, or controversy arising out of or relating to these Terms or the Platform shall be resolved as follows:</p>
          <ul className="list-disc ml-5 space-y-1 mb-2">
            <li>first, the parties will attempt in good faith to resolve the dispute informally;</li>
            <li>if informal resolution is unsuccessful, the dispute shall be resolved by <strong>binding arbitration</strong> in <strong>[Insert Location]</strong> under the rules of <strong>[Insert Arbitration Rules]</strong>, unless applicable law requires otherwise;</li>
            <li>if arbitration is unenforceable or unavailable, the dispute shall be brought exclusively in the courts located in <strong>[Insert Jurisdiction / Venue]</strong>.</li>
          </ul>
          <p>To the extent permitted by law, you agree that disputes will be resolved only on an individual basis and not as part of any class, consolidated, or representative action.</p>
        </section>

        <section>
          <h3 className="font-bold text-black mb-2">27. International Use</h3>
          <p>The Platform may not be appropriate, available, or lawful for use in all locations. We make no representation that the Platform is lawful in any specific jurisdiction. Users who access the Platform do so at their own initiative and are responsible for compliance with local laws.</p>
        </section>

        <section>
          <h3 className="font-bold text-black mb-2">28. Severability</h3>
          <p>If any provision of these Terms is held invalid, illegal, or unenforceable, the remaining provisions will remain in full force and effect to the maximum extent permitted by law.</p>
        </section>

        <section>
          <h3 className="font-bold text-black mb-2">29. No Waiver</h3>
          <p>Our failure to enforce any provision of these Terms shall not constitute a waiver of that provision or any other provision.</p>
        </section>

        <section>
          <h3 className="font-bold text-black mb-2">30. Entire Agreement</h3>
          <p>These Terms, together with our Privacy Policy, Cookie Notice, and any supplemental rules or campaign terms that we publish, constitute the entire agreement between you and us regarding the Platform and supersede prior understandings relating to the same subject matter.</p>
        </section>

        <section>
          <h3 className="font-bold text-black mb-2">31. Contact</h3>
          <p className="mb-2">For legal notices, support, privacy requests, copyright complaints, or questions about these Terms, contact us at:</p>
          <ul className="list-none ml-5 space-y-1">
            <li><strong>Email:</strong> [Insert Contact Email]</li>
            <li><strong>Company / Brand Name:</strong> [Insert Name]</li>
            <li><strong>Address:</strong> [Insert Address, if applicable]</li>
          </ul>
        </section>

        <section className="bg-blue-50 border-2 border-blue-400 p-4 rounded-lg">
          <h3 className="font-bold text-black mb-2">32. Acknowledgment</h3>
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
  const [policyModal, setPolicyModal] = useState(null); // 'terms', 'privacy', 'cookies', 'risk', or null
  const [poolModalOpen, setPoolModalOpen] = useState(false);
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
  const questCard = lang === "he"
    ? {
        title: "MLEO — BASE",
        desc: "בסיס ניהול תומך שמחבר בין Miners, Arcade וה-Vault המשותף עם משימות, DATA, משלחות ושדרוגי בסיס.",
        descShort: "בסיס תומך: משימות, DATA ומשלחות ל-Vault המשותף.",
        badge: "Support",
        play: "שחק MLEO BASE",
        hub: "שני מצבים, Vault אחד. שחק באופן פעיל ב-Miners, או נהל את MLEO BASE כדי להזין ולשפר את ה-Vault המשותף.",
        hubShort: "ארבעה מצבים, Vault אחד. בחר איפה לשחק.",
      }
    : {
        title: "MLEO — BASE",
        desc: "A support-management base that links Miners, Arcade and the shared vault with missions, DATA, expeditions and structural upgrades.",
        descShort: "Support hub: missions, DATA & expeditions for the shared vault.",
        badge: "Support",
        play: "Play MLEO BASE",
        hub: "Two modes, one Vault. Play actively with Miners or run MLEO BASE to feed and upgrade the shared vault ecosystem.",
        hubShort: "Four modes, one Vault. Pick where to play.",
      };

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
        <div className="relative z-10 container mx-auto px-3 py-4 md:px-4 md:py-8">
          <div className="max-w-4xl mx-auto">
            {/* Navigation */}
            <div className="flex items-center justify-between mb-3 md:mb-6">
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

            {/* Mobile: compact 2×2 mode lobby (md and below) */}
            <div className="md:hidden flex flex-col gap-2 min-h-[calc(100dvh-7rem)] max-h-[calc(100dvh-7rem)]">
              <header className="text-center shrink-0 px-0.5 pt-0.5">
                <span className="text-emerald-400 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-400/10 border border-emerald-400/20 inline-block leading-tight">
                  {text.liveTestnet}
                </span>
                <h1 className="text-xl font-extrabold tracking-tight mt-2 leading-snug">
                  {text.chooseGame}
                </h1>
                <p className="text-zinc-400 text-xs mt-1.5 leading-snug line-clamp-2 mx-auto max-w-sm">
                  {questCard.hubShort || text.chooseGameLobbyShort || questCard.hub}
                </p>
              </header>

              <div className="flex-1 min-h-0 flex flex-col justify-center py-2">
              <section className="grid grid-cols-2 gap-2 w-full shrink-0">
                <article className="rounded-xl border border-white/12 bg-black/45 backdrop-blur-sm p-2 flex flex-col min-h-[152px] shadow-md">
                  <div className="flex items-start justify-between gap-1">
                    <h2 className="text-[11px] font-extrabold leading-tight line-clamp-2 text-left">{text.miners}</h2>
                    <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      {text.active}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-1 leading-snug line-clamp-3 flex-1">
                    {text.minersDescShort || text.minersDesc}
                  </p>
                  <div className="mt-auto pt-1 flex flex-col gap-1">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => open("miners-how")}
                        className="flex-1 bg-blue-600/25 hover:bg-blue-600/35 text-blue-200 px-1 py-1 rounded-md text-[9px] font-bold border border-blue-500/35 leading-tight"
                      >
                        {text.howToPlay}
                      </button>
                      <button
                        type="button"
                        onClick={() => open("terms")}
                        className="flex-1 bg-white/10 hover:bg-white/15 text-zinc-200 px-1 py-1 rounded-md text-[9px] font-bold border border-white/15 leading-tight"
                      >
                        {text.terms}
                      </button>
                    </div>
                    <Link href="/mleo-miners" className="block">
                      <span className="flex w-full items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-lg text-[11px] font-bold active:opacity-90">
                        {text.playMiners}
                      </span>
                    </Link>
                  </div>
                </article>

                <article className="rounded-xl border border-white/12 bg-black/45 backdrop-blur-sm p-2 flex flex-col min-h-[152px] shadow-md">
                  <div className="flex items-start justify-between gap-1">
                    <h2 className="text-[11px] font-extrabold leading-tight line-clamp-2 text-left">{questCard.title}</h2>
                    <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold bg-orange-500/15 text-orange-300 border border-orange-500/30">
                      {questCard.badge}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-1 leading-snug line-clamp-3 flex-1">
                    {questCard.descShort || questCard.desc}
                  </p>
                  <div className="mt-auto pt-1 flex flex-col gap-1">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => open("quest-how")}
                        className="flex-1 bg-blue-600/25 hover:bg-blue-600/35 text-blue-200 px-1 py-1 rounded-md text-[9px] font-bold border border-blue-500/35 leading-tight"
                      >
                        {text.howToPlay}
                      </button>
                      <button
                        type="button"
                        onClick={() => open("terms")}
                        className="flex-1 bg-white/10 hover:bg-white/15 text-zinc-200 px-1 py-1 rounded-md text-[9px] font-bold border border-white/15 leading-tight"
                      >
                        {text.terms}
                      </button>
                    </div>
                    <Link href="/mleo-base" className="block">
                      <span className="flex w-full items-center justify-center bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white py-2 rounded-lg text-[11px] font-bold shadow-md active:opacity-90">
                        {questCard.play}
                      </span>
                    </Link>
                  </div>
                </article>

                <article className="rounded-xl border border-purple-500/35 bg-gradient-to-br from-purple-900/35 to-indigo-900/25 backdrop-blur-sm p-2 flex flex-col min-h-[152px] shadow-md">
                  <div className="flex items-start justify-between gap-1">
                    <h2 className="text-[11px] font-extrabold leading-tight line-clamp-2 text-left">
                      {text.arcadeRegularTitle || "MLEO — Arcade"}
                    </h2>
                    <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold bg-purple-500/25 text-purple-200 border border-purple-500/40">
                      {text.arcadeBadgeLabel || "Arcade"}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-300 mt-1 leading-snug line-clamp-3 flex-1">
                    {text.arcadeDescShort || "Solo mini-games. Shared vault & session rewards."}
                  </p>
                  <div className="mt-auto pt-1 flex flex-col gap-1">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => open("arcade-how")}
                        className="flex-1 bg-blue-600/25 hover:bg-blue-600/35 text-blue-200 px-1 py-1 rounded-md text-[9px] font-bold border border-blue-500/35 leading-tight"
                      >
                        {text.howToPlay}
                      </button>
                      <button
                        type="button"
                        onClick={() => open("terms")}
                        className="flex-1 bg-white/10 hover:bg-white/15 text-zinc-200 px-1 py-1 rounded-md text-[9px] font-bold border border-white/15 leading-tight"
                      >
                        {text.terms}
                      </button>
                    </div>
                    <Link href="/arcade" className="block">
                      <span className="flex w-full items-center justify-center bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white py-2 rounded-lg text-[11px] font-bold shadow-md active:opacity-90">
                        {text.arcadeGames || "Arcade Games"}
                      </span>
                    </Link>
                  </div>
                </article>

                <article className="rounded-xl border border-pink-500/35 bg-gradient-to-br from-red-900/30 to-pink-900/20 backdrop-blur-sm p-2 flex flex-col min-h-[152px] shadow-md">
                  <div className="flex items-start justify-between gap-1">
                    <h2 className="text-[11px] font-extrabold leading-tight line-clamp-2 text-left">
                      {text.arcadeOnlineTitle || "MLEO — Arcade Online"}
                    </h2>
                    <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold bg-pink-500/20 text-pink-200 border border-pink-500/35">
                      {text.onlineBadgeLabel || "Online"}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-300 mt-1 leading-snug line-clamp-3 flex-1">
                    {text.arcadeOnlineDescShort || "Multiplayer & live modes. Same shared vault."}
                  </p>
                  <div className="mt-auto pt-1 flex flex-col gap-1">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => open("arcade-online-how")}
                        className="flex-1 bg-blue-600/25 hover:bg-blue-600/35 text-blue-200 px-1 py-1 rounded-md text-[9px] font-bold border border-blue-500/35 leading-tight"
                      >
                        {text.howToPlay}
                      </button>
                      <button
                        type="button"
                        onClick={() => open("terms")}
                        className="flex-1 bg-white/10 hover:bg-white/15 text-zinc-200 px-1 py-1 rounded-md text-[9px] font-bold border border-white/15 leading-tight"
                      >
                        {text.terms}
                      </button>
                    </div>
                    <Link href="/arcade-online" className="block">
                      <span className="flex w-full items-center justify-center bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white py-2 rounded-lg text-[11px] font-bold shadow-md active:opacity-90">
                        {text.arcadeOnline || "Arcade Online"}
                      </span>
                    </Link>
                  </div>
                </article>
              </section>
              </div>

              <footer className="shrink-0 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 pt-2 border-t border-white/10 text-[10px] text-white/55 leading-tight">
                <span>© {new Date().getFullYear()} MLEO</span>
                <button type="button" onClick={() => setPoolModalOpen(true)} className="underline hover:text-white/90">
                  {text.poolStatus || "Pool"}
                </button>
                <Link href="/" className="underline hover:text-white/90">Home</Link>
                <button type="button" onClick={() => setPolicyModal("terms")} className="underline hover:text-white/90">
                  {text.legalShort || "Legal"}
                </button>
                <button type="button" onClick={() => setPolicyModal("privacy")} className="underline hover:text-white/90">
                  Privacy
                </button>
                <button type="button" onClick={() => setPolicyModal("cookies")} className="underline hover:text-white/90">
                  Cookies
                </button>
                <button type="button" onClick={() => setPolicyModal("risk")} className="underline hover:text-white/90">
                  Risk
                </button>
              </footer>
            </div>

            {/* Tablet / desktop: existing 3-column hub */}
            <div className="hidden md:block">
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
                  {questCard.hub}
                </p>
              </header>

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

                {/* BASE */}
                <article className="rounded-2xl border border-white/10 bg-black/5 backdrop-blur-md shadow-xl p-6 flex flex-col w-full max-w-[350px] min-h-[320px]">
                  <div className="grid grid-cols-[1fr_auto] gap-2 items-start">
                    <div>
                      <h2 className="text-[20px] sm:text-2xl font-extrabold">{questCard.title}</h2>
                      <p className="text-[13px] sm:text-sm text-zinc-300 mt-2 leading-6 break-words hyphens-auto">
                        {questCard.desc}
                      </p>
                    </div>
                    <span className="rounded-full px-2 py-1 text-xs font-bold bg-orange-500/15 text-orange-300 border border-orange-500/30">
                      {questCard.badge}
                    </span>
                  </div>

                  <div className="mt-auto">
                    <div className="flex flex-wrap gap-2 mb-3 justify-center">
                      <button
                        onClick={() => open("quest-how")}
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

                    <div className="grid grid-cols-1 gap-2">
                      <Link href="/mleo-base">
                        <button className="w-full bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white px-4 py-3 rounded-xl font-bold text-sm transition-colors shadow-lg">
                          BASE
                        </button>
                      </Link>
                    </div>
                  </div>
                </article>

                {/* ARCADE (solo + online entry) */}
                <article className="rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-900/20 to-indigo-900/20 backdrop-blur-md shadow-xl p-6 flex flex-col w-full max-w-[350px] min-h-[320px]">
                  <div className="grid grid-cols-[1fr_auto] gap-2 items-start">
                    <div>
                      <h2 className="text-[20px] sm:text-2xl font-extrabold">🎮 MLEO Arcade</h2>
                      <p className="text-[13px] sm:text-sm text-zinc-300 mt-2 leading-6 break-words hyphens-auto">
                        Mini-games arcade! Play Symbol Match, Dice, Wheel & Scratch cards. 100 MLEO per session with rewards up to 10,000 MLEO!
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

              <div className="mb-8 max-w-4xl mx-auto">
                <GamePoolStats />
              </div>

              <footer className="mt-8 pt-6 border-t border-white/10 text-xs text-white/50">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-6 justify-between">
                  <div>© {new Date().getFullYear()} MLEO. All rights reserved.</div>
                  <div className="flex flex-wrap gap-4">
                    <Link href="/" className="hover:text-white/80">Home</Link>
                    <button onClick={() => setPolicyModal("terms")} className="hover:text-white/80">{text.terms}</button>
                    <button onClick={() => setPolicyModal("privacy")} className="hover:text-white/80">Privacy</button>
                    <button onClick={() => setPolicyModal("cookies")} className="hover:text-white/80">Cookies</button>
                    <button onClick={() => setPolicyModal("risk")} className="hover:text-white/80">Risk</button>
                  </div>
                </div>
              </footer>
            </div>

          </div>
        </div>
      </div>

      {/* Modals */}
      <Modal isOpen={modal === "miners-how"} onClose={close}>
        <HowToPlay lang={lang} onClose={close} />
        </Modal>

      <Modal isOpen={modal === "quest-how"} onClose={close}>
        <HowToPlay lang={lang} onClose={close} gameType="quest" />
        </Modal>

      <Modal isOpen={modal === "arcade-how"} onClose={close}>
        <HowToPlay lang={lang} onClose={close} gameType="arcade" />
        </Modal>

      <Modal isOpen={modal === "arcade-online-how"} onClose={close}>
        <HowToPlay lang={lang} onClose={close} gameType="arcade-online" />
      </Modal>

      <Modal isOpen={poolModalOpen} onClose={() => setPoolModalOpen(false)} maxWidth="2xl">
        <div className="rounded-xl bg-zinc-900 p-2 -m-1">
          <p className="text-center text-sm font-bold text-white/90 mb-2">{text.poolStatus || "Pool"}</p>
          <GamePoolStats />
        </div>
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

      {/* Policy Modals */}
      {policyModal === 'terms' && (
        <PolicyModal isOpen={true} onClose={() => setPolicyModal(null)} title="Terms & Conditions">
          <div className="prose prose-invert max-w-none">
            <p className="text-xs text-gray-400 mb-4">Last Updated: [Insert Date]</p>
            <div className="bg-white text-black rounded-lg p-6 md:p-8 space-y-4 text-sm">
              <section>
                <p className="mb-4">Welcome to the MLEO game platform (the "<strong>Platform</strong>", "<strong>we</strong>", "<strong>us</strong>", or "<strong>our</strong>"). These Terms & Conditions ("<strong>Terms</strong>") govern your access to and use of the Platform, including our websites, games, applications, features, wallet-related integrations, testnet functionality, community features, promotional campaigns, and any related services.</p>
                <p className="mb-4">By accessing or using the Platform, you confirm that you have read, understood, and agreed to these Terms. If you do not agree, do not access or use the Platform.</p>
              </section>
              <section>
                <h3 className="font-bold text-black mb-2">1. Eligibility</h3>
                <p className="mb-2">You may use the Platform only if:</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>you are at least <strong>18 years old</strong>, or the age of legal majority in your jurisdiction, whichever is higher;</li>
                  <li>you have the legal capacity to enter into a binding agreement;</li>
                  <li>your use of the Platform is not prohibited by applicable law in your location; and</li>
                  <li>you are not accessing the Platform from a jurisdiction where the Platform, digital assets, online games, or related services are restricted or prohibited.</li>
                </ul>
                <p className="mt-2">You are solely responsible for ensuring that your use of the Platform is lawful in your jurisdiction.</p>
              </section>

              <section className="bg-yellow-50 border-2 border-yellow-400 p-4 rounded-lg">
                <h3 className="font-bold text-black mb-2">2. Entertainment Platform Only</h3>
                <p className="mb-2">The Platform is designed for <strong>entertainment, gameplay, community participation, and digital interactive experiences</strong>.</p>
                <p className="mb-2">The Platform is <strong>not</strong> intended to operate as:</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>a casino;</li>
                  <li>a gambling or betting service;</li>
                  <li>a real-money gaming platform;</li>
                  <li>a financial service;</li>
                  <li>an exchange, broker, investment platform, or securities offering; or</li>
                  <li>a provider of legal, tax, accounting, or investment advice.</li>
                </ul>
                <p className="mt-2">Nothing on the Platform should be interpreted as an invitation to gamble, place bets, make financial decisions, or expect profits.</p>
              </section>

              <section className="bg-red-50 border-2 border-red-400 p-4 rounded-lg">
                <h3 className="font-bold text-black mb-2">3. No Deposits, No Purchase of In-Game Balances</h3>
                <p className="mb-2"><strong>At this time</strong>, the Platform does <strong>not</strong> allow users to deposit fiat currency, cryptocurrency, or any other asset in order to participate in gameplay or obtain in-game balances for gameplay purposes.</p>
                <p className="mb-2"><strong>At this time</strong>, users cannot purchase in-game game balances with money or cryptocurrency for gameplay use on the Platform.</p>
                <p>Any balances, points, rewards, vault amounts, or gameplay progress shown inside the Platform are subject to the rules of the Platform and may exist solely as part of the entertainment experience, test environment, reward mechanics, or technical platform functionality.</p>
              </section>

              <section>
                <h3 className="font-bold text-black mb-2">4. Testnet, Wallet, and Blockchain Features</h3>
                <p className="mb-2">Some Platform features may reference:</p>
                <ul className="list-disc ml-5 space-y-1 mb-2">
                  <li>wallet connections;</li>
                  <li>blockchain addresses;</li>
                  <li>smart contracts;</li>
                  <li>testnet environments;</li>
                  <li>on-chain claim functions;</li>
                  <li>token identifiers; or</li>
                  <li>public ledger activity.</li>
                </ul>
                <p className="mb-2">Unless explicitly stated otherwise in a separate written notice published by us, any such feature currently made available through the Platform is provided on a <strong>testnet, experimental, beta, development, or limited-access basis</strong>.</p>
                <div className="bg-orange-50 border border-orange-300 p-3 rounded mt-2">
                  <h4 className="font-bold mb-1">Important testnet notice</h4>
                  <p className="mb-2">Where a feature is labeled <strong>testnet</strong>, <strong>beta</strong>, <strong>demo</strong>, <strong>development</strong>, or similar:</p>
                  <ul className="list-disc ml-5 space-y-1">
                    <li>it may have <strong>no monetary value</strong>;</li>
                    <li>it may be reset, wiped, disabled, delayed, or discontinued at any time;</li>
                    <li>it may not correspond to any live or mainnet asset;</li>
                    <li>it may not be transferable, redeemable, or exchangeable;</li>
                    <li>it may contain bugs, inaccuracies, interruptions, or security vulnerabilities.</li>
                  </ul>
                  <p className="mt-2">Displaying a wallet address, contract address, pool size, claim status, or other blockchain-related information does <strong>not</strong> mean that any asset has present or future market value, liquidity, redemption rights, or exchangeability.</p>
                </div>
              </section>

              <section>
                <h3 className="font-bold text-black mb-2">5. No Guarantee of Value</h3>
                <p className="mb-2">We make <strong>no representation, warranty, or promise</strong> that any digital item, point, reward, balance, vault amount, token label, testnet claim, leaderboard prize, collectible, or any other feature on the Platform has:</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>present value;</li>
                  <li>future value;</li>
                  <li>resale value;</li>
                  <li>utility outside the Platform;</li>
                  <li>market liquidity;</li>
                  <li>exchangeability;</li>
                  <li>transferability; or</li>
                  <li>legal classification favorable to the user.</li>
                </ul>
                <p className="mt-2">You acknowledge that any gameplay-related reward, digital balance, or blockchain-linked item may have <strong>no value at all</strong> and may be modified or discontinued at any time.</p>
              </section>

              <section>
                <h3 className="font-bold text-black mb-2">6. Future Features</h3>
                <p className="mb-2">We may, in our sole discretion, introduce, modify, limit, suspend, or discontinue features in the future, including features involving digital collectibles, utility features, wallet-based integrations, or blockchain-based mechanics.</p>
                <p className="mb-2">If we introduce any materially different feature in the future, including any feature that changes the legal or operational nature of the Platform, we may publish supplemental rules, special terms, campaign rules, token notices, claim rules, participation criteria, or other policy documents that will apply in addition to these Terms.</p>
                <p>Nothing in these Terms obligates us to launch or maintain any future feature.</p>
              </section>

              <section>
                <h3 className="font-bold text-black mb-2">7. Gameplay, Balancing, and Progress</h3>
                <p className="mb-2">The Platform may include games, progression systems, vault systems, idle systems, multipliers, achievements, upgrades, caps, schedules, leaderboards, streaks, bonuses, prestige systems, and promotional mechanics.</p>
                <p className="mb-2">All gameplay systems are subject to change at any time, including:</p>
                <ul className="list-disc ml-5 space-y-1 mb-2">
                  <li>reward rates;</li>
                  <li>balancing formulas;</li>
                  <li>session limits;</li>
                  <li>daily or lifetime caps;</li>
                  <li>claim windows;</li>
                  <li>drop tables;</li>
                  <li>scoring models;</li>
                  <li>progression speed;</li>
                  <li>offline accrual rules;</li>
                  <li>eligibility criteria; and</li>
                  <li>feature availability.</li>
                </ul>
                <p className="mb-2">We may, at any time and for any reason:</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>rebalance the Platform;</li>
                  <li>reset or adjust progress;</li>
                  <li>revoke rewards;</li>
                  <li>correct errors;</li>
                  <li>suspend gameplay features;</li>
                  <li>roll back balances;</li>
                  <li>remove results affected by bugs, exploits, abuse, or irregular activity.</li>
                </ul>
                <p className="mt-2">You do not acquire ownership rights in gameplay progress merely because it appears in the interface.</p>
              </section>

              <section>
                <h3 className="font-bold text-black mb-2">8. Vault, Rewards, and Claims</h3>
                <p className="mb-2">The Platform may display a Vault, accrued amount, claimable amount, session reward, or similar reward indicator.</p>
                <p className="mb-2">Such indicators may reflect internal gameplay logic, testnet logic, promotional logic, or provisional calculations only. They do not constitute a bank balance, stored value account, deposit, wage, salary, property right, or guaranteed entitlement.</p>
                <p className="mb-2">If the Platform offers a "CLAIM" feature:</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>claim availability may be limited, delayed, paused, or disabled;</li>
                  <li>claims may be subject to eligibility checks, anti-abuse rules, smart contract controls, cooldowns, rate limits, and technical restrictions;</li>
                  <li>claims may fail due to wallet issues, smart contract issues, network issues, user error, gas issues, front-end issues, or third-party service interruptions;</li>
                  <li>claims may be revoked, reversed off-platform where permitted, or denied where abuse, error, ineligibility, or legal risk is identified.</li>
                </ul>
                <p className="mt-2">We reserve the right to determine eligibility for rewards, vaulting, testnet claiming, campaigns, or any similar feature in our sole discretion.</p>
              </section>

              <section>
                <h3 className="font-bold text-black mb-2">9. Optional Wallet Connection</h3>
                <p className="mb-2">Some features may require or allow connection to a third-party wallet. Wallet connection is optional unless explicitly required for a particular feature.</p>
                <p className="mb-2">You understand and agree that:</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>wallets are provided by third parties outside our control;</li>
                  <li>you are solely responsible for your wallet, device security, seed phrase, passwords, keys, backups, and approvals;</li>
                  <li>blockchain transactions may be irreversible;</li>
                  <li>network fees may apply;</li>
                  <li>we are not responsible for phishing, wallet compromise, malware, lost keys, user mistakes, incorrect addresses, approval abuse, network congestion, failed transactions, or blockchain forks.</li>
                </ul>
                <p className="mt-2">We do not custody user funds unless explicitly stated otherwise in a separate service agreement.</p>
              </section>

              <section>
                <h3 className="font-bold text-black mb-2">10. Prohibited Conduct</h3>
                <p className="mb-2">You agree not to:</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>use bots, scripts, macros, automation, emulators, or auto-clickers where prohibited;</li>
                  <li>exploit bugs, vulnerabilities, timing errors, or reward logic;</li>
                  <li>manipulate leaderboards, sessions, rewards, vault balances, or claim calculations;</li>
                  <li>create multiple accounts to abuse campaigns or limits;</li>
                  <li>impersonate another person or entity;</li>
                  <li>interfere with the Platform, servers, APIs, databases, or smart contract operations;</li>
                  <li>reverse engineer, decompile, scrape, copy, or extract source code, proprietary logic, or protected content except as permitted by law;</li>
                  <li>use the Platform for unlawful, deceptive, abusive, fraudulent, or harmful purposes;</li>
                  <li>upload malicious code, spam, or harmful content;</li>
                  <li>attempt unauthorized access to accounts, wallets, data, infrastructure, or admin functions.</li>
                </ul>
                <p className="mt-2">We may investigate violations and take any action we consider appropriate, including suspension, resets, removals, permanent bans, denial of claims, revocation of rewards, reporting to authorities, and legal action.</p>
              </section>

              <section>
                <h3 className="font-bold text-black mb-2">11. Promotions, Events, Airdrops, and Campaigns</h3>
                <p className="mb-2">From time to time, we may run promotions, events, community campaigns, leaderboard prizes, whitelists, reward periods, giveaways, or airdrop-style activities.</p>
                <p className="mb-2">Unless expressly stated otherwise in official rules published by us:</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>all such programs are discretionary;</li>
                  <li>participation does not guarantee selection, receipt, value, or continued eligibility;</li>
                  <li>we may cancel, modify, delay, or terminate any campaign at any time;</li>
                  <li>additional eligibility requirements may apply;</li>
                  <li>abuse, suspicious activity, duplicate participation, or technical manipulation may result in disqualification.</li>
                </ul>
                <p className="mt-2">Official campaign rules, if published, are incorporated into these Terms by reference.</p>
              </section>

              <section>
                <h3 className="font-bold text-black mb-2">12. No Financial, Legal, Tax, or Investment Advice</h3>
                <p className="mb-2">All information provided on the Platform is for general informational and entertainment purposes only.</p>
                <p className="mb-2">We do not provide:</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>financial advice;</li>
                  <li>investment advice;</li>
                  <li>legal advice;</li>
                  <li>tax advice;</li>
                  <li>accounting advice; or</li>
                  <li>professional advisory services.</li>
                </ul>
                <p className="mt-2">You are solely responsible for your own decisions and for obtaining independent professional advice where appropriate.</p>
              </section>

              <section>
                <h3 className="font-bold text-black mb-2">13. Third-Party Services</h3>
                <p className="mb-2">The Platform may integrate with or link to third-party services, including:</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>wallet providers;</li>
                  <li>blockchain networks;</li>
                  <li>RPC services;</li>
                  <li>hosting providers;</li>
                  <li>analytics providers;</li>
                  <li>cloud services;</li>
                  <li>community platforms;</li>
                  <li>app providers;</li>
                  <li>social platforms.</li>
                </ul>
                <p className="mt-2">We do not control and are not responsible for third-party services, their uptime, policies, security, or conduct. Your use of third-party services is governed by their own terms and policies.</p>
              </section>

              <section>
                <h3 className="font-bold text-black mb-2">14. Privacy</h3>
                <p>Your use of the Platform is also subject to our <strong>Privacy Policy</strong>, which explains how we collect, use, store, and disclose personal data.</p>
                <p className="mt-2">By using the Platform, you acknowledge that we may process certain data necessary to provide the Platform, such as wallet identifiers, gameplay activity, technical logs, device/browser data, account identifiers, and support communications, in accordance with our Privacy Policy and applicable law.</p>
              </section>

              <section>
                <h3 className="font-bold text-black mb-2">15. Cookies and Similar Technologies</h3>
                <p className="mb-2">We may use cookies, local storage, session storage, SDKs, pixels, and similar technologies for functionality, security, authentication, performance, analytics, and user experience.</p>
                <p className="mb-2">Where required by applicable law, we will request consent before using non-essential cookies or similar technologies.</p>
                <p>You may be able to manage certain preferences through your browser or device settings, but disabling some technologies may affect functionality.</p>
              </section>

              <section>
                <h3 className="font-bold text-black mb-2">16. Intellectual Property</h3>
                <p className="mb-2">All content, software, design, interfaces, visual elements, text, logos, artwork, sound, video, code, game systems, trademarks, trade dress, and other materials made available through the Platform are owned by us or our licensors and are protected by applicable intellectual property laws.</p>
                <p className="mb-2">Subject to these Terms, we grant you a limited, revocable, non-exclusive, non-transferable, non-sublicensable license to access and use the Platform for personal, lawful, non-commercial use only.</p>
                <p className="mb-2">You may not, without our prior written consent:</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>reproduce, distribute, modify, publish, transmit, perform, display, sell, license, or exploit Platform content;</li>
                  <li>create derivative works;</li>
                  <li>remove proprietary notices;</li>
                  <li>use our marks, brand elements, or materials in a misleading way.</li>
                </ul>
              </section>

              <section>
                <h3 className="font-bold text-black mb-2">17. User Content and Feedback</h3>
                <p>If you submit content, feedback, suggestions, bug reports, ideas, or other materials to us, you grant us a worldwide, non-exclusive, royalty-free, perpetual, irrevocable, sublicensable license to use, reproduce, modify, adapt, publish, translate, distribute, and otherwise exploit such materials for the operation, improvement, marketing, and development of the Platform, subject to applicable law and our Privacy Policy.</p>
                <p className="mt-2">You represent that you have the necessary rights to submit such materials.</p>
              </section>

              <section>
                <h3 className="font-bold text-black mb-2">18. Suspension and Termination</h3>
                <p className="mb-2">We may, in our sole discretion and with or without notice:</p>
                <ul className="list-disc ml-5 space-y-1 mb-2">
                  <li>suspend or restrict your access;</li>
                  <li>terminate your access;</li>
                  <li>disable wallet-related features for your account;</li>
                  <li>revoke rewards or balances;</li>
                  <li>remove data or content;</li>
                  <li>block claims or gameplay participation.</li>
                </ul>
                <p className="mb-2">We may do so for any reason, including legal risk, security concerns, technical abuse, inactivity, policy violations, fraud prevention, or operational needs.</p>
                <p>Upon termination, your right to use the Platform ends immediately.</p>
              </section>

              <section>
                <h3 className="font-bold text-black mb-2">19. Availability and Technical Risks</h3>
                <p className="mb-2">The Platform is provided on an <strong>"AS IS"</strong> and <strong>"AS AVAILABLE"</strong> basis.</p>
                <p className="mb-2">We do not guarantee that the Platform will be:</p>
                <ul className="list-disc ml-5 space-y-1 mb-2">
                  <li>uninterrupted;</li>
                  <li>secure;</li>
                  <li>error-free;</li>
                  <li>accurate;</li>
                  <li>complete;</li>
                  <li>compatible with your device;</li>
                  <li>free of bugs, malware, or vulnerabilities;</li>
                  <li>continuously available.</li>
                </ul>
                <p>The Platform may be affected by maintenance, outages, software defects, smart contract issues, infrastructure failures, cyberattacks, wallet issues, blockchain congestion, RPC failures, forks, reorgs, validator issues, data corruption, or force majeure events.</p>
              </section>

              <section>
                <h3 className="font-bold text-black mb-2">20. Disclaimer of Warranties</h3>
                <p className="mb-2">To the maximum extent permitted by law, we disclaim all warranties of any kind, whether express, implied, statutory, or otherwise, including warranties of:</p>
                <ul className="list-disc ml-5 space-y-1 mb-2">
                  <li>merchantability;</li>
                  <li>fitness for a particular purpose;</li>
                  <li>title;</li>
                  <li>non-infringement;</li>
                  <li>uninterrupted access;</li>
                  <li>accuracy;</li>
                  <li>reliability;</li>
                  <li>availability.</li>
                </ul>
                <p>We do not warrant that any reward, token label, testnet functionality, digital item, or blockchain-related feature will have any value, utility, legality, or future existence.</p>
              </section>

              <section>
                <h3 className="font-bold text-black mb-2">21. Limitation of Liability</h3>
                <p className="mb-2">To the maximum extent permitted by law, neither we nor our affiliates, owners, directors, officers, employees, contractors, licensors, service providers, or agents shall be liable for any indirect, incidental, special, consequential, punitive, or exemplary damages, including damages for:</p>
                <ul className="list-disc ml-5 space-y-1 mb-2">
                  <li>lost profits;</li>
                  <li>lost revenue;</li>
                  <li>lost opportunity;</li>
                  <li>loss of data;</li>
                  <li>loss of goodwill;</li>
                  <li>business interruption;</li>
                  <li>device damage;</li>
                  <li>digital asset loss;</li>
                  <li>transaction failure;</li>
                  <li>smart contract failure;</li>
                  <li>claim failure;</li>
                  <li>platform downtime;</li>
                  <li>security breach;</li>
                  <li>emotional distress.</li>
                </ul>
                <p className="mb-2">To the maximum extent permitted by law, our total aggregate liability arising out of or relating to the Platform or these Terms shall not exceed the greater of:</p>
                <ul className="list-disc ml-5 space-y-1 mb-2">
                  <li><strong>USD $100</strong>, or</li>
                  <li>the amount, if any, that you paid directly to us for use of the Platform in the <strong>12 months</strong> preceding the event giving rise to the claim.</li>
                </ul>
                <p>Some jurisdictions do not allow certain limitations, so parts of this section may not apply to you.</p>
              </section>

              <section>
                <h3 className="font-bold text-black mb-2">22. Indemnification</h3>
                <p className="mb-2">You agree to defend, indemnify, and hold harmless us and our affiliates, owners, officers, directors, employees, contractors, licensors, and service providers from and against any claims, liabilities, damages, judgments, awards, losses, costs, and expenses, including reasonable legal fees, arising out of or related to:</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>your use or misuse of the Platform;</li>
                  <li>your violation of these Terms;</li>
                  <li>your violation of applicable law;</li>
                  <li>your violation of any third-party rights;</li>
                  <li>your fraud, abuse, or misconduct;</li>
                  <li>your content, submissions, or communications;</li>
                  <li>disputes between you and another user.</li>
                </ul>
              </section>

              <section>
                <h3 className="font-bold text-black mb-2">23. Compliance with Laws and Sanctions</h3>
                <p className="mb-2">You represent and warrant that:</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>you are not subject to sanctions or trade restrictions that prohibit your use of the Platform;</li>
                  <li>you will comply with all laws applicable to your use of the Platform;</li>
                  <li>you will not use the Platform in connection with unlawful conduct, fraud, money laundering, sanctions evasion, or prohibited activity.</li>
                </ul>
                <p className="mt-2">We may restrict access where necessary for legal or compliance reasons.</p>
              </section>

              <section>
                <h3 className="font-bold text-black mb-2">24. Changes to the Platform and These Terms</h3>
                <p className="mb-2">We may update these Terms from time to time.</p>
                <p className="mb-2">If we make material changes, we may post the updated Terms on the Platform and update the "Last Updated" date. Your continued use of the Platform after the updated Terms become effective constitutes your acceptance of the revised Terms.</p>
                <p>We may also modify, suspend, or discontinue any part of the Platform at any time.</p>
              </section>

              <section>
                <h3 className="font-bold text-black mb-2">25. Governing Law</h3>
                <p>These Terms and any dispute arising out of or relating to them or the Platform shall be governed by the laws of <strong>[Insert Jurisdiction]</strong>, without regard to conflict of law principles.</p>
              </section>

              <section>
                <h3 className="font-bold text-black mb-2">26. Dispute Resolution</h3>
                <p className="mb-2">Any dispute, claim, or controversy arising out of or relating to these Terms or the Platform shall be resolved as follows:</p>
                <ul className="list-disc ml-5 space-y-1 mb-2">
                  <li>first, the parties will attempt in good faith to resolve the dispute informally;</li>
                  <li>if informal resolution is unsuccessful, the dispute shall be resolved by <strong>binding arbitration</strong> in <strong>[Insert Location]</strong> under the rules of <strong>[Insert Arbitration Rules]</strong>, unless applicable law requires otherwise;</li>
                  <li>if arbitration is unenforceable or unavailable, the dispute shall be brought exclusively in the courts located in <strong>[Insert Jurisdiction / Venue]</strong>.</li>
                </ul>
                <p>To the extent permitted by law, you agree that disputes will be resolved only on an individual basis and not as part of any class, consolidated, or representative action.</p>
              </section>

              <section>
                <h3 className="font-bold text-black mb-2">27. International Use</h3>
                <p>The Platform may not be appropriate, available, or lawful for use in all locations. We make no representation that the Platform is lawful in any specific jurisdiction. Users who access the Platform do so at their own initiative and are responsible for compliance with local laws.</p>
              </section>

              <section>
                <h3 className="font-bold text-black mb-2">28. Severability</h3>
                <p>If any provision of these Terms is held invalid, illegal, or unenforceable, the remaining provisions will remain in full force and effect to the maximum extent permitted by law.</p>
              </section>

              <section>
                <h3 className="font-bold text-black mb-2">29. No Waiver</h3>
                <p>Our failure to enforce any provision of these Terms shall not constitute a waiver of that provision or any other provision.</p>
              </section>

              <section>
                <h3 className="font-bold text-black mb-2">30. Entire Agreement</h3>
                <p>These Terms, together with our Privacy Policy, Cookie Notice, and any supplemental rules or campaign terms that we publish, constitute the entire agreement between you and us regarding the Platform and supersede prior understandings relating to the same subject matter.</p>
              </section>

              <section>
                <h3 className="font-bold text-black mb-2">31. Contact</h3>
                <p className="mb-2">For legal notices, support, privacy requests, copyright complaints, or questions about these Terms, contact us at:</p>
                <ul className="list-none ml-5 space-y-1">
                  <li><strong>Email:</strong> [Insert Contact Email]</li>
                  <li><strong>Company / Brand Name:</strong> [Insert Name]</li>
                  <li><strong>Address:</strong> [Insert Address, if applicable]</li>
                </ul>
              </section>

              <section className="bg-blue-50 border-2 border-blue-400 p-4 rounded-lg">
                <h3 className="font-bold text-black mb-2">32. Acknowledgment</h3>
                <p className="font-bold">BY CLICKING "ACCEPT" OR BY USING THIS PLATFORM, YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND AGREE TO BE BOUND BY THESE TERMS & CONDITIONS IN THEIR ENTIRETY.</p>
              </section>
            </div>
          </div>
        </PolicyModal>
      )}

      {policyModal === 'privacy' && (
        <PolicyModal isOpen={true} onClose={() => setPolicyModal(null)} title="Privacy Policy">
          <div className="prose prose-invert max-w-none space-y-6 text-sm leading-relaxed">
            <p className="text-xs text-gray-400 mb-4">Last Updated: [Insert Date]</p>
            <section>
              <p>This Privacy Policy ("<strong>Policy</strong>") explains how MLEO and/or the operator of the MLEO Platform ("<strong>we</strong>", "<strong>us</strong>", or "<strong>our</strong>") collects, uses, stores, shares, and protects personal data when you access or use our websites, games, applications, wallet-related features, testnet features, support channels, community tools, and related services (collectively, the "<strong>Platform</strong>").</p>
              <p>By accessing or using the Platform, you acknowledge that you have read and understood this Policy.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">1. Scope of This Policy</h2>
              <p className="mb-2">This Policy applies to personal data we collect when you:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>visit or use the Platform;</li>
                <li>play games or use gameplay-related features;</li>
                <li>connect a wallet;</li>
                <li>interact with testnet or blockchain-related features;</li>
                <li>contact support;</li>
                <li>participate in campaigns, promotions, community activities, or surveys;</li>
                <li>interact with us through forms, emails, or social channels linked from the Platform.</li>
              </ul>
              <p className="mt-2">This Policy does not apply to third-party websites, wallets, apps, exchanges, blockchain explorers, analytics tools, social networks, or other services that we do not own or control.</p>
            </section>

            <section className="bg-yellow-900/20 border border-yellow-700/30 p-4 rounded-lg">
              <h2 className="text-xl font-bold mt-8 mb-4">2. Important Notice About Blockchain Features</h2>
              <p className="mb-2">Some features of the Platform may involve public blockchain networks, wallet addresses, smart contracts, or testnet environments.</p>
              <p className="mb-2">Please note:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>blockchain networks are public by design;</li>
                <li>wallet addresses and on-chain transactions may be visible to others;</li>
                <li>public blockchain data is generally not deletable;</li>
                <li>we do not control third-party blockchains or public ledgers.</li>
              </ul>
              <p className="mt-2">If you connect a wallet or interact with blockchain-related features, certain information may become publicly available independently of our systems.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">3. Categories of Data We Collect</h2>
              <p className="mb-4">Depending on how you use the Platform, we may collect the following categories of information.</p>

              <h3 className="text-lg font-semibold mt-6 mb-2">A. Information You Provide Directly</h3>
              <p className="mb-2">You may provide us with:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>your name or username;</li>
                <li>email address;</li>
                <li>support messages and correspondence;</li>
                <li>information you submit in forms, surveys, bug reports, promotions, or community activities;</li>
                <li>content you voluntarily send to us.</li>
              </ul>

              <h3 className="text-lg font-semibold mt-6 mb-2">B. Wallet and Blockchain-Related Information</h3>
              <p className="mb-2">If you use wallet or blockchain-related features, we may collect:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>wallet address;</li>
                <li>network or chain information;</li>
                <li>public transaction identifiers;</li>
                <li>public smart contract interaction data;</li>
                <li>claim attempts, eligibility checks, or testnet participation records;</li>
                <li>associated timestamps and technical metadata.</li>
              </ul>

              <h3 className="text-lg font-semibold mt-6 mb-2">C. Gameplay and Platform Activity Information</h3>
              <p className="mb-2">We may collect gameplay and usage information such as:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>game sessions;</li>
                <li>scores, rankings, progression, achievements, rewards, and vault-related activity;</li>
                <li>feature usage;</li>
                <li>login or session events;</li>
                <li>preferences and settings;</li>
                <li>interactions with gameplay mechanics, promotions, and user interface elements;</li>
                <li>anti-abuse and fraud-prevention signals.</li>
              </ul>

              <h3 className="text-lg font-semibold mt-6 mb-2">D. Device, Browser, and Technical Information</h3>
              <p className="mb-2">We may collect technical information such as:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>IP address;</li>
                <li>browser type and version;</li>
                <li>device type;</li>
                <li>operating system;</li>
                <li>language settings;</li>
                <li>referring URLs;</li>
                <li>pages visited;</li>
                <li>timestamps;</li>
                <li>crash logs;</li>
                <li>error logs;</li>
                <li>approximate geolocation derived from IP;</li>
                <li>performance and diagnostic data.</li>
              </ul>

              <h3 className="text-lg font-semibold mt-6 mb-2">E. Cookies, Local Storage, and Similar Technologies</h3>
              <p className="mb-2">We may collect information through:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>cookies;</li>
                <li>local storage;</li>
                <li>session storage;</li>
                <li>software development kits (SDKs);</li>
                <li>pixels;</li>
                <li>log files;</li>
                <li>similar technologies.</li>
              </ul>
              <p className="mt-2">These technologies may store identifiers, preferences, session data, technical flags, gameplay state, and analytics-related information.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">4. How We Use Personal Data</h2>
              <p className="mb-4">We may use personal data for the following purposes:</p>

              <h3 className="text-lg font-semibold mt-6 mb-2">A. To Provide and Operate the Platform</h3>
              <p className="mb-2">Including to:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>make the Platform available;</li>
                <li>provide games, features, rewards logic, support tools, and wallet-related interactions;</li>
                <li>maintain accounts, sessions, gameplay state, and platform functionality;</li>
                <li>process testnet or blockchain-related interactions where applicable.</li>
              </ul>

              <h3 className="text-lg font-semibold mt-6 mb-2">B. To Improve and Develop the Platform</h3>
              <p className="mb-2">Including to:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>analyze performance and usage;</li>
                <li>understand player behavior and product engagement;</li>
                <li>improve game balance, user experience, navigation, and technical stability;</li>
                <li>test new features and content.</li>
              </ul>

              <h3 className="text-lg font-semibold mt-6 mb-2">C. To Secure the Platform</h3>
              <p className="mb-2">Including to:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>detect fraud, abuse, bots, multi-accounting, exploitation, and suspicious activity;</li>
                <li>investigate bugs, incidents, or security threats;</li>
                <li>enforce our Terms, rules, and policies;</li>
                <li>protect the rights, safety, and property of users, us, and third parties.</li>
              </ul>

              <h3 className="text-lg font-semibold mt-6 mb-2">D. To Communicate With You</h3>
              <p className="mb-2">Including to:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>respond to support requests;</li>
                <li>send service-related notices;</li>
                <li>provide policy updates, gameplay notices, maintenance alerts, and security communications;</li>
                <li>administer promotions, surveys, or campaigns where permitted.</li>
              </ul>

              <h3 className="text-lg font-semibold mt-6 mb-2">E. To Comply With Legal Obligations</h3>
              <p className="mb-2">Including to:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>comply with applicable laws, regulations, legal process, and governmental requests;</li>
                <li>maintain records where required;</li>
                <li>establish, exercise, or defend legal claims.</li>
              </ul>

              <h3 className="text-lg font-semibold mt-6 mb-2">F. To Prevent Misuse and Preserve Fairness</h3>
              <p className="mb-2">Including to:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>validate participation rules;</li>
                <li>manage reward eligibility;</li>
                <li>detect manipulation of claims, leaderboards, sessions, or vault systems;</li>
                <li>apply technical or gameplay restrictions as needed.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">5. Legal Bases for Processing</h2>
              <p className="mb-2">Where applicable data protection law requires a legal basis, we may rely on one or more of the following:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>performance of a contract, including providing the Platform and requested features;</li>
                <li>legitimate interests, such as operating, securing, improving, and protecting the Platform;</li>
                <li>compliance with legal obligations;</li>
                <li>consent, where required by law, including for certain cookies or optional communications.</li>
              </ul>
              <p className="mt-2">Where we rely on legitimate interests, we consider and balance the potential impact on users and apply safeguards where appropriate.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">6. Cookies and Similar Technologies</h2>
              <p className="mb-2">We may use cookies and similar technologies for:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>essential site functionality;</li>
                <li>security and fraud prevention;</li>
                <li>authentication and session continuity;</li>
                <li>remembering settings and preferences;</li>
                <li>analytics and performance measurement;</li>
                <li>feature testing and platform improvement.</li>
              </ul>
              <p className="mt-2">Where required by applicable law, we will request your consent before placing non-essential cookies or using similar non-essential tracking technologies.</p>
              <p className="mt-2">You may be able to manage cookie preferences through your browser settings or our cookie controls, where available. Disabling certain technologies may affect functionality.</p>
              <p className="mt-2">For more information, please see our Cookie Notice.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">7. When We Share Personal Data</h2>
              <p className="mb-4 font-semibold">We do not sell your personal data for money.</p>
              <p className="mb-4">We may share personal data only in the circumstances described below.</p>

              <h3 className="text-lg font-semibold mt-6 mb-2">A. Service Providers and Infrastructure Partners</h3>
              <p className="mb-2">We may share data with service providers who help us operate the Platform, such as providers of:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>hosting;</li>
                <li>analytics;</li>
                <li>cloud storage;</li>
                <li>customer support tools;</li>
                <li>infrastructure monitoring;</li>
                <li>security services;</li>
                <li>communication tools;</li>
                <li>wallet or blockchain infrastructure integrations.</li>
              </ul>
              <p className="mt-2">These providers may access personal data only as needed to perform services for us and subject to appropriate obligations.</p>

              <h3 className="text-lg font-semibold mt-6 mb-2">B. Legal and Compliance Reasons</h3>
              <p className="mb-2">We may disclose information where we believe disclosure is necessary to:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>comply with applicable law, regulation, court order, subpoena, or legal process;</li>
                <li>respond to lawful requests by public authorities;</li>
                <li>enforce our agreements and policies;</li>
                <li>investigate fraud, abuse, security incidents, or unlawful activity;</li>
                <li>protect rights, safety, property, or operations.</li>
              </ul>

              <h3 className="text-lg font-semibold mt-6 mb-2">C. Business Transfers</h3>
              <p className="mb-2">If we are involved in a merger, acquisition, restructuring, financing, asset sale, or similar transaction, personal data may be transferred as part of that process, subject to applicable safeguards.</p>

              <h3 className="text-lg font-semibold mt-6 mb-2">D. With Your Direction or Consent</h3>
              <p className="mb-2">We may share information where you instruct us to do so or where you explicitly consent.</p>

              <h3 className="text-lg font-semibold mt-6 mb-2">E. Public Blockchain Data</h3>
              <p className="mb-2">If you interact with public blockchain features, certain data may be visible publicly by design and may be accessible through third-party explorers, nodes, or analytics services independently of us.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">8. International Data Transfers</h2>
              <p className="mb-2">Your personal data may be processed in countries other than your own, including countries that may have different data protection laws.</p>
              <p>Where required by law, we take appropriate steps to protect personal data transferred internationally, including contractual safeguards or other lawful transfer mechanisms.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">9. Data Retention</h2>
              <p className="mb-2">We retain personal data only for as long as reasonably necessary for the purposes described in this Policy, including to:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>provide and operate the Platform;</li>
                <li>maintain records;</li>
                <li>resolve disputes;</li>
                <li>enforce agreements;</li>
                <li>comply with legal obligations;</li>
                <li>investigate security or abuse issues.</li>
              </ul>
              <p className="mt-2">Retention periods may vary depending on the type of data, legal requirements, operational needs, and security considerations.</p>
              <p className="mt-2">We may retain aggregated, anonymized, or de-identified information for longer where permitted by law.</p>
              <p className="mt-2 font-semibold">Please note that public blockchain data is generally permanent and cannot be deleted by us.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">10. Data Security</h2>
              <p className="mb-2">We implement reasonable technical, administrative, and organizational measures designed to protect personal data against unauthorized access, loss, misuse, alteration, or disclosure.</p>
              <p className="mb-2">However, no system, network, storage method, wallet environment, or transmission over the internet is completely secure. We cannot guarantee absolute security.</p>
              <p>You are also responsible for protecting your own devices, wallets, seed phrases, passwords, and access credentials.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">11. Children's Privacy</h2>
              <p className="mb-2">The Platform is not intended for children.</p>
              <p>We do not knowingly collect personal data from individuals under the age required to use the Platform under our Terms. If you believe a child has provided personal data in violation of this Policy, contact us so we can take appropriate action.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">12. Your Privacy Rights</h2>
              <p className="mb-2">Depending on your jurisdiction, you may have certain rights regarding your personal data, such as the right to:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>access personal data we hold about you;</li>
                <li>request correction of inaccurate data;</li>
                <li>request deletion of personal data;</li>
                <li>request restriction of processing;</li>
                <li>object to certain processing;</li>
                <li>request portability of certain data;</li>
                <li>withdraw consent where processing is based on consent;</li>
                <li>lodge a complaint with a supervisory authority.</li>
              </ul>
              <p className="mt-2">These rights are not absolute and may be subject to legal, technical, contractual, or security limitations.</p>
              <p className="mt-2">To exercise your rights, contact us using the details below. We may request information necessary to verify your identity before responding.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">13. Account, Wallet, and Public Data Limitations</h2>
              <p className="mb-2">Please understand the limits of privacy in blockchain and platform environments:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>wallet addresses may be public;</li>
                <li>public blockchain activity is visible to others;</li>
                <li>some gameplay, ranking, or community data may be visible within the Platform;</li>
                <li>if you voluntarily post or share information publicly, it may be copied or redistributed by others;</li>
                <li>we may not be able to delete data that has already been published to a blockchain or public network.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">14. Third-Party Services</h2>
              <p className="mb-2">The Platform may contain links to or integrations with third-party services, including wallets, social platforms, explorers, RPC providers, or analytics tools.</p>
              <p>We are not responsible for the privacy, security, or content practices of third parties. Your use of those services is governed by their own terms and privacy policies.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">15. Automated Monitoring and Anti-Abuse Measures</h2>
              <p className="mb-2">To protect the Platform, users, and reward systems, we may use automated tools or rule-based systems to detect suspicious activity, including:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>bot-like behavior;</li>
                <li>abnormal session patterns;</li>
                <li>exploitation attempts;</li>
                <li>duplicate participation;</li>
                <li>fraudulent claim activity;</li>
                <li>service interference.</li>
              </ul>
              <p className="mt-2">These tools may affect eligibility, access, rewards, claims, or account status. We may review relevant signals manually or automatically where appropriate.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">16. Communications</h2>
              <p className="mb-2">We may send transactional or service-related communications, such as:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>account or session notices;</li>
                <li>support replies;</li>
                <li>maintenance alerts;</li>
                <li>security notices;</li>
                <li>policy updates;</li>
                <li>claim or feature status notices.</li>
              </ul>
              <p className="mt-2">Where required by law, we will obtain consent before sending marketing communications. You may opt out of non-essential promotional messages where applicable.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">17. Do Not Track</h2>
              <p className="mb-2">Some browsers offer a "Do Not Track" setting. Because there is not yet a universally accepted standard for responding to such signals, the Platform may not respond to all Do Not Track requests unless required by applicable law.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">18. Region-Specific Disclosures</h2>
              <p className="mb-2">Depending on your location, additional disclosures or rights may apply under laws such as the GDPR, UK GDPR, or other applicable privacy laws.</p>
              <p>Where required, we may provide supplemental regional privacy notices.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">19. Changes to This Policy</h2>
              <p className="mb-2">We may update this Policy from time to time.</p>
              <p>If we make material changes, we may post the updated version on the Platform and revise the "Last Updated" date. Your continued use of the Platform after the effective date of the updated Policy constitutes your acknowledgment of the revised Policy, to the extent permitted by law.</p>
            </section>

            <section className="bg-blue-900/20 border border-blue-700/30 p-4 rounded-lg">
              <h2 className="text-xl font-bold mt-8 mb-4">20. Contact Us</h2>
              <p className="mb-2">If you have questions, requests, or concerns about this Policy or our privacy practices, contact us at:</p>
              <ul className="list-none space-y-1">
                <li><strong>Email:</strong> [Insert Contact Email]</li>
                <li><strong>Company / Brand Name:</strong> [Insert Name]</li>
                <li><strong>Address:</strong> [Insert Address, if applicable]</li>
              </ul>
              <p className="mt-4">If required by applicable law, you may also include the contact details of your privacy representative or data protection contact here.</p>
            </section>
          </div>
        </PolicyModal>
      )}

      {policyModal === 'cookies' && (
        <PolicyModal isOpen={true} onClose={() => setPolicyModal(null)} title="Cookie Notice">
          <div className="prose prose-invert max-w-none space-y-6 text-sm leading-relaxed">
            <p className="text-xs text-gray-400 mb-4">Last Updated: [Insert Date]</p>
            <section>
              <p>This Cookie Notice explains how MLEO and/or the operator of the MLEO Platform ("<strong>we</strong>", "<strong>us</strong>", or "<strong>our</strong>") uses cookies, local storage, session storage, pixels, SDKs, and similar technologies ("<strong>Cookies</strong>") when you access or use our websites, games, apps, wallet-related features, and related services (collectively, the "<strong>Platform</strong>").</p>
              <p>This Cookie Notice should be read together with our Privacy Policy and Terms & Conditions.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">1. What Are Cookies and Similar Technologies</h2>
              <p className="mb-2">Cookies are small text files placed on your browser or device when you visit a website or use an application. Similar technologies may include:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>local storage;</li>
                <li>session storage;</li>
                <li>tags;</li>
                <li>pixels;</li>
                <li>scripts;</li>
                <li>SDKs;</li>
                <li>device identifiers;</li>
                <li>log-based tracking tools.</li>
              </ul>
              <p className="mt-2">These technologies help websites and apps function properly, remember preferences, improve performance, analyze usage, and support security and fraud prevention.</p>
              <p className="mt-2">For simplicity, we refer to all of these technologies as "Cookies" in this Notice, unless otherwise stated.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">2. Why We Use Cookies</h2>
              <p className="mb-4">We may use Cookies for the following purposes:</p>

              <h3 className="text-lg font-semibold mt-6 mb-2">A. Strictly Necessary Cookies</h3>
              <p className="mb-2">These Cookies are necessary for the Platform to function properly and securely. They may be used to:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>enable core site functionality;</li>
                <li>maintain sessions;</li>
                <li>remember basic user settings;</li>
                <li>provide security features;</li>
                <li>protect against abuse, fraud, and malicious activity;</li>
                <li>support load balancing or infrastructure stability;</li>
                <li>maintain wallet-related connection state where applicable.</li>
              </ul>
              <p className="mt-2">These Cookies do not usually require consent where permitted by law because they are necessary for the operation of the Platform.</p>

              <h3 className="text-lg font-semibold mt-6 mb-2">B. Functional Cookies</h3>
              <p className="mb-2">These Cookies help us remember preferences and improve your experience, such as:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>language preferences;</li>
                <li>display settings;</li>
                <li>game settings;</li>
                <li>gameplay-related state;</li>
                <li>basic user interface customizations;</li>
                <li>saved preferences across visits.</li>
              </ul>

              <h3 className="text-lg font-semibold mt-6 mb-2">C. Analytics and Performance Cookies</h3>
              <p className="mb-2">These Cookies help us understand how users interact with the Platform so we can improve design, performance, and gameplay experience. They may be used to collect information such as:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>pages visited;</li>
                <li>features used;</li>
                <li>clicks and interactions;</li>
                <li>session length;</li>
                <li>performance issues;</li>
                <li>crash data;</li>
                <li>browser and device type;</li>
                <li>general usage trends.</li>
              </ul>
              <p className="mt-2">Where required by law, we will obtain consent before using non-essential analytics Cookies.</p>

              <h3 className="text-lg font-semibold mt-6 mb-2">D. Security and Anti-Abuse Technologies</h3>
              <p className="mb-2">We may use Cookies and related technologies to detect and prevent:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>bot activity;</li>
                <li>session abuse;</li>
                <li>automated exploitation;</li>
                <li>suspicious or repeated claim activity;</li>
                <li>manipulation of gameplay or platform features;</li>
                <li>unauthorized access attempts.</li>
              </ul>
              <p className="mt-2">These protections may be necessary to protect the Platform, users, and reward systems.</p>

              <h3 className="text-lg font-semibold mt-6 mb-2">E. Testing and Improvement Tools</h3>
              <p className="mb-2">We may use certain technologies to:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>test new features;</li>
                <li>evaluate interface improvements;</li>
                <li>measure feature reliability;</li>
                <li>understand how updates affect performance or usability.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">3. Types of Information Collected Through Cookies</h2>
              <p className="mb-2">Depending on the technology used, Cookies may collect or store information such as:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>IP address;</li>
                <li>browser type and version;</li>
                <li>operating system;</li>
                <li>device identifiers;</li>
                <li>preferred language;</li>
                <li>session identifiers;</li>
                <li>site navigation data;</li>
                <li>pages or screens viewed;</li>
                <li>interaction events;</li>
                <li>timestamps;</li>
                <li>approximate location derived from IP;</li>
                <li>technical diagnostics;</li>
                <li>locally stored gameplay or preference data.</li>
              </ul>
              <p className="mt-2">Some Cookies may assign or store unique identifiers.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">4. Local Storage and Game-Related Functionality</h2>
              <p className="mb-2">Because the Platform may include browser-based games, game progress systems, or wallet-related UI logic, we may use local storage or session storage to support:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>game state persistence;</li>
                <li>session continuity;</li>
                <li>user preferences;</li>
                <li>temporary gameplay progress;</li>
                <li>UI settings;</li>
                <li>feature flags;</li>
                <li>locally stored technical states.</li>
              </ul>
              <p className="mt-2 font-semibold">Please note that locally stored browser data may be lost, reset, modified, blocked by your browser, or unavailable across devices. We do not guarantee that browser-stored data will always persist.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">5. Third-Party Cookies and Technologies</h2>
              <p className="mb-2">We may allow trusted third-party providers to place or access Cookies or similar technologies for purposes such as:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>analytics;</li>
                <li>performance monitoring;</li>
                <li>hosting or infrastructure support;</li>
                <li>security services;</li>
                <li>wallet integration support;</li>
                <li>embedded content functionality.</li>
              </ul>
              <p className="mt-2">These third parties may collect information according to their own privacy notices and policies. We do not control all third-party technologies once enabled through their services.</p>
              <p className="mt-2">Examples may include providers related to hosting, analytics, monitoring, wallet connection infrastructure, embedded media, or technical support tools.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">6. Consent and Lawful Use</h2>
              <p className="mb-2">Where required by applicable law, we will ask for your consent before using non-essential Cookies or similar technologies.</p>
              <p className="mb-2">Where permitted, strictly necessary Cookies may be used without consent because they are required for the functioning, security, or integrity of the Platform.</p>
              <p>If you give consent, you may later withdraw it through available cookie settings, consent tools, or relevant browser controls, subject to technical limitations.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">7. How to Manage Cookies</h2>
              <p className="mb-2">You may be able to control or disable Cookies through:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>your browser settings;</li>
                <li>device settings;</li>
                <li>cookie banners or consent tools on the Platform, where available;</li>
                <li>privacy tools or extensions.</li>
              </ul>
              <p className="mt-2 font-semibold">Please note that blocking or disabling certain Cookies may affect the functionality, availability, security, or performance of the Platform, including gameplay features, stored preferences, wallet-related UI behavior, and session continuity.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">8. Browser-Based Storage Limitations</h2>
              <p className="mb-2">Some Platform features may rely on local or session storage rather than traditional browser cookies. If you clear your browser data, change devices, use private browsing, install blockers, or disable storage permissions, some gameplay state or saved settings may no longer be available.</p>
              <p>We are not responsible for data loss caused by browser clearing, device changes, extension interference, privacy settings, or user-configured deletion of stored local data.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">9. Changes to This Cookie Notice</h2>
              <p className="mb-2">We may update this Cookie Notice from time to time. If we do, we may post the updated version on the Platform and revise the "Last Updated" date.</p>
              <p>Your continued use of the Platform after the updated Cookie Notice becomes effective constitutes your acknowledgment of the revised notice, to the extent permitted by applicable law.</p>
            </section>

            <section className="bg-blue-900/20 border border-blue-700/30 p-4 rounded-lg">
              <h2 className="text-xl font-bold mt-8 mb-4">10. Contact Us</h2>
              <p className="mb-2">If you have questions about this Cookie Notice or our use of Cookies, contact us at:</p>
              <ul className="list-none space-y-1">
                <li><strong>Email:</strong> [Insert Contact Email]</li>
                <li><strong>Company / Brand Name:</strong> [Insert Name]</li>
                <li><strong>Address:</strong> [Insert Address, if applicable]</li>
              </ul>
            </section>
          </div>
        </PolicyModal>
      )}

      {policyModal === 'risk' && (
        <PolicyModal isOpen={true} onClose={() => setPolicyModal(null)} title="Risk / Testnet Disclaimer">
          <div className="prose prose-invert max-w-none space-y-6 text-sm leading-relaxed">
            <p className="text-xs text-gray-400 mb-4">Last Updated: [Insert Date]</p>
            <div className="bg-red-900/30 border-2 border-red-700/50 p-4 rounded-lg mb-6">
              <p className="font-bold text-lg mb-2">⚠️ Important Warning</p>
              <p>This Risk / Testnet Disclaimer explains important risks, limitations, and warnings relating to the use of the MLEO Platform, including any wallet-related, reward-related, blockchain-related, or testnet-related features.</p>
              <p className="mt-2 font-semibold">By accessing or using the Platform, you acknowledge and accept the risks described below.</p>
            </div>
            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">1. Entertainment and Experimental Platform</h2>
              <p className="mb-2">The Platform is provided for entertainment, gameplay, experimental, community, and development purposes. Certain features may be in test, beta, demo, limited-access, or experimental form.</p>
              <p>The Platform is not a casino, gambling service, exchange, brokerage, financial institution, or investment platform.</p>
            </section>

            <section className="bg-yellow-900/20 border border-yellow-700/30 p-4 rounded-lg">
              <h2 className="text-xl font-bold mt-8 mb-4">2. Testnet Features May Have No Value</h2>
              <p className="mb-2">Any feature identified as <strong>testnet</strong>, <strong>beta</strong>, <strong>demo</strong>, <strong>development</strong>, <strong>experimental</strong>, or similar may:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>have no monetary value;</li>
                <li>be non-transferable;</li>
                <li>be non-redeemable;</li>
                <li>be subject to resets or deletion;</li>
                <li>be changed, paused, or discontinued at any time;</li>
                <li>not correspond to any live or future mainnet asset.</li>
              </ul>
              <p className="mt-2 font-semibold">Displaying a wallet address, token label, contract address, pool amount, claim status, or blockchain data does not mean that any asset has real-world value, liquidity, or redemption rights.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">3. No Promise of Future Launch, Listing, or Utility</h2>
              <p className="mb-2">Nothing on the Platform should be interpreted as a promise, guarantee, or representation that any token, reward, balance, vault amount, or digital item will:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>launch on mainnet;</li>
                <li>become transferable;</li>
                <li>become redeemable;</li>
                <li>be listed anywhere;</li>
                <li>retain value;</li>
                <li>gain utility;</li>
                <li>be exchangeable for money, crypto, or anything else.</li>
              </ul>
              <p className="mt-2">Any future feature, if introduced at all, may be subject to separate rules, eligibility requirements, technical limitations, and legal restrictions.</p>
            </section>

            <section className="bg-red-900/20 border border-red-700/30 p-4 rounded-lg">
              <h2 className="text-xl font-bold mt-8 mb-4">4. Wallet Use Is at Your Own Risk</h2>
              <p className="mb-2">If you connect a wallet or interact with blockchain-related features, you do so at your own risk.</p>
              <p className="mb-2">You are solely responsible for:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>wallet security;</li>
                <li>device security;</li>
                <li>seed phrases and private keys;</li>
                <li>transaction approvals;</li>
                <li>address accuracy;</li>
                <li>gas fees;</li>
                <li>understanding the network you are using;</li>
                <li>reviewing any transaction before confirming it.</li>
              </ul>
              <p className="mt-2">We are not responsible for losses caused by user error, phishing, malicious extensions, compromised wallets, incorrect approvals, fake interfaces, network congestion, chain instability, or third-party wallet failures.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">5. Smart Contract and Blockchain Risks</h2>
              <p className="mb-2">Blockchain-related features may involve substantial technical risk, including:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>bugs or vulnerabilities;</li>
                <li>failed transactions;</li>
                <li>incorrect reads or writes;</li>
                <li>RPC failures;</li>
                <li>indexing delays;</li>
                <li>network congestion;</li>
                <li>forks or reorgs;</li>
                <li>front-end mismatches;</li>
                <li>inaccurate balances or claim indicators;</li>
                <li>contract pauses or admin interventions;</li>
                <li>incompatibility with certain wallets or devices.</li>
              </ul>
              <p className="mt-2">Even where a smart contract is deployed, available, or visible, interactions may fail or behave unexpectedly.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">6. Claims, Rewards, and Vault Balances Are Not Guaranteed</h2>
              <p className="mb-2">Any Vault amount, reward display, accrued total, claimable amount, leaderboard result, or session reward shown on the Platform may be provisional, delayed, approximate, or subject to verification.</p>
              <p className="mb-2">Claims or rewards may be:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>rate-limited;</li>
                <li>paused;</li>
                <li>denied;</li>
                <li>recalculated;</li>
                <li>revoked;</li>
                <li>delayed;</li>
                <li>subject to anti-abuse review;</li>
                <li>affected by technical or legal restrictions.</li>
              </ul>
              <p className="mt-2 font-semibold">A visible balance or claim button does not guarantee successful receipt of any item or asset.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">7. No Financial, Legal, or Tax Advice</h2>
              <p className="mb-2">Nothing on the Platform constitutes financial, investment, legal, accounting, regulatory, or tax advice.</p>
              <p>You are solely responsible for evaluating the risks of using the Platform and for obtaining independent professional advice where appropriate.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">8. Availability and Service Changes</h2>
              <p className="mb-2">The Platform may be unavailable, interrupted, modified, or discontinued at any time.</p>
              <p className="mb-2">We may:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>change reward formulas;</li>
                <li>rebalance gameplay;</li>
                <li>reset test data;</li>
                <li>modify vault logic;</li>
                <li>disable claims;</li>
                <li>migrate systems;</li>
                <li>remove features;</li>
                <li>wipe local progress;</li>
                <li>restrict access by region, wallet, or device.</li>
              </ul>
              <p className="mt-2">We have no obligation to maintain any particular feature or experience.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">9. No Reliance</h2>
              <p className="mb-2">You must not rely on the Platform, its interfaces, token labels, pool displays, reward screens, whitepaper text, roadmap references, or technical indicators as guarantees of future functionality, value, rights, or asset ownership.</p>
              <p>All features are subject to change and should be treated with caution.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">10. Regulatory and Legal Uncertainty</h2>
              <p className="mb-2">Digital assets, blockchain applications, wallet integrations, and online reward systems may be subject to changing laws, regulations, interpretations, and enforcement approaches across jurisdictions.</p>
              <p>We do not guarantee that any feature is appropriate, lawful, or available in every jurisdiction. You are solely responsible for understanding and complying with the laws that apply to you.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">11. Third-Party Dependencies</h2>
              <p className="mb-2">The Platform may depend on third-party services, including wallets, hosting providers, RPC providers, infrastructure partners, analytics tools, cloud services, and public blockchain networks.</p>
              <p>These services may fail, change, suspend access, introduce delays, or create security issues beyond our control. We are not responsible for third-party failures or interruptions.</p>
            </section>

            <section className="bg-orange-900/20 border border-orange-700/30 p-4 rounded-lg">
              <h2 className="text-xl font-bold mt-8 mb-4">12. Limitation of Expectations</h2>
              <p className="mb-2">You acknowledge that:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>gameplay systems may change;</li>
                <li>balances may be adjusted;</li>
                <li>claims may fail;</li>
                <li>testnet states may be wiped;</li>
                <li>digital items may never become live assets;</li>
                <li>visible numbers may be informational only;</li>
                <li>experimental systems may break or be removed entirely.</li>
              </ul>
              <p className="mt-2 font-semibold">You use the Platform with these limitations fully understood.</p>
            </section>

            <section className="bg-blue-900/20 border border-blue-700/30 p-4 rounded-lg">
              <h2 className="text-xl font-bold mt-8 mb-4">13. Contact</h2>
              <p className="mb-2">If you have questions about this Risk / Testnet Disclaimer, contact us at:</p>
              <ul className="list-none space-y-1">
                <li><strong>Email:</strong> [Insert Contact Email]</li>
                <li><strong>Company / Brand Name:</strong> [Insert Name]</li>
                <li><strong>Address:</strong> [Insert Address, if applicable]</li>
              </ul>
            </section>
          </div>
        </PolicyModal>
      )}
    </Layout>
  );
}