// pages/index.js
import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import PWAInstall from "../components/PWAInstall";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";
import { supabaseMP } from "../lib/supabaseClients";
import PolicyModal from "../components/PolicyModal";
const AuthEmailPassword = dynamic(() => import("../components/AuthEmailPassword"), { ssr: false });



const GAME_ENTRY_URL = "/mining"; // שנה אם צריך

// ===== Translations =====
const TEXT = {
  en: {
    name: "English", dir: "ltr", code: "en",
    new: "New", early: "Early miners welcome",
    heroH1_1: "Mine. Merge. Earn.",
    heroH1_2: "Welcome to the MLEO Rush.",
    start: "START NOW",
    how: "How it works",
    bullets: [
      "Fair, capped daily accrual",
      "Anti-abuse & soft limits",
      "Installable PWA",
    ],
    slogans: [
      "Ever wished you mined Bitcoin on day one? Start with MLEO today.",
      "Tap. Merge. Earn. Turn your play into MLEO.",
      "From meme to machine — mine the future with Leo.",
      "Fair emission. Real competition. Pure fun.",
      "No gas, no fuss (demo). Just mine and climb.",
      "Join early miners. Claim your share of the MLEO era.",
    ],
    modal: {
      title: "How MLEO Accrual Works",
      sections: [
        {
          t: "1) What you actually earn",
          p: "MLEO is a utility token earned through play. Eligible in-game outcomes may translate into MLEO. Rates are variable for fairness and stability.",
        },
        {
          t: "2) Conversion (high level)",
          p: "Only specific actions qualify. The exact formulas are not public and can change.",
        },
        {
          t: "3) Daily range & fairness",
          p: "Accrual gradually tapers as you approach your personal daily range to prevent abuse and keep pacing healthy.",
        },
        {
          t: "4) Vault & Claim",
          p: "Your accrued balance can be CLAIMed to your in-app Vault. If on-chain claiming opens later, extra unlock windows and eligibility checks may apply.",
        },
        {
          t: "5) When you’re away",
          p: "Limited offline progress can accrue at reduced efficiency. It is a light boost, not a replacement for active play.",
        },
        {
          t: "6) Important notes",
          p: "Availability, rates and caps may change, pause or reset. Not financial advice; MLEO has no guaranteed monetary value.",
        },
      ],
      cta: "START NOW",
      close: "Close",
    },
    footer: { terms: "Terms", privacy: "Privacy", docs: "Docs" },
  },


  ar: {
    name: "العربية", dir: "rtl", code: "ar",
    new: "جديد", early: "مرحبًا بالمنقّبين الأوائل",
    heroH1_1: "عدِّن. دمج. اربح.",
    heroH1_2: "مرحبًا بك في اندفاعة MLEO.",
    start: "ابدأ الآن",
    how: "كيف يعمل",
    bullets: [
      "تراكم يومي عادل ومحدود",
      "مكافحة إساءة الاستخدام وحدود لينة",
      "تطبيق PWA قابِل للتثبيت",
    ],
    slogans: [
      "تمنّيتَ لو عدّنتَ بتكوين من اليوم الأول؟ ابدأ مع MLEO اليوم.",
      "اضغط. ادمج. اربح. حوّل لعبك إلى MLEO.",
      "من الميم إلى الآلة — عدِّن المستقبل مع ليو.",
      "إصدار عادل. منافسة حقيقية. متعة خالصة.",
      "بدون Gas وبدون تعقيد (تجريبي). فقط عدِّن وتقدّم.",
      "انضمّ إلى المعدّنين الأوائل. احصل على حصّتك من عصر MLEO.",
    ],
    modal: {
      title: "كيف تعمل آلية اكتساب MLEO",
      sections: [
        { t: "1) ماذا تكسب فعليًا", p: "‏MLEO رمز منفعي يُكتسب عبر اللعب. قد تتحوّل بعض نتائج اللعب المؤهّلة إلى MLEO. المعدّلات متغيّرة لضمان العدالة والاستقرار." },
        { t: "2) التحويل (نظرة عامة)", p: "تتأهّل إجراءات محدّدة فقط. الصيغ الدقيقة غير معلنة وقد تتغيّر." },
        { t: "3) النطاق اليومي والعدالة", p: "‏يقلّ الاكتساب تدريجيًا كلما اقتربت من نطاقك اليومي الشخصي لمنع الإساءة والحفاظ على وتيرة صحية." },
        { t: "4) الخزنة و«المطالبة»", p: "يمكنك «المطالبة» برصيدك إلى خزنتك داخل التطبيق. إن فُتح السحب على السلسلة لاحقًا فقد توجد نوافذ فتح إضافية ومتطلبات أهلية." },
        { t: "5) أثناء غيابك", p: "يتحقق تقدّم محدود خارج الاتصال بكفاءةٍ أقل. الغرض منه دفعة خفيفة—not بديلًا عن اللعب النشط." },
        { t: "6) ملاحظات مهمّة", p: "قد تتغيّر/تتوقّف/تُعاد المعدّلات والحدود. ليست نصيحة مالية؛ لا قيمة مضمونة لـ MLEO." },
      ],
      cta: "ابدأ الآن",
      close: "إغلاق",
    },
    footer: { terms: "الشروط", privacy: "الخصوصية", docs: "المستندات" },
  },

  ru: {
    name: "Русский", dir: "ltr", code: "ru",
    new: "Новое", early: "Добро пожаловать ранним майнерам",
    heroH1_1: "Майни. Объединяй. Зарабатывай.",
    heroH1_2: "Добро пожаловать в MLEO Rush.",
    start: "НАЧАТЬ",
    how: "Как это работает",
    bullets: [
      "Честное, ограниченное дневное начисление",
      "Защита от злоупотреблений и мягкие лимиты",
      "Устанавливаемый PWA",
    ],
    slogans: [
      "Хотели бы майнить биткойн в первый день? Начните с MLEO уже сегодня.",
      "Тапай. Объединяй. Зарабатывай. Преврати игру в MLEO.",
      "От мема к машине — майнь будущее с Лео.",
      "Честная эмиссия. Реальная конкуренция. Чистое удовольствие.",
      "Без газа и суеты (демо). Просто майни и продвигайся.",
      "Присоединяйся к ранним майнерам. Забери свою долю эпохи MLEO.",
    ],
    modal: {
      title: "Как начисляется MLEO",
      sections: [
        { t: "1) Что вы реально получаете", p: "MLEO — утилитарный токен, заработанный в игре. Подходящие игровые результаты могут конвертироваться в MLEO. Ставки переменные для честности и стабильности." },
        { t: "2) Конвертация (в общих чертах)", p: "Засчитываются только некоторые действия. Точные формулы не публичны и могут меняться." },
        { t: "3) Суточный диапазон и честность", p: "Начисление плавно снижается при приближении к личному дневному диапазону, чтобы предотвратить злоупотребления." },
        { t: "4) Хранилище и CLAIM", p: "Баланс можно забрать (CLAIM) в внутриигровой Vault. Если ончейн-вывод откроется позже, возможны дополнительные окна разблокировки и проверки." },
        { t: "5) В ваше отсутствие", p: "Ограниченный офлайн-прогресс с пониженной эффективностью." },
        { t: "6) Важное", p: "Доступность, ставки и лимиты могут изменяться/приостанавливаться/сбрасываться. Не финсовет; у MLEO нет гарантированной стоимости." },
      ],
      cta: "НАЧАТЬ",
      close: "Закрыть",
    },
    footer: { terms: "Условия", privacy: "Конфиденциальность", docs: "Документация" },
  },

  es: {
    name: "Español", dir: "ltr", code: "es",
    new: "Nuevo", early: "Bienvenidos los primeros mineros",
    heroH1_1: "Minar. Fusionar. Ganar.",
    heroH1_2: "Bienvenido a la fiebre MLEO.",
    start: "EMPEZAR",
    how: "Cómo funciona",
    bullets: [
      "Acumulación diaria justa con límite",
      "Anti-abuso y límites graduales",
      "PWA instalable",
    ],
    slogans: [
      "¿Ojalá hubieras minado Bitcoin el día uno? Empieza con MLEO hoy.",
      "Toca. Funde. Gana. Convierte tu juego en MLEO.",
      "Del meme a la máquina — mina el futuro con Leo.",
      "Emisión justa. Competencia real. Diversión pura.",
      "Sin gas ni líos (demo). Solo mina y sube.",
      "Únete a los primeros mineros. Reclama tu parte de la era MLEO.",
    ],
    modal: {
      title: "Cómo se acumula MLEO",
      sections: [
        { t: "1) Lo que realmente ganas", p: "MLEO es un token utilitario ganado jugando. Ciertos resultados elegibles pueden convertirse en MLEO. Las tasas son variables por equidad y estabilidad." },
        { t: "2) Conversión (alto nivel)", p: "Solo cuentan acciones específicas. Las fórmulas exactas no son públicas y pueden cambiar." },
        { t: "3) Rango diario y equidad", p: "La acumulación se atenúa gradualmente al acercarte a tu rango diario personal para evitar abusos." },
        { t: "4) Bóveda y «CLAIM»", p: "Puedes RECLAMAR el saldo a tu Bóveda en la app. Si se abre el claim on-chain, puede tener ventanas y requisitos extra." },
        { t: "5) Cuando estás ausente", p: "Progreso limitado offline con eficiencia reducida." },
        { t: "6) Notas importantes", p: "Disponibilidad, tasas y topes pueden cambiarse/pausarse/restablecerse. No es asesoría financiera; MLEO no tiene valor garantizado." },
      ],
      cta: "EMPEZAR",
      close: "Cerrar",
    },
    footer: { terms: "Términos", privacy: "Privacidad", docs: "Docs" },
  },

  fr: {
    name: "Français", dir: "ltr", code: "fr",
    new: "Nouveau", early: "Bienvenue aux premiers mineurs",
    heroH1_1: "Miner. Fusionner. Gagner.",
    heroH1_2: "Bienvenue dans la ruée MLEO.",
    start: "COMMENCER",
    how: "Comment ça marche",
    bullets: [
      "Accumulation quotidienne équitable et plafonnée",
      "Anti-abus & limites progressives",
      "PWA installable",
    ],
    slogans: [
      "Vous auriez voulu miner le Bitcoin dès le premier jour ? Commencez avec MLEO aujourd’hui.",
      "Tapez. Fusionnez. Gagnez. Transformez votre jeu en MLEO.",
      "Du mème à la machine — minez le futur avec Leo.",
      "Émission équitable. Vraie compétition. Plaisir pur.",
      "Sans gas ni prise de tête (démo). Minez et progressez.",
      "Rejoignez les premiers mineurs. Réclamez votre part de l’ère MLEO.",
    ],
    modal: {
      title: "Comment s’accumule MLEO",
      sections: [
        { t: "1) Ce que vous gagnez vraiment", p: "MLEO est un jeton utilitaire gagné en jouant. Certains résultats éligibles peuvent se convertir en MLEO. Les taux sont variables pour l’équité et la stabilité." },
        { t: "2) Conversion (vue d’ensemble)", p: "Seules des actions spécifiques sont prises en compte. Les formules exactes ne sont pas publiques et peuvent évoluer." },
        { t: "3) Plage quotidienne & équité", p: "L’accumulation diminue progressivement à l’approche de votre plage quotidienne afin d’éviter les abus." },
        { t: "4) Coffre & « CLAIM »", p: "Vous pouvez REVENDIQUER votre solde dans votre coffre in-app. Si un claim on-chain ouvre plus tard, des fenêtres de déblocage et vérifications peuvent s’appliquer." },
        { t: "5) Quand vous êtes absent", p: "Un progrès hors-ligne limité à efficacité réduite." },
        { t: "6) Notes importantes", p: "Disponibilité, taux et plafonds peuvent changer/pauser/réinitialiser. Pas un conseil financier ; MLEO n’a pas de valeur garantie." },
      ],
      cta: "COMMENCER",
      close: "Fermer",
    },
    footer: { terms: "Conditions", privacy: "Confidentialité", docs: "Docs" },
  },

  de: {
    name: "Deutsch", dir: "ltr", code: "de",
    new: "Neu", early: "Frühe Miner willkommen",
    heroH1_1: "Minen. Kombinieren. Verdienen.",
    heroH1_2: "Willkommen beim MLEO-Rush.",
    start: "JETZT STARTEN",
    how: "So funktioniert es",
    bullets: [
      "Faire, gedeckelte tägliche Akkumulation",
      "Missbrauchsschutz & weiche Limits",
      "Installierbare PWA",
    ],
    slogans: [
      "Gewünscht, am ersten Tag Bitcoin gemined zu haben? Starte heute mit MLEO.",
      "Tippen. Kombinieren. Verdienen. Mach dein Spiel zu MLEO.",
      "Vom Meme zur Maschine — mine die Zukunft mit Leo.",
      "Faire Emission. Echter Wettbewerb. Reiner Spaß.",
      "Ohne Gas, ohne Stress (Demo). Einfach minen und aufsteigen.",
      "Schließe dich den frühen Minern an. Hol dir deinen Anteil der MLEO-Ära.",
    ],
    modal: {
      title: "So entsteht dein MLEO-Zuwachs",
      sections: [
        { t: "1) Was du wirklich erhältst", p: "MLEO ist ein Utility-Token, der durchs Spielen entsteht. Geeignete Spielereignisse können in MLEO umgewandelt werden. Raten sind variabel für Fairness und Stabilität." },
        { t: "2) Umrechnung (High-Level)", p: "Nur bestimmte Aktionen zählen. Exakte Formeln sind nicht öffentlich und können sich ändern." },
        { t: "3) Tageskorridor & Fairness", p: "Die Zunahme flacht ab, je näher du deinem persönlichen Tageskorridor kommst, um Missbrauch zu verhindern." },
        { t: "4) Vault & „CLAIM“", p: "Du kannst dein Guthaben in deinen In-App-Vault CLAIMen. On-Chain-Claims könnten später zusätzliche Freischaltfenster und Prüfungen haben." },
        { t: "5) In deiner Abwesenheit", p: "Begrenzter Offline-Fortschritt mit reduzierter Effizienz." },
        { t: "6) Wichtige Hinweise", p: "Verfügbarkeit, Raten und Limits können sich ändern/pausieren/zurücksetzen. Keine Finanzberatung; MLEO hat keinen garantierten Wert." },
      ],
      cta: "JETZT STARTEN",
      close: "Schließen",
    },
    footer: { terms: "Bedingungen", privacy: "Datenschutz", docs: "Doku" },
  },

pt: {
  name: "Português", dir: "ltr", code: "pt",
  new: "Novo", early: "Bem-vindos, mineradores iniciais",
  heroH1_1: "Minerar. Mesclar. Ganhar.",
  heroH1_2: "Bem-vindo à corrida MLEO.",
  start: "COMEÇAR AGORA",
  how: "Como funciona",
  bullets: [
    "Acúmulo diário justo e com teto",
    "Antiabuso e limites suaves",
    "PWA instalável",
  ],
  slogans: [
    "Queria ter minerado Bitcoin no primeiro dia? Comece com o MLEO hoje.",
    "Toque. Una. Ganhe. Transforme seu jogo em MLEO.",
    "Do meme à máquina — mine o futuro com o Leo.",
    "Emissão justa. Competição real. Diversão pura.",
    "Sem gas e sem complicação (demo). É só minerar e subir.",
    "Junte-se aos primeiros mineradores. Garanta sua parte na era MLEO.",
  ],
  modal: {
    title: "Como o MLEO é acumulado",
    sections: [
      { t: "1) O que você realmente ganha", p: "MLEO é um token utilitário obtido jogando. Resultados elegíveis no jogo podem se converter em MLEO. As taxas são variáveis para garantir justiça e estabilidade." },
      { t: "2) Conversão (visão geral)", p: "Apenas ações específicas contam. As fórmulas exatas não são públicas e podem mudar." },
      { t: "3) Faixa diária e justiça", p: "O acúmulo diminui gradualmente à medida que você se aproxima da sua faixa diária pessoal, para evitar abuso e manter um ritmo saudável." },
      { t: "4) Cofre e CLAIM", p: "Seu saldo acumulado pode ser CLAIMado para o Cofre do app. Se o claim on-chain abrir no futuro, janelas e verificações adicionais podem se aplicar." },
      { t: "5) Quando você está ausente", p: "Progresso offline limitado pode acumular com eficiência reduzida." },
      { t: "6) Observações importantes", p: "Disponibilidade, taxas e tetos podem mudar/pausar/reiniciar. Não é conselho financeiro; o MLEO não tem valor garantido." },
    ],
    cta: "COMEÇAR AGORA",
    close: "Fechar",
  },
  footer: { terms: "Termos", privacy: "Privacidade", docs: "Documentação" },
},


  zh: {
    name: "中文", dir: "ltr", code: "zh",
    new: "新", early: "欢迎早期矿工",
    heroH1_1: "挖矿·合成·赚取",
    heroH1_2: "欢迎来到 MLEO 热潮。",
    start: "立即开始",
    how: "如何运作",
    bullets: [
      "公平且有上限的日积累",
      "反滥用与柔性限额",
      "可安装的 PWA",
    ],
    slogans: [
      "是否希望第一天就能挖比特币？现在就用 MLEO 开始。",
      "点按、合成、赚取。把你的玩法转化为 MLEO。",
      "从梗到引擎——与 Leo 一起开采未来。",
      "公平发行。真实竞争。纯粹乐趣。",
      "无 Gas、零麻烦（演示）。只管挖、一路升级。",
      "加入早期矿工。领取你在 MLEO 时代的份额。",
    ],
    modal: {
      title: "MLEO 积累机制",
      sections: [
        { t: "1) 你实际获得什么", p: "MLEO 是通过游戏获得的功能型代币。符合条件的游戏结果可能转换为 MLEO。为保证公平与稳定，转换率是可变的。" },
        { t: "2) 转换（高层概览）", p: "只有特定行为计入。具体公式不公开，且可能调整。" },
        { t: "3) 每日范围与公平", p: "当接近你的个人每日范围时，积累会逐步放缓，以防滥用并保持健康节奏。" },
        { t: "4) 保险库与领取", p: "你可将余额「领取」至应用内保险库。若日后开放上链领取，可能需额外解锁窗口与资格校验。" },
        { t: "5) 离线时", p: "有限的离线进度会以较低效率累计。" },
        { t: "6) 重要说明", p: "可用性、费率与上限可能变更/暂停/重置。非财务建议；MLEO 不保证具有货币价值。" },
      ],
      cta: "立即开始",
      close: "关闭",
    },
    footer: { terms: "条款", privacy: "隐私", docs: "文档" },
  },

  ja: {
    name: "日本語", dir: "ltr", code: "ja",
    new: "新着", early: "初期マイナー歓迎",
    heroH1_1: "採掘・マージ・アーン",
    heroH1_2: "MLEO ラッシュへようこそ。",
    start: "今すぐ開始",
    how: "仕組み",
    bullets: [
      "公平で上限のある日次蓄積",
      "不正対策とソフト上限",
      "インストール可能なPWA",
    ],
    slogans: [
      "初日からビットコインを採掘したかった？ いま MLEO で始めよう。",
      "タップ → マージ → アーン。遊びを MLEO に変える。",
      "ミームからマシンへ — Leo と未来を採掘。",
      "公正な発行。真の競争。純粋な楽しさ。",
      "ガス不要、面倒なし（デモ）。掘って、強くなるだけ。",
      "早期マイナーに参加しよう。MLEO 時代の取り分を手に。",
    ],
    modal: {
      title: "MLEO 蓄積の仕組み",
      sections: [
        { t: "1) 実際に得られるもの", p: "MLEO はプレイによって獲得するユーティリティトークンです。適格な結果が MLEO に変換されます。公平性と安定性のためレートは可変です。" },
        { t: "2) 変換（概要）", p: "特定のアクションのみが対象。正確な式は公開されず、変更される場合があります。" },
        { t: "3) 日次レンジと公平性", p: "個人の日次レンジに近づくほど蓄積は段階的に減速し、不正や過度な取得を防ぎます。" },
        { t: "4) Vault と CLAIM", p: "残高はアプリ内 Vault に「CLAIM」できます。将来オンチェーン請求が開く場合、追加のアンロックや審査が適用される可能性があります。" },
        { t: "5) 離席中", p: "限定的なオフライン進行が低効率で加算されます。" },
        { t: "6) 重要事項", p: "可用性・レート・上限は変更/一時停止/リセットされることがあります。投資助言ではなく、価値は保証されません。" },
      ],
      cta: "今すぐ開始",
      close: "閉じる",
    },
    footer: { terms: "利用規約", privacy: "プライバシー", docs: "ドキュメント" },
  },

  ko: {
    name: "한국어", dir: "ltr", code: "ko",
    new: "신규", early: "초기 채굴자 환영",
    heroH1_1: "채굴·합치기·획득",
    heroH1_2: "MLEO 러시에 오신 것을 환영합니다.",
    start: "지금 시작",
    how: "작동 방식",
    bullets: [
      "공정하고 상한이 있는 일일 적립",
      "남용 방지 및 소프트 제한",
      "설치 가능한 PWA",
    ],
    slogans: [
      "비트코인을 첫날부터 캤다면? 지금 MLEO로 시작하세요.",
      "탭하고, 합치고, 벌자. 플레이를 MLEO로 바꾸세요.",
      "밈에서 머신으로 — 레오와 함께 미래를 채굴.",
      "공정한 발행. 진짜 경쟁. 순수한 즐거움.",
      "가스도 번거로움도 없음(데모). 그냥 캐고 성장하세요.",
      "초기 채굴자에 합류하고 MLEO 시대의 몫을 가져가세요.",
    ],
    modal: {
      title: "MLEO 적립 방식",
      sections: [
        { t: "1) 실제로 얻는 것", p: "MLEO는 플레이를 통해 얻는 유틸리티 토큰입니다. 적격 결과가 MLEO로 전환될 수 있으며, 공정성과 안정성을 위해 비율은 가변적입니다." },
        { t: "2) 전환(개요)", p: "특정 행동만 인정됩니다. 정확한 공식은 비공개이며 변경될 수 있습니다." },
        { t: "3) 일일 범위와 공정성", p: "개인 일일 범위에 가까워질수록 적립은 점차 감소하여 남용을 방지합니다." },
        { t: "4) 금고와 CLAIM", p: "잔액은 앱 내 금고로 CLAIM할 수 있습니다. 나중에 온체인 청구가 열릴 경우 추가 잠금 해제 창과 검증이 적용될 수 있습니다." },
        { t: "5) 자리를 비웠을 때", p: "제한적인 오프라인 진행이 낮은 효율로 적립됩니다." },
        { t: "6) 중요", p: "가용성, 비율, 상한은 변경/일시중지/리셋될 수 있습니다. 재정 조언이 아니며, MLEO의 가치가 보장되지는 않습니다." },
      ],
      cta: "지금 시작",
      close: "닫기",
    },
    footer: { terms: "이용약관", privacy: "개인정보", docs: "문서" },
  },

  tr: {
    name: "Türkçe", dir: "ltr", code: "tr",
    new: "Yeni", early: "Erken madencilere hoş geldiniz",
    heroH1_1: "Kaz. Birleştir. Kazan.",
    heroH1_2: "MLEO heyecanına hoş geldin.",
    start: "HEMEN BAŞLA",
    how: "Nasıl çalışır",
    bullets: [
      "Adil, limitli günlük birikim",
      "Kötüye kullanıma karşı & yumuşak sınırlar",
      "Yüklenebilir PWA",
    ],
    slogans: [
      "Keşke ilk günden Bitcoin kazsaydım mı diyorsun? Bugün MLEO ile başla.",
      "Dokun. Birleştir. Kazan. Oyunun MLEO’ya dönsün.",
      "Memeden makineye — Leo ile geleceği kaz.",
      "Adil ihraç. Gerçek rekabet. Saf eğlence.",
      "Gas yok, dert yok (demo). Sadece kaz ve yüksel.",
      "Erken madencilere katıl, MLEO çağındaki payını al.",
    ],
    modal: {
      title: "MLEO birikimi nasıl işler",
      sections: [
        { t: "1) Gerçekte ne kazanırsın", p: "MLEO, oyunla kazanılan bir yardımcı tokendir. Uygun oyun sonuçları MLEO’ya dönüşebilir. Oranlar adalet ve istikrar için değişkendir." },
        { t: "2) Dönüşüm (üst düzey)", p: "Yalnızca belirli eylemler sayılır. Tam formüller açık değildir ve değişebilir." },
        { t: "3) Günlük aralık & adalet", p: "Kişisel günlük aralığına yaklaştıkça birikim kademe kademe azalır; suistimali önler." },
        { t: "4) Kasa & CLAIM", p: "Bakiyeni uygulama içi Kasana CLAIM edebilirsin. Zincir üstü talep açılırsa ek kilit açma pencereleri ve uygunluk kontrolleri olabilir." },
        { t: "5) Uzakken", p: "Sınırlı çevrimdışı ilerleme daha düşük verimle birikir." },
        { t: "6) Önemli notlar", p: "Kullanılabilirlik, oranlar ve limitler değişebilir/durdu­rulabilir/sıfırlanabilir. Finansal tavsiye değildir; MLEO’nun değeri garanti edilmez." },
      ],
      cta: "HEMEN BAŞLA",
      close: "Kapat",
    },
    footer: { terms: "Şartlar", privacy: "Gizlilik", docs: "Belgeler" },
  },

  it: {
    name: "Italiano", dir: "ltr", code: "it",
    new: "Nuovo", early: "Benvenuti i primi miner",
    heroH1_1: "Minare. Unire. Guadagnare.",
    heroH1_2: "Benvenuto nella corsa MLEO.",
    start: "INIZIA ORA",
    how: "Come funziona",
    bullets: [
      "Accrual giornaliero equo e con tetto",
      "Anti-abuso e limiti graduali",
      "PWA installabile",
    ],
    slogans: [
      "Avresti voluto minare Bitcoin dal primo giorno? Inizia oggi con MLEO.",
      "Tocca. Unisci. Guadagna. Trasforma il gioco in MLEO.",
      "Dal meme alla macchina — estrai il futuro con Leo.",
      "Emissione equa. Competizione reale. Divertimento puro.",
      "Niente gas, niente stress (demo). Mina e sali.",
      "Unisciti ai primi miner. Rivendica la tua parte dell’era MLEO.",
    ],
    modal: {
      title: "Come si accumula MLEO",
      sections: [
        { t: "1) Cosa guadagni davvero", p: "MLEO è un token di utilità guadagnato giocando. Esiti idonei possono convertirsi in MLEO. Le percentuali sono variabili per equità e stabilità." },
        { t: "2) Conversione (alto livello)", p: "Solo azioni specifiche contano. Le formule esatte non sono pubbliche e possono cambiare." },
        { t: "3) Gamma giornaliera & equità", p: "L’accumulo si attenua man mano che ti avvicini alla tua gamma giornaliera personale, prevenendo abusi." },
        { t: "4) Vault & CLAIM", p: "Puoi RICHIEDERE (CLAIM) il saldo nella tua Vault in-app. Se il claim on-chain aprirà, potranno esserci finestre di sblocco e controlli aggiuntivi." },
        { t: "5) Quando sei assente", p: "Avanzamento offline limitato con efficienza ridotta." },
        { t: "6) Note importanti", p: "Disponibilità, tassi e limiti possono cambiare/pausarsi/azzerarsi. Non è consulenza finanziaria; nessun valore garantito per MLEO." },
      ],
      cta: "INIZIA ORA",
      close: "Chiudi",
    },
    footer: { terms: "Termini", privacy: "Privacy", docs: "Documenti" },
  },

  ka: {
    name: "ქართული", dir: "ltr", code: "ka",
    new: "ახალი", early: "მოგესალმებით ადრეული მაინერები",
    heroH1_1: "მოპოვება. შერწყმა. მიღება.",
    heroH1_2: "კეთილი იყოს თქვენი მობრძანება MLEO ბუმში.",
    start: "დაიწყე ახლა",
    how: "როგორ მუშაობს",
    bullets: [
      "სამართლიანი, შეზღუდული დღიური დაგროვება",
      "ბოროტად გამოყენებისგან დაცვა & რბილი ლიმიტები",
      "დასაყენებელი PWA",
    ],
    slogans: [
      "სურდა პირველ დღესვე ბიტკოინის მაინინგი? დაიწყე ახლა MLEO-ით.",
      "დააჭირე. გააერთიანე. მოიპოვე. თამაში გადააქციე MLEO-დ.",
      "მიმიდან მანქანამდე — მოიპოვე მომავალი ლეოსთან.",
      "სამართლიანი ემისია. ნამდვილი კონკურენცია. სუფთა გართობა.",
      "გარეშე gas-ისა და სირთულეების (დემო). უბრალოდ მოპოვება და განვითარება.",
      "შეუერთდი ადრეულ მაინერებს. მიიღო შენი წილი MLEO-ს ეპოქიდან.",
    ],
    modal: {
      title: "როგორ გროვდება MLEO",
      sections: [
        { t: "1) რა რეალურად იღებ", p: "MLEO არის სასარგებლო ტოკენი, რომელიც გროვდება თამაშით. გარკვეული მოვლენები შეიძლება გადაიქცეს MLEO-დ. სიჩქარე ცვალებადია სამართლიანობისთვის." },
        { t: "2) კონვერტაცია (ზედახედი)", p: "მხოლოდ გარკვეული ქმედებები ითვლება. ზუსტი ფორმულები საჯარო არაა და შეიძლება შეიცვალოს." },
        { t: "3) დღიური დიაპაზონი & სამართლიანობა", p: "როცა უახლოვდები პირად დღიურ დიაპაზონს, დაგროვება ნელდება ბოროტად გამოყენების თავიდან ასაცილებლად." },
        { t: "4) Vault და CLAIM", p: "შეგიძლია CLAIM ბალანსი აპის საცავში. თუ ოდესმე გაიხსნება ონჩეინ გამოყვანა, შეიძლება დაემატოს უშვიათ ფანჯრები და შემოწმებები." },
        { t: "5) როცა ოფლაინ ხარ", p: "შეზღუდული პროგრესი გროვდება შემცირებული ეფექტიანობით." },
        { t: "6) მნიშვნელოვანია", p: "ხელმისაწვდომობა, სიჩქრე და ლიმიტები შეიძლება შეიცვალოს/შეჩერდეს/გადატვირთოს. არა ფინანსური რჩევა; ღირებულება გარანტირებული არაა." },
      ],
      cta: "დაიწყე ახლა",
      close: "დახურვა",
    },
    footer: { terms: "პირობები", privacy: "კონფიდენციალურობა", docs: "დოკუმენტები" },
  },

  pl: {
    name: "Polski", dir: "ltr", code: "pl",
    new: "Nowość", early: "Witamy wczesnych górników",
    heroH1_1: "Kop. Łącz. Zarabiaj.",
    heroH1_2: "Witamy w gorączce MLEO.",
    start: "ZACZNIJ TERAZ",
    how: "Jak to działa",
    bullets: [
      "Uczciwe, ograniczone dzienne naliczanie",
      "Ochrona przed nadużyciami i miękkie limity",
      "Instalowalne PWA",
    ],
    slogans: [
      "Chciałbyś kopać Bitcoina od pierwszego dnia? Zacznij dziś z MLEO.",
      "Klikaj. Łącz. Zarabiaj. Zamień grę w MLEO.",
      "Od mema do maszyny — kop przyszłość z Leo.",
      "Uczciwa emisja. Prawdziwa rywalizacja. Czysta zabawa.",
      "Bez gasu i problemów (demo). Po prostu kop i awansuj.",
      "Dołącz do wczesnych górników. Odbierz swój udział w erze MLEO.",
    ],
    modal: {
      title: "Jak nalicza się MLEO",
      sections: [
        { t: "1) Co faktycznie zyskujesz", p: "MLEO to token użytkowy zdobywany w grze. Kwalifikowane wyniki mogą zamieniać się na MLEO. Stawki są zmienne dla uczciwości i stabilności." },
        { t: "2) Konwersja (ogólnie)", p: "Liczą się tylko konkretne działania. Dokładne formuły nie są publiczne i mogą się zmieniać." },
        { t: "3) Dzienne widełki i fair play", p: "Naliczanie stopniowo maleje, gdy zbliżasz się do własnego dziennego limitu, by zapobiec nadużyciom." },
        { t: "4) Skarbiec i CLAIM", p: "Saldo można PRZENIEŚĆ (CLAIM) do skarbca w aplikacji. Jeśli kiedyś otworzą się wypłaty on-chain, mogą dojść okna odblokowań i weryfikacje." },
        { t: "5) Gdy jesteś offline", p: "Ograniczony postęp offline nalicza się z mniejszą wydajnością." },
        { t: "6) Ważne uwagi", p: "Dostępność, stawki i limity mogą ulec zmianie/wstrzymaniu/resetowi. To nie porada finansowa; MLEO nie ma gwarantowanej wartości." },
      ],
      cta: "ZACZNIJ TERAZ",
      close: "Zamknij",
    },
    footer: { terms: "Zasady", privacy: "Prywatność", docs: "Dokumenty" },
  },

  ro: {
    name: "Română", dir: "ltr", code: "ro",
    new: "Nou", early: "Bine ați venit, mineri timpurii",
    heroH1_1: "Minează. Unește. Câștigă.",
    heroH1_2: "Bun venit la goana MLEO.",
    start: "ÎNCEPE ACUM",
    how: "Cum funcționează",
    bullets: [
      "Acumulare zilnică echitabilă și plafonată",
      "Anti-abuz și limite graduale",
      "PWA instalabil",
    ],
    slogans: [
      "Ți-ai fi dorit să minezi Bitcoin din prima zi? Începe azi cu MLEO.",
      "Atinge. Unește. Câștigă. Transformă jocul în MLEO.",
      "De la meme la mașină — minează viitorul cu Leo.",
      "Emisie echitabilă. Competiție reală. Distracție pură.",
      "Fără gas, fără bătăi de cap (demo). Doar minează și evoluează.",
      "Alătură-te minerilor timpurii. Reclamă-ți partea din era MLEO.",
    ],
    modal: {
      title: "Cum se acumulează MLEO",
      sections: [
        { t: "1) Ce câștigi de fapt", p: "MLEO este un token utilitar câștigat prin joc. Rezultatele eligibile se prizePool converti în MLEO. Ratele sunt variabile pentru echitate și stabilitate." },
        { t: "2) Conversie (nivel înalt)", p: "Numai anumite acțiuni se califică. Formulele exacte nu sunt publice și prizePool fi schimbate." },
        { t: "3) Plajă zilnică & echitate", p: "Pe măsură ce te apropii de plaja ta zilnică, acumularea scade treptat pentru a preveni abuzurile." },
        { t: "4) Vault & CLAIM", p: "Poți CREA (CLAIM) soldul în Vault-ul din aplicație. Dacă se deschide claim on-chain, prizePool exista ferestre de deblocare și verificări." },
        { t: "5) Când ești plecat", p: "Progres offline limitat la o eficiență redusă." },
        { t: "6) Note importante", p: "Disponibilitatea, ratele și plafoanele se prizePool schimba/opri/reseta. Nu este sfat financiar; valoarea MLEO nu este garantată." },
      ],
      cta: "ÎNCEPE ACUM",
      close: "Închide",
    },
    footer: { terms: "Termeni", privacy: "Confidențialitate", docs: "Documentație" },
  },

  cs: {
    name: "Čeština", dir: "ltr", code: "cs",
    new: "Nové", early: "Vítejte, raní těžaři",
    heroH1_1: "Těž. Spojuj. Vydělávej.",
    heroH1_2: "Vítej v MLEO horečce.",
    start: "ZAČÍT TEĎ",
    how: "Jak to funguje",
    bullets: [
      "Fair, limitované denní připisování",
      "Ochrana proti zneužití a měkké limity",
      "Instalovatelná PWA",
    ],
    slogans: [
      "Přáli byste si těžit Bitcoin hned první den? Začněte dnes s MLEO.",
      "Klepni. Spoj. Vydělávej. Proměň hru v MLEO.",
      "Od memu k stroji — těž budoucnost s Leem.",
      "Spravedlivá emise. Skutečná konkurence. Čistá zábava.",
      "Bez gasu, bez starostí (demo). Jen těž a postupuj.",
      "Přidej se k raným těžařům. Získej svůj podíl éry MLEO.",
    ],
    modal: {
      title: "Jak se připisuje MLEO",
      sections: [
        { t: "1) Co opravdu získáš", p: "MLEO je užitkový token získaný hraním. Vybrané výsledky se mohou převést na MLEO. Sazby jsou proměnlivé kvůli férovosti a stabilitě." },
        { t: "2) Konverze (vysoká úroveň)", p: "Počítají se jen konkrétní akce. Přesné vzorce nejsou veřejné a mohou se měnit." },
        { t: "3) Denní rozsah & férovost", p: "Jakmile se blížíš svému dennímu rozsahu, připisování se pozvolna snižuje, aby se zabránilo zneužití." },
        { t: "4) Trezor & CLAIM", p: "Zůstatek lze CLAIMnout do trezoru v aplikaci. U on-chain claimu mohou později platit další okna a kontroly." },
        { t: "5) Když nejsi u hry", p: "Omezený offline postup s nižší efektivitou." },
        { t: "6) Důležité", p: "Dostupnost, sazby a limity se mohou měnit/pozastavit/resetovat. Nejedná se o finanční poradenství; MLEO nemá zaručenou hodnotu." },
      ],
      cta: "ZAČÍT TEĎ",
      close: "Zavřít",
    },
    footer: { terms: "Podmínky", privacy: "Soukromí", docs: "Dokumentace" },
  },

  nl: {
    name: "Nederlands", dir: "ltr", code: "nl",
    new: "Nieuw", early: "Vroege miners welkom",
    heroH1_1: "Minen. Mergen. Verdienen.",
    heroH1_2: "Welkom bij de MLEO-rush.",
    start: "NU STARTEN",
    how: "Hoe het werkt",
    bullets: [
      "Eerlijke, begrensde dagelijkse opbouw",
      "Anti-misbruik & zachte limieten",
      "Installeerbare PWA",
    ],
    slogans: [
      "Had je Bitcoin graag op dag één gemined? Begin vandaag met MLEO.",
      "Tik. Merge. Verdien. Maak van je spel MLEO.",
      "Van meme naar machine — mijn de toekomst met Leo.",
      "Eerlijke emissie. Echte competitie. Pure fun.",
      "Geen gas, geen gedoe (demo). Gewoon minen en stijgen.",
      "Sluit je aan bij de early miners. Claim jouw deel van het MLEO-tijdperk.",
    ],
    modal: {
      title: "Zo bouw je MLEO op",
      sections: [
        { t: "1) Wat je echt verdient", p: "MLEO is een utility-token dat je via spelen verdient. Geschikte resultaten kunnen worden omgezet in MLEO. Tarieven variëren voor eerlijkheid en stabiliteit." },
        { t: "2) Conversie (hoog niveau)", p: "Alleen specifieke acties tellen mee. Exacte formules zijn niet openbaar en kunnen wijzigen." },
        { t: "3) Dagelijkse bandbreedte & eerlijkheid", p: "Opbouw neemt geleidelijk af naarmate je je persoonlijke dagelijkse bereik nadert, om misbruik te voorkomen." },
        { t: "4) Kluis & CLAIM", p: "Je saldo kun je CLAIMen naar je kluis in de app. Mocht on-chain claimen later openen, dan kunnen extra unlock-vensters en checks gelden." },
        { t: "5) Als je weg bent", p: "Beperkte offline voortgang met lagere efficiëntie." },
        { t: "6) Belangrijk", p: "Beschikbaarheid, tarieven en limieten kunnen wijzigen/pauseren/resetten. Geen financieel advies; MLEO heeft geen gegarandeerde waarde." },
      ],
      cta: "NU STARTEN",
      close: "Sluiten",
    },
    footer: { terms: "Voorwaarden", privacy: "Privacy", docs: "Docs" },
  },

  el: {
    name: "Ελληνικά", dir: "ltr", code: "el",
    new: "Νέο", early: "Καλωσορίζουμε τους πρώτους miners",
    heroH1_1: "Mining. Συνένωση. Κέρδος.",
    heroH1_2: "Καλώς ήρθες στο MLEO Rush.",
    start: "ΞΕΚΙΝΑ ΤΩΡΑ",
    how: "Πώς λειτουργεί",
    bullets: [
      "Δίκαιη, με όριο ημερήσια συσσώρευση",
      "Προστασία από κατάχρηση & ήπια όρια",
      "Εγκαταστάσιμη PWA",
    ],
    slogans: [
      "Θα ήθελες να έκανες mining Bitcoin από την πρώτη μέρα; Ξεκίνα σήμερα με το MLEO.",
      "Πάτησε. Συνένωσε. Κέρδισε. Μετέτρεψε το παιχνίδι σου σε MLEO.",
      "Από meme σε μηχανή — κάνε mining το μέλλον με τον Leo.",
      "Δίκαιη έκδοση. Πραγματικός ανταγωνισμός. Καθαρή διασκέδαση.",
      "Χωρίς gas, χωρίς μπέρδεμα (demo). Απλώς κάνε mining και ανέβα.",
      "Μπες στους πρώτους miners. Διεκδίκησε το μερίδιό σου στην εποχή MLEO.",
    ],
    modal: {
      title: "Πώς συσσωρεύεται το MLEO",
      sections: [
        { t: "1) Τι κερδίζεις πραγματικά", p: "Το MLEO είναι utility token που κερδίζεται μέσω παιχνιδιού. Κατάλληλα αποτελέσματα μπορεί να μετατραπούν σε MLEO. Τα ποσοστά είναι μεταβλητά για δικαιοσύνη και σταθερότητα." },
        { t: "2) Μετατροπή (σε υψηλό επίπεδο)", p: "Μόνο συγκεκριμένες ενέργειες μετρούν. Οι ακριβείς φόρμουλες δεν είναι δημόσιες και μπορεί να αλλάξουν." },
        { t: "3) Ημερήσιο εύρος & δικαιοσύνη", p: "Η συσσώρευση μειώνεται σταδιακά καθώς πλησιάζεις το προσωπικό σου ημερήσιο εύρος, για αποφυγή κατάχρησης." },
        { t: "4) Θησαυροφυλάκιο & CLAIM", p: "Μπορείς να ΚΑΝΕΙΣ CLAIM το υπόλοιπο στο in-app θησαυροφυλάκιο. Αν ανοίξει on-chain claim, ενδέχεται να υπάρχουν επιπλέον παράθυρα και έλεγχοι." },
        { t: "5) Όταν λείπεις", p: "Περιορισμένη offline πρόοδος με χαμηλότερη απόδοση." },
        { t: "6) Σημαντικά", p: "Διαθεσιμότητα, ποσοστά και όρια μπορεί να αλλάξουν/παγώσουν/μηδενιστούν. Όχι οικονομική συμβουλή· δεν υπάρχει εγγυημένη αξία για το MLEO." },
      ],
      cta: "ΞΕΚΙΝΑ ΤΩΡΑ",
      close: "Κλείσιμο",
    },
    footer: { terms: "Όροι", privacy: "Απόρρητο", docs: "Έγγραφα" },
  },

he: {
  name: "עברית", dir: "rtl", code: "he",
  new: "חדש", early: "ברוכים הבאים לכורים הראשונים",
  heroH1_1: "כרה. איחד. הרווח.",
  heroH1_2: "ברוכים הבאים ל־MLEO Rush.",
  start: "התחל עכשיו",
  how: "איך זה עובד",
  bullets: [
    "צבירה יומית הוגנת ומוגבלת",
    "מניעת ניצול ומגבלות רכות",
    "אפליקציית PWA ניתנת להתקנה",
  ],
  slogans: [
    "רצית לכרות ביטקוין כבר ביום הראשון? התחל היום עם MLEO.",
    "הקש. איחד. הרווח. הפוך את המשחק ל־MLEO.",
    "מהמם למכונה — כורים את העתיד עם Leo.",
    "הנפקה הוגנת. תחרות אמיתית. כיף טהור.",
    "בלי Gas ובלי בלאגן (דמו). רק לכרות ולהתקדם.",
    "הצטרף לכורים המוקדמים. קבל את החלק שלך בעידן MLEO.",
  ],
  modal: {
    title: "איך עובדת צבירת ה־MLEO",
    sections: [
      { t: "1) מה באמת מרוויחים", p: "‏MLEO הוא טוקן שימושי שנצבר דרך המשחק. תוצאות משחק כשירות עשויות להתמיר ל־MLEO. שיעורי ההמרה משתנים לטובת הוגנות ויציבות." },
      { t: "2) המרה (בגדול)", p: "רק פעולות מסוימות נספרות. הנוסחאות המדויקות אינן פומביות ועלולות להשתנות." },
      { t: "3) טווח יומי והוגנות", p: "הצבירה נחלשת בהדרגה ככל שמתקרבים לטווח היומי האישי, כדי למנוע ניצול ולשמור קצב בריא." },
      { t: "4) Vault ו־CLAIM", p: "אפשר לבצע CLAIM ליתרה אל ה־Vault בתוך האפליקציה. אם ייפתח בהמשך Claim על השרשרת, עשויות לחול חלונות פתיחה ובדיקות זכאות נוספות." },
      { t: "5) כשאתה לא בסביבה", p: "יש התקדמות מוגבלת גם כשהאפליקציה סגורה, ביעילות מופחתת." },
      { t: "6) חשוב לדעת", p: "זמינות, שיעורים ותקרות עשויים להשתנות/להיעצר/להתאפס. לא ייעוץ פיננסי; ל־MLEO אין ערך מובטח." },
    ],
    cta: "התחל עכשיו",
    close: "סגור",
  },
  footer: { terms: "תנאים", privacy: "פרטיות", docs: "מסמכים" },
},


};

// ===== Flags =====
const FLAGS = {
  en: "🇺🇸",
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
  he: "🇮🇱",
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
function LanguageSelector({ lang, setLang }) {
  const [isOpen, setIsOpen] = useState(false);
  
  
  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-2 rounded-xl bg-white/10 border border-white/20 hover:bg-white/15 transition text-sm flex items-center gap-2"
        style={{ fontFamily: "system-ui, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol" }}
      >
        <span className="mr-1">{FLAGS[lang] || '🌐'}</span>
        <span>{TEXT[lang].name}</span>
        <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {isOpen && createPortal(
        <>
          <div 
            className="fixed inset-0 bg-black/20"
            style={{ zIndex: 2147483646 }}
            onClick={() => setIsOpen(false)} 
          />
          <div 
            className="fixed right-4 top-16 w-52 bg-gray-900 border border-white/20 rounded-xl shadow-2xl overflow-hidden max-h-[400px] overflow-y-auto"
            style={{ 
              fontFamily: "system-ui, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol",
              backdropFilter: "blur(10px)",
              backgroundColor: "rgba(17, 24, 39, 0.95)",
              zIndex: 2147483647
            }}
          >
            {ALL.map(opt => (
              <button
                key={opt.code}
                onClick={() => {
                  setLang(opt.code);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-3 text-left hover:bg-white/15 transition flex items-center gap-3 text-sm ${
                  lang === opt.code ? 'bg-white/25 font-bold' : ''
                }`}
              >
                <span className="text-lg mr-2">{FLAGS[opt.code] || '🌐'}</span>
                <span>{TEXT[opt.code].name}</span>
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

export default function Home() {
  const [lang, setLang] = useState("en");
  const [mounted, setMounted] = useState(false);
  const [idx, setIdx] = useState(0);
  const [showHow, setShowHow] = useState(false);
const router = useRouter();
const [showAuth, setShowAuth] = useState(false);
const [policyModal, setPolicyModal] = useState(null); // 'terms', 'privacy', 'cookies', 'risk', or null


  useEffect(() => {
    setMounted(true);
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

  useEffect(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % (TEXT[lang]?.slogans?.length || 1)), 2800);
    return () => clearInterval(id);
  }, [lang]);

  const t = useMemo(() => TEXT[lang] || TEXT.en, [lang]);
  const dir = t.dir || "ltr";

  return (
    <>
      <Head>
        <title>MLEO — Mine. Merge. Earn.</title>
        <meta name="description" content="MLEO is a playful crypto-mining experience." />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0b0b0d" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="MLEO" />
        <link rel="apple-touch-icon" href="/icons/pwa-192.png" />
      </Head>

      {/* BACKGROUND */}
      <main
        className="min-h-[var(--app-100vh,100vh)] relative overflow-hidden bg-[#0b0b0d] text-white"
        dir={dir}
      >
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-1/3 -left-1/4 w-[70vw] h-[70vw] rounded-full blur-3xl opacity-30"
               style={{ background: "radial-gradient(50% 50% at 50% 50%, #a855f7 0%, rgba(168,85,247,0) 70%)" }} />
          <div className="absolute -bottom-1/3 -right-1/4 w-[70vw] h-[70vw] rounded-full blur-3xl opacity-30"
               style={{ background: "radial-gradient(50% 50% at 50% 50%, #f59e0b 0%, rgba(245,158,11,0) 70%)" }} />
          <div className="absolute inset-0"
               style={{ background: "radial-gradient(1000px 600px at 50% -200px, rgba(250,204,21,.08), transparent)" }} />
        </div>

        {/* NAV — compact on mobile */}
        <header className="relative z-10 max-w-6xl mx-auto px-4 pt-4 md:px-5 md:pt-6 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <img src="/images/leo-coin-gold.png" alt="MLEO" className="w-9 h-9 md:w-10 md:h-10 shrink-0 rounded-full object-contain" />
            <span className="text-lg md:text-xl font-bold tracking-wide truncate">MLEO</span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* Language select */}
            <LanguageSelector lang={lang} setLang={setLang} />

            <PWAInstall />

            <button
              onClick={async () => {
                try {
                  const remember = typeof window !== "undefined"
                    ? window.localStorage?.getItem("mleo_remember_me")
                    : "true";
                  const { data } = await supabaseMP.auth.getSession();
                  if (data?.session && remember !== "false") {
                    router.push(GAME_ENTRY_URL);
                    return;
                  }
                } catch {}
                setShowAuth(true);
              }}
              className="hidden sm:inline-flex px-3 py-2 rounded-xl bg-yellow-400 text-black font-bold hover:bg-yellow-300 transition text-sm"
            >
              {t.start}
            </button>

          </div>
        </header>

        {/* HERO + VIDEO — mobile: single column, order = hero → CTA → video → bullets; md+: two columns */}
        <section className="relative z-10 max-w-6xl mx-auto px-4 pt-4 pb-6 md:px-5 md:pt-16 md:pb-28 grid grid-cols-1 md:grid-cols-2 md:gap-10 md:items-start">
          <div className="flex flex-col gap-2.5 md:gap-6 min-w-0">
            <div>
              <div className="inline-flex items-center gap-1.5 md:gap-2 px-2.5 py-0.5 md:px-3 md:py-1 rounded-full bg-white/10 border border-white/10 text-[11px] md:text-xs mb-3 md:mb-5">
                <span>{t.new}</span><span className="opacity-60">{t.early}</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.08] sm:leading-tight">
                {t.heroH1_1}<br /><span className="text-yellow-400">{t.heroH1_2}</span>
              </h1>

              <p className="mt-3 md:mt-5 text-sm sm:text-base md:text-lg text-white/85 max-w-xl min-h-0 sm:min-h-[2.75rem] leading-snug">
                {(t.slogans && t.slogans[idx]) || ""}
              </p>
            </div>

            <div className={`flex ${dir === "rtl" ? "flex-col sm:flex-row-reverse" : "flex-col sm:flex-row"} gap-2.5 md:gap-3`}>
              <button
                onClick={async () => {
                  try {
                    const remember = typeof window !== "undefined"
                      ? window.localStorage?.getItem("mleo_remember_me")
                      : "true";
                    const { data } = await supabaseMP.auth.getSession();
                    if (data?.session && remember !== "false") {
                      router.push(GAME_ENTRY_URL);
                      return;
                    }
                  } catch {}
                  setShowAuth(true);
                }}
                className="px-6 py-2.5 md:py-3 rounded-xl bg-yellow-400 text-black font-bold hover:bg-yellow-300 transition text-[15px] md:text-base shadow-md shadow-yellow-400/10"
              >
                {t.start}
              </button>
              <button
                onClick={() => setShowHow(true)}
                className="px-6 py-2.5 md:py-3 rounded-2xl border border-white/20 font-semibold hover:bg-white/5 transition text-center text-[15px] md:text-base"
              >
                {t.how}
              </button>
            </div>

            {/* Bullets — desktop / tablet only (same layout as before) */}
            <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 gap-3 text-sm text-white/70">
              {t.bullets.map((b, i) => (
                <div key={i} className="p-3 rounded-xl bg-white/5 border border-white/10">{b}</div>
              ))}
            </div>
          </div>

          {/* VIDEO — main visual anchor; follows CTAs on mobile */}
          <div className="relative mt-1 md:mt-0">
            <div className="absolute -inset-4 md:-inset-6 rounded-[24px] md:rounded-[32px] bg-yellow-400/10 blur-2xl md:blur-3xl" />
            <div className="relative rounded-2xl md:rounded-3xl border border-white/10 bg-white/5 p-2.5 md:p-3 shadow-xl backdrop-blur overflow-hidden">
              <video
                autoPlay
                loop
                muted
                playsInline
                poster="/images/mleo-hero-preview.png"
                className="w-full max-h-[min(220px,38vh)] sm:max-h-[min(260px,42vh)] md:max-h-[min(300px,48vh)] h-auto rounded-xl md:rounded-2xl object-cover object-center"
                src="/videos/intro.mp4"
              />
            </div>
          </div>

          {/* Bullets — mobile: compact stack below video */}
          <div className="md:hidden mt-4 flex flex-col gap-1.5 text-[11px] leading-tight text-white/75">
            {t.bullets.map((b, i) => (
              <div
                key={i}
                className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-white/[0.06] border border-white/10"
              >
                <span className="mt-0.5 shrink-0 text-emerald-400/90" aria-hidden>✓</span>
                <span>{b}</span>
              </div>
            ))}
          </div>
        </section>

        {/* FOOTER — compact on mobile; policy links first on small screens so they stay in view */}
        <footer className="relative z-10 max-w-6xl mx-auto px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-5 md:pb-10 text-xs text-white/50">
          <div className="flex flex-col-reverse sm:flex-row items-start sm:items-center gap-2.5 sm:gap-6 justify-between">
            <div className="shrink-0">© {new Date().getFullYear()} MLEO. All rights reserved.</div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 sm:gap-x-4">
              <button type="button" onClick={() => setPolicyModal("terms")} className="hover:text-white/80">
                {t.footer.terms}
              </button>
              <button type="button" onClick={() => setPolicyModal("privacy")} className="hover:text-white/80">
                {t.footer.privacy}
              </button>
              <button type="button" onClick={() => setPolicyModal("cookies")} className="hover:text-white/80">
                Cookies
              </button>
              <button type="button" onClick={() => setPolicyModal("risk")} className="hover:text-white/80">
                Risk
              </button>
            </div>
          </div>
        </footer>
      </main>

      {/* HOW IT WORKS modal via Portal */}
      {showHow && mounted && createPortal(
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur"
          style={{
            zIndex: 10050,
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 6vh)",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 2vh)",
          }}
          role="dialog"
          aria-modal="true"
          dir={dir}
        >
          <div className="mx-auto max-w-2xl w-[92%] max-h-[88vh] overflow-auto bg-neutral-900 text-white rounded-2xl border border-white/10 shadow-2xl relative">
            {/* Sticky header */}
            <div className="sticky top-0 z-10 bg-neutral-900/95 backdrop-blur p-4 border-b border-white/10 rounded-t-2xl flex items-center justify-between">
              <h2 className="text-2xl font-bold">{t.modal.title}</h2>
              <button
                onClick={() => setShowHow(false)}
                className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20"
                aria-label="Close"
                title={t.modal.close}
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm text-white/80">
              {t.modal.sections.map((sec, i) => (
                <section key={i}>
                  <h3 className="font-semibold text-white mb-1">{sec.t}</h3>
                  <p>{sec.p}</p>
                </section>
              ))}
            </div>

            <div className={`px-6 pb-6 flex ${dir==='rtl' ? 'justify-start' : 'justify-end'}`}>
              <Link
                href={GAME_ENTRY_URL}
                className="px-5 py-2 rounded-xl bg-yellow-400 text-black font-extrabold hover:bg-yellow-300 transition"
                onClick={() => setShowHow(false)}
              >
                {t.modal.cta}
              </Link>
            </div>
          </div>
        </div>,
        document.body
      )}
      {showAuth && (
        <AuthEmailPassword
          onSuccess={() => router.push(GAME_ENTRY_URL)}
          onClose={() => setShowAuth(false)}
        />
      )}

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

    </>
  );
}
