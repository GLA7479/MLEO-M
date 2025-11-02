// pages/index.js
import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import PWAInstall from "../components/PWAInstall";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";
const EmailTermsGate = dynamic(() => import("../components/EmailTermsGate"), { ssr: false });



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
        { t: "1) Ce câștigi de fapt", p: "MLEO este un token utilitar câștigat prin joc. Rezultatele eligibile se pot converti în MLEO. Ratele sunt variabile pentru echitate și stabilitate." },
        { t: "2) Conversie (nivel înalt)", p: "Numai anumite acțiuni se califică. Formulele exacte nu sunt publice și pot fi schimbate." },
        { t: "3) Plajă zilnică & echitate", p: "Pe măsură ce te apropii de plaja ta zilnică, acumularea scade treptat pentru a preveni abuzurile." },
        { t: "4) Vault & CLAIM", p: "Poți CREA (CLAIM) soldul în Vault-ul din aplicație. Dacă se deschide claim on-chain, pot exista ferestre de deblocare și verificări." },
        { t: "5) Când ești plecat", p: "Progres offline limitat la o eficiență redusă." },
        { t: "6) Note importante", p: "Disponibilitatea, ratele și plafoanele se pot schimba/opri/reseta. Nu este sfat financiar; valoarea MLEO nu este garantată." },
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
  
  
  // Debug: check if flags are loading
  console.log('Current lang:', lang, 'Flag:', FLAGS[lang]);
  
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
const [showGate, setShowGate] = useState(false);


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

        {/* NAV */}
        <header className="relative z-10 max-w-6xl mx-auto px-5 pt-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/images/leo-coin-gold.png" alt="MLEO" className="w-10 h-10 rounded-full object-contain" />
            <span className="text-xl font-bold tracking-wide">MLEO</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Language select */}
            <LanguageSelector lang={lang} setLang={setLang} />

            <PWAInstall />

            <button
  onClick={() => setShowGate(true)}
  className="hidden sm:inline-flex px-3 py-2 rounded-xl bg-yellow-400 text-black font-bold hover:bg-yellow-300 transition text-sm"
>
  {t.start}
</button>

          </div>
        </header>

        {/* HERO */}
        <section className="relative z-10 max-w-6xl mx-auto px-5 pt-10 pb-20 sm:pt-16 sm:pb-28 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-xs mb-5">
              <span>{t.new}</span><span className="opacity-60">{t.early}</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight">
              {t.heroH1_1}<br /><span className="text-yellow-400">{t.heroH1_2}</span>
            </h1>

            <p className="mt-5 text-base sm:text-lg text-white/80 max-w-xl">
              {(t.slogans && t.slogans[idx]) || ""}
            </p>

            <div className={`mt-8 flex ${dir==='rtl' ? 'flex-col sm:flex-row-reverse' : 'flex-col sm:flex-row'} gap-3`}>
<button
  onClick={() => setShowGate(true)}
  className="px-6 py-3 rounded-xl bg-yellow-400 text-black font-bold hover:bg-yellow-300 transition"
>
  {t.start}
</button>



              <button
                onClick={() => setShowHow(true)}
                className="px-6 py-3 rounded-2xl border border-white/20 font-semibold hover:bg-white/5 transition text-center"
              >
                {t.how}
              </button>
            </div>

            <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm text-white/70">
              {t.bullets.map((b, i) => (
                <div key={i} className="p-3 rounded-xl bg-white/5 border border-white/10">{b}</div>
              ))}
            </div>
          </div>

          {/* VIDEO */}
          <div className="relative">
            <div className="absolute -inset-6 rounded-[32px] bg-yellow-400/10 blur-3xl" />
            <div className="relative rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl backdrop-blur">
              <video
                autoPlay loop muted playsInline
                poster="/images/mleo-hero-preview.png"
                className="w-full h-auto rounded-2xl object-cover"
                src="/videos/intro.mp4"
              />
              <p className="mt-3 text-xs text-white/60 text-center">
                Teaser — the full experience starts when you hit {t.start}.
              </p>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="relative z-10 max-w-6xl mx-auto px-5 pb-10 text-xs text-white/50">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-6 justify-between">
            <div>© {new Date().getFullYear()} MLEO. All rights reserved.</div>
            <div className="space-x-4">
              <a href="#" className="hover:text-white/80">{t.footer.terms}</a>
              <a href="#" className="hover:text-white/80">{t.footer.privacy}</a>
              <a href="#" className="hover:text-white/80">{t.footer.docs}</a>
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
{showGate && (
  <EmailTermsGate
    onPassed={() => router.push(GAME_ENTRY_URL)}
    onClose={() => setShowGate(false)}
  />
)}


    </>
  );
}
