// Script to update arcade translations in all languages
// Run with: node update-arcade-translations.js

const fs = require('fs');
const path = require('path');

// English translations (source)
const enTranslations = {
  arcadeWhatDesc: "MLEO Arcade is a collection of 24 exciting mini-games where you can collect in-app MLEO rewards! Each game has unique mechanics and multipliers.",
  arcadeSteps: [
    "Choose any game from the arcade",
    "Each session uses at least 1,000 MLEO from your in-app vault. Some modes may use a different session cost",
    "Follow the game-specific instructions",
    "Complete runs, reach milestones, and collect reward boosts based on your results",
    "Session rewards are added automatically to your vault, including rewards earned from free play sessions"
  ],
  arcadeFreePlayList: [
    "Receive 1 free play token every hour (up to 5 stored)",
    "Use tokens to start one arcade session without using vault MLEO",
    "Rewards from free play sessions are added to your vault just like standard session rewards"
  ],
  arcadeGoodToKnowList: [
    "Your vault is shared between all MLEO games",
    "Each game tracks your activity, completed sessions, best score, streaks, and progress milestones",
    "Some games use randomized events, while others focus on timing, reaction, memory, or decision-making",
    "Click the ℹ️ button on each game card to view the rules, controls, and reward structure"
  ]
};

// Translations for other languages (approximate translations)
const translations = {
  ar: {
    arcadeWhatDesc: "MLEO Arcade هي مجموعة من 24 لعبة صغيرة مثيرة حيث يمكنك جمع مكافآت MLEO داخل التطبيق! كل لعبة لها آليات ومضاعفات فريدة.",
    arcadeSteps: [
      "اختر أي لعبة من الأركيد",
      "كل جلسة تستخدم على الأقل 1,000 MLEO من خزنتك داخل التطبيق. قد تستخدم بعض الأوضاع تكلفة جلسة مختلفة",
      "اتبع تعليمات اللعبة المحددة",
      "أكمل الجولات، وصل إلى المعالم، وجمع معززات المكافآت بناءً على نتائجك",
      "مكافآت الجلسة تُضاف تلقائيًا إلى خزنتك، بما في ذلك المكافآت المكتسبة من جلسات اللعب المجاني"
    ],
    arcadeFreePlayList: [
      "احصل على رمز لعب مجاني واحد كل ساعة (حتى 5 مخزنة)",
      "استخدم الرموز لبدء جلسة أركيد واحدة دون استخدام MLEO من الخزنة",
      "المكافآت من جلسات اللعب المجاني تُضاف إلى خزنتك تمامًا مثل مكافآت الجلسة القياسية"
    ],
    arcadeGoodToKnowList: [
      "خزنتك مشتركة بين جميع ألعاب MLEO",
      "كل لعبة تتبع نشاطك، الجلسات المكتملة، أفضل نتيجة، السلاسل، ومعالم التقدم",
      "بعض الألعاب تستخدم أحداث عشوائية، بينما تركز أخرى على التوقيت، رد الفعل، الذاكرة، أو اتخاذ القرار",
      "انقر على زر ℹ️ في كل بطاقة لعبة لعرض القواعد، التحكم، وهيكل المكافآت"
    ]
  },
  ru: {
    arcadeWhatDesc: "MLEO Arcade - это коллекция из 24 увлекательных мини-игр, где вы можете собирать внутриигровые награды MLEO! Каждая игра имеет уникальную механику и множители.",
    arcadeSteps: [
      "Выберите любую игру из аркады",
      "Каждая сессия использует минимум 1,000 MLEO из вашего внутриигрового хранилища. Некоторые режимы могут использовать другую стоимость сессии",
      "Следуйте инструкциям для конкретной игры",
      "Завершайте раунды, достигайте вех и собирайте бонусы наград на основе ваших результатов",
      "Награды сессии автоматически добавляются в ваше хранилище, включая награды, заработанные в бесплатных сессиях"
    ],
    arcadeFreePlayList: [
      "Получайте 1 токен бесплатной игры каждый час (до 5 хранимых)",
      "Используйте токены для запуска одной аркадной сессии без использования MLEO из хранилища",
      "Награды из бесплатных сессий добавляются в ваше хранилище так же, как и стандартные награды сессии"
    ],
    arcadeGoodToKnowList: [
      "Ваше хранилище общее для всех игр MLEO",
      "Каждая игра отслеживает вашу активность, завершенные сессии, лучший результат, серии и вехи прогресса",
      "Некоторые игры используют случайные события, в то время как другие фокусируются на времени, реакции, памяти или принятии решений",
      "Нажмите кнопку ℹ️ на каждой карточке игры, чтобы просмотреть правила, управление и структуру наград"
    ]
  },
  es: {
    arcadeWhatDesc: "MLEO Arcade es una colección de 24 emocionantes minijuegos donde puedes recolectar recompensas MLEO dentro de la aplicación! Cada juego tiene mecánicas y multiplicadores únicos.",
    arcadeSteps: [
      "Elige cualquier juego del arcade",
      "Cada sesión usa al menos 1,000 MLEO de tu bóveda dentro de la aplicación. Algunos modos pueden usar un costo de sesión diferente",
      "Sigue las instrucciones específicas del juego",
      "Completa rondas, alcanza hitos y recolecta impulsos de recompensa basados en tus resultados",
      "Las recompensas de sesión se agregan automáticamente a tu bóveda, incluyendo recompensas ganadas en sesiones de juego gratis"
    ],
    arcadeFreePlayList: [
      "Recibe 1 token de juego gratis cada hora (hasta 5 almacenados)",
      "Usa tokens para iniciar una sesión de arcade sin usar MLEO de la bóveda",
      "Las recompensas de sesiones de juego gratis se agregan a tu bóveda igual que las recompensas de sesión estándar"
    ],
    arcadeGoodToKnowList: [
      "Tu bóveda se comparte entre todos los juegos MLEO",
      "Cada juego rastrea tu actividad, sesiones completadas, mejor puntuación, rachas y hitos de progreso",
      "Algunos juegos usan eventos aleatorios, mientras que otros se enfocan en tiempo, reacción, memoria o toma de decisiones",
      "Haz clic en el botón ℹ️ en cada tarjeta de juego para ver las reglas, controles y estructura de recompensas"
    ]
  },
  fr: {
    arcadeWhatDesc: "MLEO Arcade est une collection de 24 mini-jeux passionnants où vous pouvez collecter des récompenses MLEO dans l'application! Chaque jeu a des mécaniques et multiplicateurs uniques.",
    arcadeSteps: [
      "Choisissez n'importe quel jeu de l'arcade",
      "Chaque session utilise au moins 1,000 MLEO de votre coffre dans l'application. Certains modes peuvent utiliser un coût de session différent",
      "Suivez les instructions spécifiques du jeu",
      "Terminez les manches, atteignez les jalons et collectez les boosts de récompense basés sur vos résultats",
      "Les récompenses de session sont automatiquement ajoutées à votre coffre, y compris les récompenses gagnées dans les sessions de jeu gratuit"
    ],
    arcadeFreePlayList: [
      "Recevez 1 token de jeu gratuit chaque heure (jusqu'à 5 stockés)",
      "Utilisez les tokens pour démarrer une session d'arcade sans utiliser MLEO du coffre",
      "Les récompenses des sessions de jeu gratuit sont ajoutées à votre coffre comme les récompenses de session standard"
    ],
    arcadeGoodToKnowList: [
      "Votre coffre est partagé entre tous les jeux MLEO",
      "Chaque jeu suit votre activité, sessions complétées, meilleur score, séries et jalons de progression",
      "Certains jeux utilisent des événements aléatoires, tandis que d'autres se concentrent sur le timing, la réaction, la mémoire ou la prise de décision",
      "Cliquez sur le bouton ℹ️ sur chaque carte de jeu pour voir les règles, contrôles et structure de récompenses"
    ]
  },
  de: {
    arcadeWhatDesc: "MLEO Arcade ist eine Sammlung von 24 spannenden Mini-Spielen, bei denen Sie MLEO-Belohnungen in der App sammeln können! Jedes Spiel hat einzigartige Mechaniken und Multiplikatoren.",
    arcadeSteps: [
      "Wählen Sie ein beliebiges Spiel aus der Arcade",
      "Jede Sitzung verwendet mindestens 1.000 MLEO aus Ihrem Tresor in der App. Einige Modi können unterschiedliche Sitzungskosten verwenden",
      "Folgen Sie den spielspezifischen Anweisungen",
      "Vervollständigen Sie Läufe, erreichen Sie Meilensteine und sammeln Sie Belohnungs-Boosts basierend auf Ihren Ergebnissen",
      "Sitzungsbelohnungen werden automatisch zu Ihrem Tresor hinzugefügt, einschließlich Belohnungen aus kostenlosen Spielsitzungen"
    ],
    arcadeFreePlayList: [
      "Erhalten Sie jede Stunde 1 kostenloses Spiel-Token (bis zu 5 gespeichert)",
      "Verwenden Sie Token, um eine Arcade-Sitzung zu starten, ohne MLEO aus dem Tresor zu verwenden",
      "Belohnungen aus kostenlosen Spielsitzungen werden zu Ihrem Tresor hinzugefügt, genau wie Standard-Sitzungsbelohnungen"
    ],
    arcadeGoodToKnowList: [
      "Ihr Tresor wird von allen MLEO-Spielen geteilt",
      "Jedes Spiel verfolgt Ihre Aktivität, abgeschlossene Sitzungen, beste Punktzahl, Serien und Fortschrittsmeilensteine",
      "Einige Spiele verwenden zufällige Ereignisse, während andere sich auf Timing, Reaktion, Gedächtnis oder Entscheidungsfindung konzentrieren",
      "Klicken Sie auf die ℹ️-Schaltfläche auf jeder Spielkarte, um die Regeln, Steuerungen und Belohnungsstruktur anzuzeigen"
    ]
  },
  zh: {
    arcadeWhatDesc: "MLEO街机是24款激动人心的迷你游戏合集，您可以收集应用内MLEO奖励！每款游戏都有独特的机制和倍数。",
    arcadeSteps: [
      "从街机中选择任何游戏",
      "每场会话至少使用1,000 MLEO从您的应用内金库。某些模式可能使用不同的会话成本",
      "遵循游戏特定的说明",
      "完成回合，达到里程碑，并根据您的结果收集奖励提升",
      "会话奖励自动添加到您的金库，包括从免费游戏会话中获得的奖励"
    ],
    arcadeFreePlayList: [
      "每小时获得1个免费游玩代币（最多5个代币）",
      "使用代币启动一次街机会话，而无需使用金库MLEO",
      "免费游戏会话的奖励会添加到您的金库，就像标准会话奖励一样"
    ],
    arcadeGoodToKnowList: [
      "您的金库在所有MLEO游戏中共享",
      "每款游戏跟踪您的活动、完成的会话、最佳分数、连胜和进度里程碑",
      "一些游戏使用随机事件，而其他游戏则专注于时间、反应、记忆或决策",
      "点击每款游戏卡上的ℹ️按钮查看规则、控制和奖励结构"
    ]
  },
  ja: {
    arcadeWhatDesc: "MLEO Arcadeは、アプリ内MLEO報酬を集めることができる24種類のエキサイティングなミニゲームのコレクションです！各ゲームはユニークなメカニクスとマルチプライヤーがあります。",
    arcadeSteps: [
      "アーケードから任意のゲームを選択",
      "各セッションはアプリ内ボルトから少なくとも1,000 MLEOを使用します。一部のモードは異なるセッションコストを使用する場合があります",
      "ゲーム固有の指示に従う",
      "ラウンドを完了し、マイルストーンに到達し、結果に基づいて報酬ブーストを収集",
      "セッション報酬は、無料プレイセッションで獲得した報酬を含めて、自動的にボルトに追加されます"
    ],
    arcadeFreePlayList: [
      "毎時1つの無料プレイトークンを受け取る（最大5つ保存）",
      "トークンを使用してボルトMLEOを使用せずにアーケードセッションを開始",
      "無料プレイセッションからの報酬は、標準セッション報酬と同様にボルトに追加されます"
    ],
    arcadeGoodToKnowList: [
      "ボルトはすべてのMLEOゲーム間で共有されます",
      "各ゲームは、アクティビティ、完了したセッション、ベストスコア、連勝、進捗マイルストーンを追跡します",
      "一部のゲームはランダムイベントを使用し、他のゲームはタイミング、反応、記憶、または意思決定に焦点を当てています",
      "各ゲームカードのℹ️ボタンをクリックして、ルール、コントロール、報酬構造を表示"
    ]
  },
  ko: {
    arcadeWhatDesc: "MLEO Arcade는 앱 내 MLEO 보상을 수집할 수 있는 24개의 흥미진진한 미니 게임 컬렉션입니다! 각 게임은 고유한 메커니즘과 배수를 가지고 있습니다.",
    arcadeSteps: [
      "아케이드에서 아무 게임이나 선택",
      "각 세션은 앱 내 금고에서 최소 1,000 MLEO를 사용합니다. 일부 모드는 다른 세션 비용을 사용할 수 있습니다",
      "게임별 지침을 따르세요",
      "라운드를 완료하고 마일스톤에 도달하며 결과에 따라 보상 부스트 수집",
      "세션 보상은 무료 플레이 세션에서 획득한 보상을 포함하여 자동으로 금고에 추가됩니다"
    ],
    arcadeFreePlayList: [
      "매시간 1개의 무료 플레이 토큰 받기 (최대 5개 저장)",
      "토큰을 사용하여 금고 MLEO를 사용하지 않고 아케이드 세션 시작",
      "무료 플레이 세션의 보상은 표준 세션 보상과 마찬가지로 금고에 추가됩니다"
    ],
    arcadeGoodToKnowList: [
      "금고는 모든 MLEO 게임 간에 공유됩니다",
      "각 게임은 활동, 완료된 세션, 최고 점수, 연승 및 진행 마일스톤을 추적합니다",
      "일부 게임은 무작위 이벤트를 사용하고 다른 게임은 타이밍, 반응, 기억 또는 의사 결정에 중점을 둡니다",
      "각 게임 카드의 ℹ️ 버튼을 클릭하여 규칙, 컨트롤 및 보상 구조 보기"
    ]
  },
  tr: {
    arcadeWhatDesc: "MLEO Arcade, uygulama içi MLEO ödüllerini toplayabileceğiniz 24 heyecan verici mini oyun koleksiyonudur! Her oyunun benzersiz mekanikleri ve çarpanları vardır.",
    arcadeSteps: [
      "Arcade'den herhangi bir oyun seçin",
      "Her oturum uygulama içi kasasından en az 1,000 MLEO kullanır. Bazı modlar farklı oturum maliyeti kullanabilir",
      "Oyun özel talimatlarını takip edin",
      "Turları tamamlayın, kilometre taşlarına ulaşın ve sonuçlarınıza göre ödül artışları toplayın",
      "Oturum ödülleri, ücretsiz oyun oturumlarında kazanılan ödüller dahil olmak üzere otomatik olarak kasasına eklenir"
    ],
    arcadeFreePlayList: [
      "Her saat 1 ücretsiz oyun jetonu alın (en fazla 5 saklanır)",
      "Kasası MLEO kullanmadan bir arcade oturumu başlatmak için jetonları kullanın",
      "Ücretsiz oyun oturumlarından gelen ödüller, standart oturum ödülleri gibi kasasına eklenir"
    ],
    arcadeGoodToKnowList: [
      "Kasası tüm MLEO oyunları arasında paylaşılır",
      "Her oyun aktivitenizi, tamamlanan oturumları, en iyi skoru, serileri ve ilerleme kilometre taşlarını takip eder",
      "Bazı oyunlar rastgele olaylar kullanırken, diğerleri zamanlama, tepki, hafıza veya karar vermeye odaklanır",
      "Kuralları, kontrolleri ve ödül yapısını görüntülemek için her oyun kartındaki ℹ️ düğmesine tıklayın"
    ]
  },
  it: {
    arcadeWhatDesc: "MLEO Arcade è una collezione di 24 mini-giochi entusiasmanti dove puoi raccogliere ricompense MLEO nell'app! Ogni gioco ha meccaniche e moltiplicatori unici.",
    arcadeSteps: [
      "Scegli qualsiasi gioco dall'arcade",
      "Ogni sessione utilizza almeno 1,000 MLEO dal tuo caveau nell'app. Alcune modalità possono utilizzare un costo di sessione diverso",
      "Segui le istruzioni specifiche del gioco",
      "Completa i round, raggiungi i traguardi e raccogli i potenziamenti delle ricompense in base ai tuoi risultati",
      "Le ricompense della sessione vengono aggiunte automaticamente al tuo caveau, incluse le ricompense ottenute nelle sessioni di gioco gratuito"
    ],
    arcadeFreePlayList: [
      "Ricevi 1 token di gioco gratuito ogni ora (fino a 5 memorizzati)",
      "Usa i token per avviare una sessione arcade senza usare MLEO dal caveau",
      "Le ricompense delle sessioni di gioco gratuito vengono aggiunte al tuo caveau proprio come le ricompense di sessione standard"
    ],
    arcadeGoodToKnowList: [
      "Il tuo caveau è condiviso tra tutti i giochi MLEO",
      "Ogni gioco traccia la tua attività, sessioni completate, miglior punteggio, serie e traguardi di progresso",
      "Alcuni giochi utilizzano eventi casuali, mentre altri si concentrano su tempismo, reazione, memoria o decision making",
      "Clicca il pulsante ℹ️ su ogni scheda del gioco per visualizzare regole, controlli e struttura delle ricompense"
    ]
  },
  ka: {
    arcadeWhatDesc: "MLEO Arcade არის 24 საინტერესო მინი-თამაშების კოლექცია, სადაც შეგიძლიათ შეაგროვოთ აპლიკაციაში MLEO ჯილდოები! თითოეულ თამაშს აქვს უნიკალური მექანიკა და მულტიპლიკატორები.",
    arcadeSteps: [
      "აირჩიეთ ნებისმიერი თამაში არკადიდან",
      "თითოეული სესია იყენებს მინიმუმ 1,000 MLEO თქვენი აპლიკაციაში ვოლტიდან. ზოგიერთ რეჟიმს შეიძლება გამოიყენოს სხვა სესიის ღირებულება",
      "მიჰყევით თამაშის სპეციფიკურ ინსტრუქციებს",
      "დაასრულეთ რაუნდები, მიაღწიეთ მილიენისტონებს და შეაგროვეთ ჯილდოს ბუსტები თქვენი შედეგების მიხედვით",
      "სესიის ჯილდოები ავტომატურად ემატება თქვენს ვოლტს, მათ შორის უფასო თამაშის სესიებში მოპოვებული ჯილდოები"
    ],
    arcadeFreePlayList: [
      "მიიღეთ 1 უფასო თამაშის ტოკენი ყოველ საათში (მაქსიმუმ 5 შენახული)",
      "გამოიყენეთ ტოკენები არკადის სესიის დასაწყებად ვოლტის MLEO-ს გამოყენების გარეშე",
      "უფასო თამაშის სესიებიდან ჯილდოები ემატება თქვენს ვოლტს, ისევე როგორც სტანდარტული სესიის ჯილდოები"
    ],
    arcadeGoodToKnowList: [
      "თქვენი ვოლტი იზიარება ყველა MLEO თამაშს შორის",
      "თითოეული თამაში ადევნებს თვალს თქვენს აქტივობას, დასრულებულ სესიებს, საუკეთესო ქულას, სერიებსა და პროგრესის მილიენისტონებს",
      "ზოგიერთი თამაში იყენებს შემთხვევით მოვლენებს, ხოლო სხვები ფოკუსირდება დროზე, რეაქციაზე, მეხსენებაზე ან გადაწყვეტილების მიღებაზე",
      "დააწკაპუნეთ ℹ️ ღილაკზე თითოეულ თამაშის ბარათზე წესების, კონტროლებისა და ჯილდოს სტრუქტურის სანახავად"
    ]
  },
  pl: {
    arcadeWhatDesc: "MLEO Arcade to kolekcja 24 ekscytujących mini-gier, w których możesz zbierać nagrody MLEO w aplikacji! Każda gra ma unikalną mechanikę i mnożniki.",
    arcadeSteps: [
      "Wybierz dowolną grę z salonu gier",
      "Każda sesja używa co najmniej 1,000 MLEO z twojego skarbca w aplikacji. Niektóre tryby mogą używać innego kosztu sesji",
      "Postępuj zgodnie z instrukcjami specyficznymi dla gry",
      "Ukończ rundy, osiągnij kamienie milowe i zbieraj wzmocnienia nagród na podstawie swoich wyników",
      "Nagrody sesji są automatycznie dodawane do twojego skarbca, w tym nagrody zdobyte w darmowych sesjach gry"
    ],
    arcadeFreePlayList: [
      "Otrzymuj 1 token darmowej gry co godzinę (do 5 przechowywanych)",
      "Używaj tokenów do rozpoczęcia sesji salonu gier bez używania MLEO ze skarbca",
      "Nagrody z darmowych sesji gry są dodawane do twojego skarbca tak samo jak standardowe nagrody sesji"
    ],
    arcadeGoodToKnowList: [
      "Twój skarbiec jest współdzielony między wszystkimi grami MLEO",
      "Każda gra śledzi twoją aktywność, ukończone sesje, najlepszy wynik, serie i kamienie milowe postępu",
      "Niektóre gry używają losowych wydarzeń, podczas gdy inne skupiają się na czasie, reakcji, pamięci lub podejmowaniu decyzji",
      "Kliknij przycisk ℹ️ na każdej karcie gry, aby wyświetlić zasady, kontrolki i strukturę nagród"
    ]
  },
  ro: {
    arcadeWhatDesc: "MLEO Arcade este o colecție de 24 mini-jocuri captivante unde poți colecta recompense MLEO în aplicație! Fiecare joc are mecanici și multiplicatori unici.",
    arcadeSteps: [
      "Alege orice joc din arcade",
      "Fiecare sesiune folosește cel puțin 1,000 MLEO din seiful tău în aplicație. Unele moduri pot folosi un cost de sesiune diferit",
      "Urmează instrucțiunile specifice jocului",
      "Finalizează runde, atinge obiectivele și colectează impulsuri de recompensă bazate pe rezultatele tale",
      "Recompensele sesiunii sunt adăugate automat în seiful tău, inclusiv recompensele câștigate în sesiunile de joc gratuit"
    ],
    arcadeFreePlayList: [
      "Primește 1 token de joc gratuit la fiecare oră (până la 5 stocate)",
      "Folosește tokenurile pentru a începe o sesiune arcade fără a folosi MLEO din seif",
      "Recompensele din sesiunile de joc gratuit sunt adăugate în seiful tău la fel ca recompensele standard de sesiune"
    ],
    arcadeGoodToKnowList: [
      "Seiful tău este partajat între toate jocurile MLEO",
      "Fiecare joc urmărește activitatea ta, sesiunile finalizate, cel mai bun scor, seriile și obiectivele de progres",
      "Unele jocuri folosesc evenimente aleatoare, în timp ce altele se concentrează pe sincronizare, reacție, memorie sau luarea deciziilor",
      "Apasă butonul ℹ️ pe fiecare carte de joc pentru a vedea regulile, controalele și structura recompenselor"
    ]
  },
  cs: {
    arcadeWhatDesc: "MLEO Arcade je sbírka 24 vzrušujících miniher, kde můžete sbírat odměny MLEO v aplikaci! Každá hra má jedinečné mechaniky a multiplikátory.",
    arcadeSteps: [
      "Vyberte libovolnou hru z arkád",
      "Každá relace používá alespoň 1,000 MLEO z vašeho trezoru v aplikaci. Některé režimy mohou používat jiné náklady na relaci",
      "Postupujte podle pokynů specifických pro hru",
      "Dokončete kola, dosáhněte milníků a sbírejte posílení odměn na základě vašich výsledků",
      "Odměny relace jsou automaticky přidávány do vašeho trezoru, včetně odměn získaných v bezplatných herních relacích"
    ],
    arcadeFreePlayList: [
      "Získejte 1 token bezplatné hry každou hodinu (až 5 uložených)",
      "Použijte tokeny k zahájení arkádové relace bez použití MLEO z trezoru",
      "Odměny z bezplatných herních relací jsou přidávány do vašeho trezoru stejně jako standardní odměny relace"
    ],
    arcadeGoodToKnowList: [
      "Váš trezor je sdílen mezi všemi hrami MLEO",
      "Každá hra sleduje vaši aktivitu, dokončené relace, nejlepší skóre, série a milníky pokroku",
      "Některé hry používají náhodné události, zatímco jiné se zaměřují na načasování, reakci, paměť nebo rozhodování",
      "Klikněte na tlačítko ℹ️ na každé herní kartě pro zobrazení pravidel, ovládacích prvků a struktury odměn"
    ]
  },
  nl: {
    arcadeWhatDesc: "MLEO Arcade is een verzameling van 24 spannende mini-games waar je MLEO-beloningen in de app kunt verzamelen! Elke game heeft unieke mechanica en vermenigvuldigers.",
    arcadeSteps: [
      "Kies een willekeurige game uit de arcade",
      "Elke sessie gebruikt minimaal 1,000 MLEO uit je kluis in de app. Sommige modi kunnen verschillende sessiekosten gebruiken",
      "Volg de gamespecifieke instructies",
      "Voltooi rondes, bereik mijlpalen en verzamel beloningsboosts op basis van je resultaten",
      "Sessiebeloningen worden automatisch toegevoegd aan je kluis, inclusief beloningen verdiend in gratis spelsessies"
    ],
    arcadeFreePlayList: [
      "Ontvang elk uur 1 gratis speeltoken (tot 5 opgeslagen)",
      "Gebruik tokens om een arcade-sessie te starten zonder kluis MLEO te gebruiken",
      "Beloningen van gratis spelsessies worden toegevoegd aan je kluis, net als standaard sessiebeloningen"
    ],
    arcadeGoodToKnowList: [
      "Je kluis wordt gedeeld tussen alle MLEO-games",
      "Elke game volgt je activiteit, voltooide sessies, beste score, reeksen en voortgangsmijlpalen",
      "Sommige games gebruiken willekeurige gebeurtenissen, terwijl andere zich richten op timing, reactie, geheugen of besluitvorming",
      "Klik op de ℹ️-knop op elke gamekaart om de regels, bedieningselementen en beloningsstructuur te bekijken"
    ]
  },
  el: {
    arcadeWhatDesc: "Το MLEO Arcade είναι μια συλλογή 24 συναρπαστικών μίνι παιχνιδιών όπου μπορείτε να συλλέξετε ανταμοιβές MLEO στην εφαρμογή! Κάθε παιχνίδι έχει μοναδικές μηχανικές και πολλαπλασιαστές.",
    arcadeSteps: [
      "Επιλέξτε οποιοδήποτε παιχνίδι από το arcade",
      "Κάθε συνεδρία χρησιμοποιεί τουλάχιστον 1,000 MLEO από το χρηματοκιβώτιό σας στην εφαρμογή. Ορισμένες λειτουργίες μπορεί να χρησιμοποιούν διαφορετικό κόστος συνεδρίας",
      "Ακολουθήστε τις οδηγίες ειδικές για το παιχνίδι",
      "Ολοκληρώστε γύρους, φτάστε στα ορόσημα και συλλέξτε ενισχύσεις ανταμοιβών με βάση τα αποτελέσματά σας",
      "Οι ανταμοιβές συνεδρίας προστίθενται αυτόματα στο χρηματοκιβώτιό σας, συμπεριλαμβανομένων των ανταμοιβών που κερδίζονται σε δωρεάν συνεδρίες παιχνιδιού"
    ],
    arcadeFreePlayList: [
      "Λάβετε 1 δωρεάν token παιχνιδιού κάθε ώρα (έως 5 αποθηκευμένα)",
      "Χρησιμοποιήστε tokens για να ξεκινήσετε μια συνεδρία arcade χωρίς να χρησιμοποιήσετε MLEO από το χρηματοκιβώτιο",
      "Οι ανταμοιβές από δωρεάν συνεδρίες παιχνιδιού προστίθενται στο χρηματοκιβώτιό σας όπως οι τυπικές ανταμοιβές συνεδρίας"
    ],
    arcadeGoodToKnowList: [
      "Το χρηματοκιβώτιό σας μοιράζεται μεταξύ όλων των παιχνιδιών MLEO",
      "Κάθε παιχνίδι παρακολουθεί τη δραστηριότητά σας, τις ολοκληρωμένες συνεδρίες, την καλύτερη βαθμολογία, τις σειρές και τα ορόσημα προόδου",
      "Ορισμένα παιχνίδια χρησιμοποιούν τυχαία γεγονότα, ενώ άλλα εστιάζουν στον συγχρονισμό, την αντίδραση, τη μνήμη ή τη λήψη αποφάσεων",
      "Κάντε κλικ στο κουμπί ℹ️ σε κάθε κάρτα παιχνιδιού για να δείτε τους κανόνες, τα στοιχεία ελέγχου και τη δομή ανταμοιβών"
    ]
  },
  he: {
    arcadeWhatDesc: "MLEO Arcade הוא אוסף של 24 מיני-משחקים מרגשים שבהם תוכלו לאסוף פרסי MLEO בתוך האפליקציה! לכל משחק יש מכניקות ומכפילים ייחודיים.",
    arcadeSteps: [
      "בחרו כל משחק מהארקייד",
      "כל סשן משתמש בלפחות 1,000 MLEO מהכספת שלכם באפליקציה. חלק מהמצבים עשויים להשתמש בעלות סשן שונה",
      "עקבו אחר ההוראות הספציפיות למשחק",
      "השלימו סבבים, הגיעו לאבני דרך ואספו הגברות פרסים בהתבסס על התוצאות שלכם",
      "פרסי הסשן מתווספים אוטומטית לכספת שלכם, כולל פרסים שהושגו בסשני משחק חינמיים"
    ],
    arcadeFreePlayList: [
      "קבלו 1 אסימון משחק חינמי בכל שעה (עד 5 מאוחסנים)",
      "השתמשו באסימונים כדי להתחיל סשן ארקייד אחד ללא שימוש ב-MLEO מהכספת",
      "פרסים מסשני משחק חינמיים מתווספים לכספת שלכם בדיוק כמו פרסי סשן סטנדרטיים"
    ],
    arcadeGoodToKnowList: [
      "הכספת שלכם משותפת בין כל משחקי MLEO",
      "כל משחק עוקב אחר הפעילות שלכם, סשנים שהושלמו, הציון הטוב ביותר, רצפים ואבני דרך התקדמות",
      "חלק מהמשחקים משתמשים באירועים אקראיים, בעוד שאחרים מתמקדים בתזמון, תגובה, זיכרון או קבלת החלטות",
      "לחצו על כפתור ℹ️ בכל כרטיס משחק כדי לראות את הכללים, הבקרות ומבנה הפרסים"
    ]
  }
};

function updateTranslations(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠ File not found: ${filePath}`);
    return false;
  }
  
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    // Update English first
    const enPattern = /(arcadeWhatDesc: ")[^"]*(")/;
    if (enPattern.test(content)) {
      content = content.replace(enPattern, `$1${enTranslations.arcadeWhatDesc}$2`);
      modified = true;
    }
    
    // Update arcadeSteps for English
    const enStepsPattern = /(arcadeSteps: \[)([\s\S]*?)(\])/;
    const enStepsMatch = content.match(new RegExp(`(arcadeSteps: \\[)([\\s\\S]*?)(\\],)`));
    if (enStepsMatch) {
      const newSteps = enTranslations.arcadeSteps.map(s => `      "${s}"`).join(',\n');
      content = content.replace(enStepsPattern, `$1\n${newSteps}\n    ]`);
      modified = true;
    }
    
    // Update arcadeFreePlayList for English
    const enFreePlayPattern = /(arcadeFreePlayList: \[)([\s\S]*?)(\])/;
    const enFreePlayMatch = content.match(new RegExp(`(arcadeFreePlayList: \\[)([\\s\\S]*?)(\\],)`));
    if (enFreePlayMatch) {
      const newFreePlay = enTranslations.arcadeFreePlayList.map(s => `      "${s}"`).join(',\n');
      content = content.replace(enFreePlayPattern, `$1\n${newFreePlay}\n    ]`);
      modified = true;
    }
    
    // Update arcadeGoodToKnowList for English
    const enGoodToKnowPattern = /(arcadeGoodToKnowList: \[)([\s\S]*?)(\])/;
    const enGoodToKnowMatch = content.match(new RegExp(`(arcadeGoodToKnowList: \\[)([\\s\\S]*?)(\\],)`));
    if (enGoodToKnowMatch) {
      const newGoodToKnow = enTranslations.arcadeGoodToKnowList.map(s => `      "${s}"`).join(',\n');
      content = content.replace(enGoodToKnowPattern, `$1\n${newGoodToKnow}\n    ]`);
      modified = true;
    }
    
    // Update other languages
    Object.keys(translations).forEach(lang => {
      const langData = translations[lang];
      
      // Update arcadeWhatDesc
      const langDescPattern = new RegExp(`(  ${lang}: \\{[\\s\\S]*?arcadeWhatDesc: ")([^"]*)(")`);
      if (langDescPattern.test(content)) {
        content = content.replace(langDescPattern, `$1${langData.arcadeWhatDesc}$3`);
        modified = true;
      }
      
      // Update arcadeSteps
      const langStepsPattern = new RegExp(`(  ${lang}: \\{[\\s\\S]*?arcadeSteps: \\[)([\\s\\S]*?)(\\],)`);
      if (langStepsPattern.test(content)) {
        const newSteps = langData.arcadeSteps.map(s => `      "${s}"`).join(',\n');
        content = content.replace(langStepsPattern, `$1\n${newSteps}\n    ]`);
        modified = true;
      }
      
      // Update arcadeFreePlayList
      const langFreePlayPattern = new RegExp(`(  ${lang}: \\{[\\s\\S]*?arcadeFreePlayList: \\[)([\\s\\S]*?)(\\],)`);
      if (langFreePlayPattern.test(content)) {
        const newFreePlay = langData.arcadeFreePlayList.map(s => `      "${s}"`).join(',\n');
        content = content.replace(langFreePlayPattern, `$1\n${newFreePlay}\n    ]`);
        modified = true;
      }
      
      // Update arcadeGoodToKnowList
      const langGoodToKnowPattern = new RegExp(`(  ${lang}: \\{[\\s\\S]*?arcadeGoodToKnowList: \\[)([\\s\\S]*?)(\\],)`);
      if (langGoodToKnowPattern.test(content)) {
        const newGoodToKnow = langData.arcadeGoodToKnowList.map(s => `      "${s}"`).join(',\n');
        content = content.replace(langGoodToKnowPattern, `$1\n${newGoodToKnow}\n    ]`);
        modified = true;
      }
    });
    
    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✓ Updated: ${filePath}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`✗ Error processing ${filePath}:`, error.message);
    return false;
  }
}

// Main execution
console.log('Starting update of arcade translations in all languages...\n');
updateTranslations('pages/mining.js');
console.log('\nUpdate complete!');
