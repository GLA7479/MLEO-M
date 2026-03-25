/**
 * One-off: strip chooseGameDesc + Rush block from mining.js locales es..he,
 * then append UI + questHow + howTo headings before each locale close.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const miningPath = path.join(__dirname, "..", "pages", "mining.js");
let code = fs.readFileSync(miningPath, "utf8");

code = code.replace(/\n    chooseGameDesc: [^\n]+\n/g, "\n");

const rushRe =
  /\n    acceptTermsToPlay: [^\n]+\n    rush: [^\n]+\n    rushDesc: [^\n]+\n    passive: [^\n]+\n    playTokenRush: [^\n]+\n    howToPlayTitle: [^\n]+\n    goal: [^\n]+\n    rushGoal: [^\n]+\n    rushGoalDesc: [^\n]+\n    rushGameplay: [^\n]+\n    rushGameplaySteps: \[[\s\S]*?\],\n    rushFeatures: [^\n]+\n    rushFeaturesList: \[[\s\S]*?\],\n    goalDesc:/g;

code = code.replace(rushRe, "\n    goalDesc:");
if (code.includes("acceptTermsToPlay")) {
  console.error("rushRe missed some acceptTermsToPlay");
  process.exit(1);
}

const PATCH = {
  es: {
    chooseGameLobbyShort:
      "Cuatro destinos, una bóveda compartida: Miners, MLEO BASE, Arcade y Arcade Online.",
    minersDescShort: "Idle y mejoras. Bóveda + reclamación on-chain.",
    poolStatus: "Pool",
    arcadeGames: "Arcade",
    arcadeOnline: "Arcade Online",
    arcadeRegularTitle: "MLEO — Arcade",
    arcadeOnlineTitle: "MLEO — Arcade Online",
    arcadeBadgeLabel: "Arcade",
    onlineBadgeLabel: "Online",
    arcadeDescShort: "Minijuegos en solitario. Bóveda compartida y recompensas de sesión.",
    arcadeOnlineDescShort: "Multijugador y modos en vivo. Misma bóveda compartida.",
    arcadeOnlineHowIntro:
      "Los modos arcade en vivo y online usan la misma bóveda compartida y reglas del ecosistema que el arcade en solitario. El coste de sesión y las recompensas pueden variar según el modo.",
    legalShort: "Legal",
    howToPlayArcadeTitle: "Cómo jugar — Arcade",
    howToPlayArcadeOnlineTitle: "Cómo jugar — Arcade Online",
    howToPlayMinersTitle: "Cómo jugar — Miners",
    questHow: {
      title: "Cómo jugar — MLEO BASE",
      goal: "Objetivo",
      goalDesc:
        "MLEO BASE es el centro de mando estratégico del ecosistema MLEO. Construye y mejora tu base, gestiona energía y estabilidad, produce recursos clave, lanza expediciones, refina materiales en MLEO bancarizado y envía parte con cuidado a la bóveda compartida.",
      gameplay: "Tu misión",
      gameplaySteps: [
        "Mejora edificios",
        "Gestiona energía y estabilidad de la base",
        "Produce mineral, oro, chatarra y datos",
        "Usa datos para operaciones avanzadas",
        "Refina recursos en MLEO bancarizado",
        "Lanza expediciones para progreso y materiales",
        "Envía MLEO a la bóveda compartida con buen timing",
        "Apoya el ecosistema a largo plazo",
      ],
      features: "Bueno saber",
      featuresList: [
        "El MLEO bancarizado permanece en BASE hasta que lo envíes a la bóveda compartida.",
        "El envío está sujeto a límites diarios y presión de eficiencia; el ritmo importa.",
        "Este modo funciona con Miners y Arcade para progresión y utilidad a largo plazo.",
        "Construye con cabeza, mantén la estabilidad y fortalece tu base.",
      ],
    },
  },
  fr: {
    chooseGameLobbyShort:
      "Quatre destinations, un coffre-fort partagé : Miners, MLEO BASE, Arcade et Arcade Online.",
    minersDescShort: "Idle et améliorations. Coffre + réclamation on-chain.",
    poolStatus: "Pool",
    arcadeGames: "Arcade",
    arcadeOnline: "Arcade Online",
    arcadeRegularTitle: "MLEO — Arcade",
    arcadeOnlineTitle: "MLEO — Arcade Online",
    arcadeBadgeLabel: "Arcade",
    onlineBadgeLabel: "En ligne",
    arcadeDescShort: "Mini-jeux solo. Coffre partagé et récompenses de session.",
    arcadeOnlineDescShort: "Multijoueur et modes live. Même coffre partagé.",
    arcadeOnlineHowIntro:
      "Les modes arcade live et en ligne partagent le même coffre et les mêmes règles d’écosystème que l’arcade solo. Coûts de session et récompenses peuvent varier selon le mode.",
    legalShort: "Infos légales",
    howToPlayArcadeTitle: "Comment jouer — Arcade",
    howToPlayArcadeOnlineTitle: "Comment jouer — Arcade Online",
    howToPlayMinersTitle: "Comment jouer — Miners",
    questHow: {
      title: "Comment jouer — MLEO BASE",
      goal: "Objectif",
      goalDesc:
        "MLEO BASE est le centre de commandement stratégique de l’écosystème MLEO. Construisez et améliorez votre base, gérez l’énergie et la stabilité, produisez des ressources, lancez des expéditions, affinez des matériaux en MLEO bancarisé et expédiez-en une partie vers le coffre partagé.",
      gameplay: "Votre mission",
      gameplaySteps: [
        "Améliorer les bâtiments",
        "Gérer l’énergie et la stabilité de la base",
        "Produire minerai, or, ferraille et données",
        "Utiliser les données pour des opérations avancées",
        "Raffiner les ressources en MLEO bancarisé",
        "Lancer des expéditions pour la progression",
        "Envoyer du MLEO au coffre partagé au bon moment",
        "Soutenir l’écosystème sur le long terme",
      ],
      features: "Bon à savoir",
      featuresList: [
        "Le MLEO bancarisé reste dans BASE jusqu’à envoi vers le coffre partagé.",
        "L’envoi est limité par des plafonds quotidiens et la pression d’efficacité.",
        "Ce mode s’aligne avec Miners et Arcade pour une progression durable.",
        "Construisez intelligemment et renforcez votre base.",
      ],
    },
  },
  de: {
    chooseGameLobbyShort:
      "Vier Ziele, ein gemeinsamer Vault: Miners, MLEO BASE, Arcade und Arcade Online.",
    minersDescShort: "Idle & Upgrades. Vault + On-Chain-Claim.",
    poolStatus: "Pool",
    arcadeGames: "Arcade",
    arcadeOnline: "Arcade Online",
    arcadeRegularTitle: "MLEO — Arcade",
    arcadeOnlineTitle: "MLEO — Arcade Online",
    arcadeBadgeLabel: "Arcade",
    onlineBadgeLabel: "Online",
    arcadeDescShort: "Solo-Minispiele. Geteilter Vault & Sitzungsbelohnungen.",
    arcadeOnlineDescShort: "Multiplayer & Live-Modi. Derselbe geteilte Vault.",
    arcadeOnlineHowIntro:
      "Live- und Online-Arcade-Modi nutzen denselben geteilten Vault und dieselben Ökosystemregeln wie Solo-Arcade. Sitzungskosten und Belohnungen können je nach Modus variieren.",
    legalShort: "Rechtliches",
    howToPlayArcadeTitle: "Spielanleitung — Arcade",
    howToPlayArcadeOnlineTitle: "Spielanleitung — Arcade Online",
    howToPlayMinersTitle: "Spielanleitung — Miners",
    questHow: {
      title: "Spielanleitung — MLEO BASE",
      goal: "Ziel",
      goalDesc:
        "MLEO BASE ist das strategische Kommandozentrum des MLEO-Ökosystems. Baue und verbessere deine Basis, verwalte Energie und Stabilität, produziere Ressourcen, starte Expeditionen, veredle Materialien zu gebanktem MLEO und versende einen Teil in den gemeinsamen Vault.",
      gameplay: "Deine Mission",
      gameplaySteps: [
        "Gebäude upgraden",
        "Energie und Basisstabilität managen",
        "Erz, Gold, Schrott und Data produzieren",
        "Data für fortgeschrittene Operationen nutzen",
        "Ressourcen zu gebanktem MLEO veredeln",
        "Expeditionen für Fortschritt starten",
        "MLEO mit gutem Timing in den gemeinsamen Vault senden",
        "Das Ökosystem langfristig unterstützen",
      ],
      features: "Gut zu wissen",
      featuresList: [
        "Gebanktes MLEO bleibt in BASE, bis du es in den gemeinsamen Vault sendest.",
        "Versand unterliegt Tageslimits und Effizienzdruck.",
        "Dieser Modus ergänzt Miners und Arcade für langfristige Progression.",
        "Klug bauen, Stabilität halten, Basis stärken.",
      ],
    },
  },
  zh: {
    chooseGameLobbyShort: "四个目的地，一个共享金库：Miners、MLEO BASE、Arcade 与 Arcade Online。",
    minersDescShort: "放置与升级。金库 + 链上领取。",
    poolStatus: "池",
    arcadeGames: "街机",
    arcadeOnline: "在线街机",
    arcadeRegularTitle: "MLEO — 街机",
    arcadeOnlineTitle: "MLEO — 在线街机",
    arcadeBadgeLabel: "街机",
    onlineBadgeLabel: "在线",
    arcadeDescShort: "单人小游戏。共享金库与对局奖励。",
    arcadeOnlineDescShort: "多人与实时模式。同一共享金库。",
    arcadeOnlineHowIntro:
      "在线与实时街机模式与单人街机使用相同的共享金库与生态规则。会话消耗与奖励因模式而异。",
    legalShort: "法律信息",
    howToPlayArcadeTitle: "玩法说明 — 街机",
    howToPlayArcadeOnlineTitle: "玩法说明 — 在线街机",
    howToPlayMinersTitle: "玩法说明 — 矿工",
    questHow: {
      title: "玩法说明 — MLEO BASE",
      goal: "目标",
      goalDesc:
        "MLEO BASE 是 MLEO 生态的战略指挥中心。建造并升级基地，管理能源与稳定性，生产关键资源，发起远征，将材料精炼为已入账 MLEO，并适时向共享金库运送。",
      gameplay: "你的任务",
      gameplaySteps: [
        "升级建筑",
        "管理能源与基地稳定性",
        "生产矿石、金币、废料与数据",
        "将数据用于高级操作",
        "将资源精炼为已入账 MLEO",
        "发起远征获取进度与材料",
        "把握时机向共享金库运送 MLEO",
        "长期支持整个生态",
      ],
      features: "温馨提示",
      featuresList: [
        "已入账 MLEO 在运送到共享金库前保留在 BASE 内。",
        "运送受每日上限与效率压力约束。",
        "该模式与 Miners、街机协同，支持长期成长。",
        "稳健建造，保持增长，强化基地。",
      ],
    },
  },
  ja: {
    chooseGameLobbyShort:
      "4つの行き先、1つの共有Vault：Miners、MLEO BASE、アーケード、アーケードオンライン。",
    minersDescShort: "放置とアップグレード。Vault＋オンチェーンCLAIM。",
    poolStatus: "プール",
    arcadeGames: "アーケード",
    arcadeOnline: "アーケードオンライン",
    arcadeRegularTitle: "MLEO — アーケード",
    arcadeOnlineTitle: "MLEO — アーケードオンライン",
    arcadeBadgeLabel: "アーケード",
    onlineBadgeLabel: "オンライン",
    arcadeDescShort: "ソロミニゲーム。共有Vaultとセッション報酬。",
    arcadeOnlineDescShort: "マルチとライブモード。同じ共有Vault。",
    arcadeOnlineHowIntro:
      "ライブ／オンラインアーケードはソロアーケードと同じ共有Vaultとエコシステムルールを使用します。セッションコストと報酬はモードにより異なる場合があります。",
    legalShort: "法的情報",
    howToPlayArcadeTitle: "遊び方 — アーケード",
    howToPlayArcadeOnlineTitle: "遊び方 — アーケードオンライン",
    howToPlayMinersTitle: "遊び方 — マイナー",
    questHow: {
      title: "遊び方 — MLEO BASE",
      goal: "目標",
      goalDesc:
        "MLEO BASEはMLEOエコシステムの戦略司令センターです。基地を建設・アップグレードし、エネルギーと安定性を管理し、資源を生産し、遠征に出て、素材をバンク済みMLEOに精製し、共有Vaultへ慎重に送ります。",
      gameplay: "ミッション",
      gameplaySteps: [
        "建物をアップグレード",
        "エネルギーと基地安定性を管理",
        "鉱石・金・スクラップ・データを生産",
        "データで高度な操作を実行",
        "資源をバンク済みMLEOに精製",
        "遠征で進行と素材を獲得",
        "タイミングよく共有VaultへMLEOを送る",
        "長期的にエコシステムを支援",
      ],
      features: "ヒント",
      featuresList: [
        "バンク済みMLEOは共有Vaultへ送るまでBASE内に留まります。",
        "送付は日次上限と効率プレッシャーの対象です。",
        "Minersとアーケードと連携し長期成長を支えます。",
        "賢く建設し、安定を保ち、基地を強化しましょう。",
      ],
    },
  },
  ko: {
    chooseGameLobbyShort:
      "네 가지 목적지, 하나의 공유 금고: Miners, MLEO BASE, 아케이드, 아케이드 온라인.",
    minersDescShort: "방치형 & 업그레이드. 금고 + 온체인 클레임.",
    poolStatus: "풀",
    arcadeGames: "아케이드",
    arcadeOnline: "아케이드 온라인",
    arcadeRegularTitle: "MLEO — 아케이드",
    arcadeOnlineTitle: "MLEO — 아케이드 온라인",
    arcadeBadgeLabel: "아케이드",
    onlineBadgeLabel: "온라인",
    arcadeDescShort: "솔로 미니게임. 공유 금고 & 세션 보상.",
    arcadeOnlineDescShort: "멀티 & 라이브 모드. 동일한 공유 금고.",
    arcadeOnlineHowIntro:
      "라이브 및 온라인 아케이드는 솔로 아케이드와 같은 공유 금고와 생태계 규칙을 사용합니다. 세션 비용과 보상은 모드에 따라 다를 수 있습니다.",
    legalShort: "법적 고지",
    howToPlayArcadeTitle: "플레이 방법 — 아케이드",
    howToPlayArcadeOnlineTitle: "플레이 방법 — 아케이드 온라인",
    howToPlayMinersTitle: "플레이 방법 — 마이너",
    questHow: {
      title: "플레이 방법 — MLEO BASE",
      goal: "목표",
      goalDesc:
        "MLEO BASE는 MLEO 생태계의 전략 지휘 센터입니다. 기지를 건설·업그레이드하고 에너지와 안정성을 관리하며 자원을 생산하고 원정을 띄워 재료를 뱅크된 MLEO로 정제하고 공유 금고로 일부를 신중히 보냅니다.",
      gameplay: "미션",
      gameplaySteps: [
        "건물 업그레이드",
        "에너지와 기지 안정성 관리",
        "광석, 금, 스크랩, 데이터 생산",
        "데이터로 고급 운영 수행",
        "자원을 뱅크된 MLEO로 정제",
        "원정으로 진행과 재료 획득",
        "타이밍을 맞춰 공유 금고로 MLEO 전송",
        "장기적으로 생태계 지원",
      ],
      features: "알아두기",
      featuresList: [
        "뱅크된 MLEO는 공유 금고로 보내기 전까지 BASE에 남습니다.",
        "전송은 일일 한도와 효율 압박의 영향을 받습니다.",
        "Miners·아케이드와 함께 장기 성장을 돕습니다.",
        "현명하게 건설하고 안정을 유지하며 기지를 강화하세요.",
      ],
    },
  },
  tr: {
    chooseGameLobbyShort:
      "Dört hedef, bir paylaşımlı kasa: Miners, MLEO BASE, Arcade ve Arcade Online.",
    minersDescShort: "Idle ve yükseltmeler. Kasa + zincir üstü talep.",
    poolStatus: "Havuz",
    arcadeGames: "Arcade",
    arcadeOnline: "Arcade Online",
    arcadeRegularTitle: "MLEO — Arcade",
    arcadeOnlineTitle: "MLEO — Arcade Online",
    arcadeBadgeLabel: "Arcade",
    onlineBadgeLabel: "Çevrimiçi",
    arcadeDescShort: "Tek oyunculu mini oyunlar. Paylaşımlı kasa ve oturum ödülleri.",
    arcadeOnlineDescShort: "Çok oyunculu ve canlı modlar. Aynı paylaşımlı kasa.",
    arcadeOnlineHowIntro:
      "Canlı ve çevrimiçi arcade modları, solo arcade ile aynı paylaşımlı kasa ve ekosistem kurallarını kullanır. Oturum maliyetleri ve ödüller moda göre değişebilir.",
    legalShort: "Yasal",
    howToPlayArcadeTitle: "Nasıl oynanır — Arcade",
    howToPlayArcadeOnlineTitle: "Nasıl oynanır — Arcade Online",
    howToPlayMinersTitle: "Nasıl oynanır — Miners",
    questHow: {
      title: "Nasıl oynanır — MLEO BASE",
      goal: "Hedef",
      goalDesc:
        "MLEO BASE, MLEO ekosisteminin stratejik komuta merkezidir. Üssünüzü inşa edin ve yükseltin, enerji ve istikrarı yönetin, kaynak üretin, seferlere çıkın, malzemeleri bankalanmış MLEO’ya rafine edin ve paylaşımlı kasaya dikkatlice gönderin.",
      gameplay: "Göreviniz",
      gameplaySteps: [
        "Binaları yükseltin",
        "Enerji ve üs istikrarını yönetin",
        "Cevher, altın, hurda ve veri üretin",
        "Veriyi ileri operasyonlar için kullanın",
        "Kaynakları bankalanmış MLEO’ya rafine edin",
        "İlerleme ve malzeme için seferler başlatın",
        "MLEO’yu doğru zamanda paylaşımlı kasaya gönderin",
        "Ekosistemi uzun vadede destekleyin",
      ],
      features: "Bilinmesi gerekenler",
      featuresList: [
        "Bankalanmış MLEO, paylaşımlı kasaya gönderilene kadar BASE içinde kalır.",
        "Gönderim günlük limitler ve verim baskısına tabidir.",
        "Bu mod Miners ve Arcade ile uzun vadeli ilerlemeyi destekler.",
        "Akıllıca inşa edin, istikrarı koruyun, üssünüzü güçlendirin.",
      ],
    },
  },
  it: {
    chooseGameLobbyShort:
      "Quattro destinazioni, un vault condiviso: Miners, MLEO BASE, Arcade e Arcade Online.",
    minersDescShort: "Idle e potenziamenti. Vault + claim on-chain.",
    poolStatus: "Pool",
    arcadeGames: "Arcade",
    arcadeOnline: "Arcade Online",
    arcadeRegularTitle: "MLEO — Arcade",
    arcadeOnlineTitle: "MLEO — Arcade Online",
    arcadeBadgeLabel: "Arcade",
    onlineBadgeLabel: "Online",
    arcadeDescShort: "Mini-giochi in solitaria. Vault condiviso e ricompense di sessione.",
    arcadeOnlineDescShort: "Multigiocatore e modalità live. Stesso vault condiviso.",
    arcadeOnlineHowIntro:
      "Le modalità arcade live e online usano lo stesso vault condiviso e le stesse regole dell’ecosistema dell’arcade in solitaria. Costi di sessione e ricompense possono variare.",
    legalShort: "Note legali",
    howToPlayArcadeTitle: "Come giocare — Arcade",
    howToPlayArcadeOnlineTitle: "Come giocare — Arcade Online",
    howToPlayMinersTitle: "Come giocare — Miners",
    questHow: {
      title: "Come giocare — MLEO BASE",
      goal: "Obiettivo",
      goalDesc:
        "MLEO BASE è il centro di comando strategico dell’ecosistema MLEO. Costruisci e potenzia la base, gestisci energia e stabilità, produci risorse, lancia spedizioni, affina i materiali in MLEO depositato e invia parte al vault condiviso.",
      gameplay: "La tua missione",
      gameplaySteps: [
        "Potenzia gli edifici",
        "Gestisci energia e stabilità della base",
        "Produci minerale, oro, rottami e dati",
        "Usa i dati per operazioni avanzate",
        "Affina le risorse in MLEO depositato",
        "Lancia spedizioni per progresso e materiali",
        "Invia MLEO al vault condiviso con tempismo",
        "Sostieni l’ecosistema nel lungo periodo",
      ],
      features: "Da sapere",
      featuresList: [
        "Il MLEO depositato resta in BASE fino all’invio al vault condiviso.",
        "L’invio è soggetto a limiti giornalieri e pressione di efficienza.",
        "Questa modalità lavora con Miners e Arcade per la progressione.",
        "Costruisci con intelligenza e rafforza la base.",
      ],
    },
  },
  ka: {
    chooseGameLobbyShort:
      "ოთხი მიმართულება, ერთი საერთო საცავი: Miners, MLEO BASE, Arcade და Arcade Online.",
    minersDescShort: "Idle და გაუმჯობესებები. საცავი + on-chain claim.",
    poolStatus: "პული",
    arcadeGames: "არკადა",
    arcadeOnline: "არკადა ონლაინ",
    arcadeRegularTitle: "MLEO — არკადა",
    arcadeOnlineTitle: "MLEO — არკადა ონლაინ",
    arcadeBadgeLabel: "არკადა",
    onlineBadgeLabel: "ონლაინ",
    arcadeDescShort: "სოლო მინი-თამაშები. საერთო საცავი და სესიის ჯილდოები.",
    arcadeOnlineDescShort: "მულტიპლეიერი და ცოცხალი რეჟიმები. იგივე საერთო საცავი.",
    arcadeOnlineHowIntro:
      "ცოცხალი და ონლაინ არკადის რეჟიმები იყენებს იმავე საერთო საცავსა და ეკოსისტემის წესებს, რაც სოლო არკადას. სესიის ღირებულება და ჯილდოები შეიძლება განსხვავდებოდეს.",
    legalShort: "იურიდიული",
    howToPlayArcadeTitle: "როგორ ვითამაშოთ — არკადა",
    howToPlayArcadeOnlineTitle: "როგორ ვითამაშოთ — არკადა ონლაინ",
    howToPlayMinersTitle: "როგორ ვითამაშოთ — მაინერები",
    questHow: {
      title: "როგორ ვითამაშოთ — MLEO BASE",
      goal: "მიზანი",
      goalDesc:
        "MLEO BASE არის MLEO ეკოსისტემის სტრატეგიული სამმართველო ცენტრი. ააშენეთ და გააუმჯობესეთ ბაზა, მართეთ ენერგია და სტაბილურობა, წარმოება რესურსები, გაუშვით ექსპედიციები, გადააქციეთ მასალები ბანკირებულ MLEO-ში და გაგზავნეთ ნაწილი საერთო საცავში.",
      gameplay: "თქვენი მისია",
      gameplaySteps: [
        "შენობების გაუმჯობესება",
        "ენერგიისა და ბაზის სტაბილურობის მართვა",
        "საბადოს, ოქროს, ჯართისა და მონაცემების წარმოება",
        "მონაცემების გამოყენება დამატებით ოპერაციებში",
        "რესურსების ბანკირებულ MLEO-ში გადაყვანა",
        "ექსპედიციები პროგრესისთვის",
        "MLEO-ს გაგზავნა საერთო საცავში სწორი დროით",
        "ეკოსისტემის გრძელვადიანი მხარდაჭერა",
      ],
      features: "სასარგებლო ინფო",
      featuresList: [
        "ბანკირებული MLEO BASE-ში რჩება სანამ საერთო საცავში არ გაგზავნით.",
        "გაგზავნა დღიური ლიმიტებისა და ეფექტურობის ზეწოლის ქვეშაა.",
        "ეს რეჟიმი Miners-სა და Arcade-ს უხსნის გრძელვადიან პროგრესს.",
        "გონივრულად ააშენეთ და გააძლიერეთ ბაზა.",
      ],
    },
  },
  pl: {
    chooseGameLobbyShort:
      "Cztery miejsca docelowe, jeden wspólny skarbiec: Miners, MLEO BASE, Arcade i Arcade Online.",
    minersDescShort: "Idle i ulepszenia. Skarbiec + odbiór on-chain.",
    poolStatus: "Pula",
    arcadeGames: "Arcade",
    arcadeOnline: "Arcade Online",
    arcadeRegularTitle: "MLEO — Arcade",
    arcadeOnlineTitle: "MLEO — Arcade Online",
    arcadeBadgeLabel: "Arcade",
    onlineBadgeLabel: "Online",
    arcadeDescShort: "Mini-gry solo. Wspólny skarbiec i nagrody sesji.",
    arcadeOnlineDescShort: "Multiplayer i tryby na żywo. Ten sam wspólny skarbiec.",
    arcadeOnlineHowIntro:
      "Tryby arcade na żywo i online korzystają z tego samego wspólnego skarbca i zasad co arcade solo. Koszty sesji i nagrody mogą się różnić.",
    legalShort: "Informacje prawne",
    howToPlayArcadeTitle: "Jak grać — Arcade",
    howToPlayArcadeOnlineTitle: "Jak grać — Arcade Online",
    howToPlayMinersTitle: "Jak grać — Miners",
    questHow: {
      title: "Jak grać — MLEO BASE",
      goal: "Cel",
      goalDesc:
        "MLEO BASE to strategiczne centrum dowodzenia ekosystemem MLEO. Buduj i ulepszaj bazę, zarządzaj energią i stabilnością, produkuj zasoby, wysyłaj ekspedycje, przetwarzaj materiały na zdeponowane MLEO i ostrożnie wysyłaj część do wspólnego skarbca.",
      gameplay: "Twoja misja",
      gameplaySteps: [
        "Ulepszaj budynki",
        "Zarządzaj energią i stabilnością bazy",
        "Produkuj rudę, złom, złoto i dane",
        "Używaj danych do zaawansowanych operacji",
        "Przetwarzaj zasoby na zdeponowane MLEO",
        "Wysyłaj ekspedycje po postęp i materiały",
        "Wysyłaj MLEO do wspólnego skarbca z dobrym timingiem",
        "Wspieraj ekosystem długoterminowo",
      ],
      features: "Warto wiedzieć",
      featuresList: [
        "Zdeponowane MLEO zostaje w BASE do wysłania do wspólnego skarbca.",
        "Wysyłka podlega limitom dziennym i presji efektywności.",
        "Tryb współpracuje z Miners i Arcade dla długiej gry.",
        "Buduj mądrze, utrzymuj stabilność, wzmacniaj bazę.",
      ],
    },
  },
  ro: {
    chooseGameLobbyShort:
      "Patru destinații, un seif partajat: Miners, MLEO BASE, Arcade și Arcade Online.",
    minersDescShort: "Idle și upgrade-uri. Seif + claim on-chain.",
    poolStatus: "Pool",
    arcadeGames: "Arcade",
    arcadeOnline: "Arcade Online",
    arcadeRegularTitle: "MLEO — Arcade",
    arcadeOnlineTitle: "MLEO — Arcade Online",
    arcadeBadgeLabel: "Arcade",
    onlineBadgeLabel: "Online",
    arcadeDescShort: "Mini-jocuri solo. Seif partajat și recompense de sesiune.",
    arcadeOnlineDescShort: "Multiplayer și moduri live. Același seif partajat.",
    arcadeOnlineHowIntro:
      "Modurile arcade live și online folosesc același seif partajat și aceleași reguli ca arcade solo. Costurile și recompensele pot diferi.",
    legalShort: "Legal",
    howToPlayArcadeTitle: "Cum se joacă — Arcade",
    howToPlayArcadeOnlineTitle: "Cum se joacă — Arcade Online",
    howToPlayMinersTitle: "Cum se joacă — Miners",
    questHow: {
      title: "Cum se joacă — MLEO BASE",
      goal: "Obiectiv",
      goalDesc:
        "MLEO BASE este centrul strategic de comandă al ecosistemului MLEO. Construiește și îmbunătățește baza, gestionează energia și stabilitatea, produce resurse, lansează expediții, rafinează materiale în MLEO bancat și trimite o parte către seiful partajat.",
      gameplay: "Misiunea ta",
      gameplaySteps: [
        "Îmbunătățește clădirile",
        "Gestionează energia și stabilitatea bazei",
        "Produce minereu, aur, fier vechi și date",
        "Folosește datele pentru operațiuni avansate",
        "Rafinează resursele în MLEO bancat",
        "Lansează expediții pentru progres",
        "Trimite MLEO în seiful partajat la momentul potrivit",
        "Sprijină ecosistemul pe termen lung",
      ],
      features: "De știut",
      featuresList: [
        "MLEO bancat rămâne în BASE până la trimitere în seiful partajat.",
        "Trimiterea respectă limite zilnice și presiune de eficiență.",
        "Modul lucrează cu Miners și Arcade pentru progres.",
        "Construiește inteligent și întărește baza.",
      ],
    },
  },
  cs: {
    chooseGameLobbyShort:
      "Čtyři cíle, jeden sdílený trezor: Miners, MLEO BASE, Arcade a Arcade Online.",
    minersDescShort: "Idle a vylepšení. Trezor + on-chain claim.",
    poolStatus: "Pool",
    arcadeGames: "Arcade",
    arcadeOnline: "Arcade Online",
    arcadeRegularTitle: "MLEO — Arcade",
    arcadeOnlineTitle: "MLEO — Arcade Online",
    arcadeBadgeLabel: "Arcade",
    onlineBadgeLabel: "Online",
    arcadeDescShort: "Sólové minihry. Sdílený trezor a odměny za session.",
    arcadeOnlineDescShort: "Multiplayer a živé módy. Stejný sdílený trezor.",
    arcadeOnlineHowIntro:
      "Živé a online arcade módy používají stejný sdílený trezor a pravidla jako sólové arcade. Náklady a odměny se mohou lišit.",
    legalShort: "Právní info",
    howToPlayArcadeTitle: "Jak hrát — Arcade",
    howToPlayArcadeOnlineTitle: "Jak hrát — Arcade Online",
    howToPlayMinersTitle: "Jak hrát — Miners",
    questHow: {
      title: "Jak hrát — MLEO BASE",
      goal: "Cíl",
      goalDesc:
        "MLEO BASE je strategické velitelské centrum ekosystému MLEO. Stavte a vylepšujte základnu, spravujte energii a stabilitu, vyrábějte suroviny, vypravujte expedice, rafinujte materiály na bankované MLEO a část opatrně posílejte do sdíleného trezoru.",
      gameplay: "Vaše mise",
      gameplaySteps: [
        "Vylepšujte budovy",
        "Spravujte energii a stabilitu základny",
        "Vyrábějte rudu, zlato, šrot a data",
        "Používejte data pro pokročilé operace",
        "Rafinujte suroviny na bankované MLEO",
        "Vypravujte expedice pro pokrok",
        "Posílejte MLEO do sdíleného trezoru ve správný čas",
        "Dlouhodobě podporujte ekosystém",
      ],
      features: "Dobré vědět",
      featuresList: [
        "Bankované MLEO zůstává v BASE do odeslání do sdíleného trezoru.",
        "Odeslání podléhá denním limitům a tlaku na efektivitu.",
        "Režim doplňuje Miners a Arcade pro dlouhodobou hru.",
        "Stavte chytře a posilujte základnu.",
      ],
    },
  },
  nl: {
    chooseGameLobbyShort:
      "Vier bestemmingen, één gedeelde kluis: Miners, MLEO BASE, Arcade en Arcade Online.",
    minersDescShort: "Idle & upgrades. Kluis + on-chain claim.",
    poolStatus: "Pool",
    arcadeGames: "Arcade",
    arcadeOnline: "Arcade Online",
    arcadeRegularTitle: "MLEO — Arcade",
    arcadeOnlineTitle: "MLEO — Arcade Online",
    arcadeBadgeLabel: "Arcade",
    onlineBadgeLabel: "Online",
    arcadeDescShort: "Solo minigames. Gedeelde kluis & sessiebeloningen.",
    arcadeOnlineDescShort: "Multiplayer & live modi. Dezelfde gedeelde kluis.",
    arcadeOnlineHowIntro:
      "Live- en online-arcademodi gebruiken dezelfde gedeelde kluis en ecosysteemregels als solo-arcade. Sessiekosten en beloningen kunnen verschillen.",
    legalShort: "Juridisch",
    howToPlayArcadeTitle: "Hoe te spelen — Arcade",
    howToPlayArcadeOnlineTitle: "Hoe te spelen — Arcade Online",
    howToPlayMinersTitle: "Hoe te spelen — Miners",
    questHow: {
      title: "Hoe te spelen — MLEO BASE",
      goal: "Doel",
      goalDesc:
        "MLEO BASE is het strategische commandocentrum van het MLEO-ecosysteem. Bouw en upgrade je basis, beheer energie en stabiliteit, produceer grondstoffen, start expedities, raffineer materialen naar gebankt MLEO en stuur voorzichtig deel naar de gedeelde kluis.",
      gameplay: "Jouw missie",
      gameplaySteps: [
        "Gebouwen upgraden",
        "Energie en basisstabiliteit beheren",
        "Erts, goud, schroot en data produceren",
        "Data gebruiken voor geavanceerde operaties",
        "Grondstoffen raffineren naar gebankt MLEO",
        "Expedities starten voor voortgang",
        "MLEO naar gedeelde kluis sturen met goede timing",
        "Ecosysteem op lange termijn ondersteunen",
      ],
      features: "Handig om te weten",
      featuresList: [
        "Gebankt MLEO blijft in BASE tot verzending naar gedeelde kluis.",
        "Verzending onderhevig aan daglimieten en efficiëntiedruk.",
        "Modus werkt samen met Miners en Arcade.",
        "Slim bouwen en basis versterken.",
      ],
    },
  },
  el: {
    chooseGameLobbyShort:
      "Τέσσερις προορισμοί, ένα κοινό χρηματοκιβώτιο: Miners, MLEO BASE, Arcade και Arcade Online.",
    minersDescShort: "Idle και αναβαθμίσεις. Vault + on-chain claim.",
    poolStatus: "Pool",
    arcadeGames: "Arcade",
    arcadeOnline: "Arcade Online",
    arcadeRegularTitle: "MLEO — Arcade",
    arcadeOnlineTitle: "MLEO — Arcade Online",
    arcadeBadgeLabel: "Arcade",
    onlineBadgeLabel: "Online",
    arcadeDescShort: "Solo mini παιχνίδια. Κοινό vault & ανταμοιβές session.",
    arcadeOnlineDescShort: "Πολλοί παίκτες & live modes. Το ίδιο κοινό vault.",
    arcadeOnlineHowIntro:
      "Τα live και online arcade modes χρησιμοποιούν το ίδιο κοινό vault και κανόνες με το solo arcade. Κόστος session και ανταμοιβές μπορεί να διαφέρουν.",
    legalShort: "Νομικά",
    howToPlayArcadeTitle: "Πώς να παίξεις — Arcade",
    howToPlayArcadeOnlineTitle: "Πώς να παίξεις — Arcade Online",
    howToPlayMinersTitle: "Πώς να παίξεις — Miners",
    questHow: {
      title: "Πώς να παίξεις — MLEO BASE",
      goal: "Στόχος",
      goalDesc:
        "Το MLEO BASE είναι το στρατηγικό κέντρο διοίκησης του οικοσυστήματος MLEO. Χτίσε και αναβάθμισε τη βάση, διαχειρίσου ενέργεια και σταθερότητα, παρήγαγε πόρους, εκτέλεσε αποστολές, καθάρισε υλικά σε τραπεζικό MLEO και στείλε μέρος στο κοινό vault.",
      gameplay: "Η αποστολή σου",
      gameplaySteps: [
        "Αναβάθμισε κτίρια",
        "Διαχειρίσου ενέργεια και σταθερότητα βάσης",
        "Παρήγαγε μετάλλευμα, χρυσό, σκραπ και δεδομένα",
        "Χρησιμοποίησε δεδομένα για προχωρημένες ενέργειες",
        "Καθάρισε πόρους σε τραπεζικό MLEO",
        "Εκτέλεσε αποστολές για πρόοδο",
        "Στείλε MLEO στο κοινό vault με σωστό timing",
        "Υποστήριξε το οικοσύστημα μακροπρόθεσμα",
      ],
      features: "Καλό να ξέρεις",
      featuresList: [
        "Το τραπεζικό MLEO μένει στο BASE μέχρι αποστολή στο κοινό vault.",
        "Η αποστολή υπόκειται σε ημερήσια όρια και πίεση αποδοτικότητας.",
        "Λειτουργεί με Miners και Arcade για μακροπρόθεσμη πρόοδο.",
        "Χτίσε έξυπνα και ενίσχυσε τη βάση.",
      ],
    },
  },
  he: {
    chooseGameLobbyShort:
      "ארבעה יעדים, Vault אחד משותף: Miners, MLEO BASE, ארקייד וארקייד אונליין.",
    minersDescShort: "משחק מנוחה ושדרוגים. Vault + CLAIM על השרשרת.",
    poolStatus: "מאגר",
    arcadeGames: "ארקייד",
    arcadeOnline: "ארקייד אונליין",
    arcadeRegularTitle: "MLEO — ארקייד",
    arcadeOnlineTitle: "MLEO — ארקייד אונליין",
    arcadeBadgeLabel: "ארקייד",
    onlineBadgeLabel: "אונליין",
    arcadeDescShort: "מיני-משחקים לבד. Vault משותף ופרסי סשן.",
    arcadeOnlineDescShort: "רב-משתתפים ומצבים חיים. אותו Vault משותף.",
    arcadeOnlineHowIntro:
      "מצבי ארקייד חיים ואונליין משתמשים באותו Vault משותף וכללי אקוסיסטם כמו ארקייד יחיד. עלויות סשן ופרסים עשויים להשתנות לפי המצב.",
    legalShort: "משפטי",
    howToPlayArcadeTitle: "איך לשחק — ארקייד",
    howToPlayArcadeOnlineTitle: "איך לשחק — ארקייד אונליין",
    howToPlayMinersTitle: "איך לשחק — כורים",
    questHow: {
      title: "איך לשחק - MLEO BASE",
      goal: "מטרת המשחק",
      goalDesc:
        "MLEO BASE הוא מרכז הפיקוד האסטרטגי שלך באקוסיסטם של MLEO. בנה ושדרג את הבסיס שלך, נהל אנרגיה, הפק משאבים, צא למשלחות, זקק חומרים ל-MLEO שמור ושלח אותו ל-Vault המשותף.",
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
    },
  },
};

function fmtQuestHow(q) {
  const steps = q.questHow.gameplaySteps.map((s) => `        ${JSON.stringify(s)},`).join("\n");
  const fl = q.questHow.featuresList.map((s) => `        ${JSON.stringify(s)},`).join("\n");
  return `    chooseGameLobbyShort: ${JSON.stringify(q.chooseGameLobbyShort)},
    minersDescShort: ${JSON.stringify(q.minersDescShort)},
    poolStatus: ${JSON.stringify(q.poolStatus)},
    arcadeGames: ${JSON.stringify(q.arcadeGames)},
    arcadeOnline: ${JSON.stringify(q.arcadeOnline)},
    arcadeRegularTitle: ${JSON.stringify(q.arcadeRegularTitle)},
    arcadeOnlineTitle: ${JSON.stringify(q.arcadeOnlineTitle)},
    arcadeBadgeLabel: ${JSON.stringify(q.arcadeBadgeLabel)},
    onlineBadgeLabel: ${JSON.stringify(q.onlineBadgeLabel)},
    arcadeDescShort: ${JSON.stringify(q.arcadeDescShort)},
    arcadeOnlineDescShort: ${JSON.stringify(q.arcadeOnlineDescShort)},
    arcadeOnlineHowIntro: ${JSON.stringify(q.arcadeOnlineHowIntro)},
    legalShort: ${JSON.stringify(q.legalShort)},
    howToPlayArcadeTitle: ${JSON.stringify(q.howToPlayArcadeTitle)},
    howToPlayArcadeOnlineTitle: ${JSON.stringify(q.howToPlayArcadeOnlineTitle)},
    howToPlayMinersTitle: ${JSON.stringify(q.howToPlayMinersTitle)},
    questHow: {
      title: ${JSON.stringify(q.questHow.title)},
      goal: ${JSON.stringify(q.questHow.goal)},
      goalDesc: ${JSON.stringify(q.questHow.goalDesc)},
      gameplay: ${JSON.stringify(q.questHow.gameplay)},
      gameplaySteps: [
${steps}
      ],
      features: ${JSON.stringify(q.questHow.features)},
      featuresList: [
${fl}
      ],
    },`;
}

/* Bottom-up so earlier file offsets stay valid */
const locOrder = ["he", "el", "nl", "cs", "ro", "pl", "ka", "it", "tr", "ko", "ja", "zh", "de", "fr", "es"];
for (const loc of locOrder) {
  const marker = `  ${loc}: {`;
  const idx = code.indexOf(marker);
  if (idx === -1) throw new Error(`missing ${loc}`);
  const after = code.indexOf("\n  },", idx + 10);
  if (after === -1) throw new Error(`no close for ${loc}`);
  const slice = code.slice(idx, after);
  const insertAt = slice.lastIndexOf("    ],\n");
  if (insertAt === -1) throw new Error(`no list end ${loc}`);
  const absolute = idx + insertAt + "    ],\n".length;
  const insert = "\n" + fmtQuestHow(PATCH[loc]) + "\n";
  code = code.slice(0, absolute) + insert + code.slice(absolute);
}

fs.writeFileSync(miningPath, code);
console.log("patched", miningPath);
