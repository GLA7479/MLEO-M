import { useState, useEffect, useRef } from "react";
import Layout from "../../components/Layout";
import { useRouter } from "next/router";
import { useIOSViewportFix } from "../../hooks/useIOSViewportFix";

const LEVELS = {
  easy: {
    name: "Easy",
    addition: { max: 9 },
    subtraction: { min: 1, max: 20 },
    multiplication: { max: 5 },
    division: { max: 10, maxDivisor: 5 },
  },
  medium: {
    name: "Medium",
    addition: { max: 50 },
    subtraction: { min: 10, max: 100 },
    multiplication: { max: 10 },
    division: { max: 100, maxDivisor: 10 },
  },
  hard: {
    name: "Hard",
    addition: { max: 100 },
    subtraction: { min: 50, max: 200 },
    multiplication: { max: 12 },
    division: { max: 144, maxDivisor: 12 },
  },
};

// הוספת סוג פעולה "fractions" לשברים
const OPERATIONS = [
  "addition",
  "subtraction",
  "multiplication",
  "division",
  "mixed",
  "fractions",
];

// חלוקה לכיתות – אילו סוגי תרגילים מותר לכל כיתה
const GRADES = {
  g1_2: {
    name: "Grade 1–2",
    operations: ["addition", "subtraction", "mixed"], // מיקס של חיבור וחיסור
  },
  g3_4: {
    name: "Grade 3–4",
    operations: ["addition", "subtraction", "multiplication", "mixed"], // מיקס של חיבור, חיסור וכפל
  },
  g5_6: {
    name: "Grade 5–6",
    operations: ["addition", "subtraction", "multiplication", "division", "mixed", "fractions"],
  },
};

// התאמת טווחי המספרים לפי כיתה + רמת קושי (במקום factor כללי)
function getLevelForGrade(levelKey, gradeKey) {
  const base = LEVELS[levelKey];

  // ברירת מחדל – נתחיל מה־LEVELS שלך
  const cfg = {
    name: base.name,
    addition: { max: base.addition.max },
    subtraction: { min: base.subtraction.min, max: base.subtraction.max },
    multiplication: { max: base.multiplication.max },
    division: { max: base.division.max, maxDivisor: base.division.maxDivisor },
  };

  switch (gradeKey) {
    case "g1_2": {
      // כיתה א–ב: רק חיבור/חיסור קטן, לא מתעסקים במספרים גדולים
      if (levelKey === "easy") {
        cfg.addition.max = 10;           // 1–10
        cfg.subtraction = { min: 1, max: 10 };
      } else if (levelKey === "medium") {
        cfg.addition.max = 20;           // 1–20
        cfg.subtraction = { min: 1, max: 20 };
      } else {
        cfg.addition.max = 30;           // 1–30
        cfg.subtraction = { min: 1, max: 30 };
      }
      // למקרה שיום אחד תאפשר כפל/חילוק בכיתות האלה – נשאיר קטן
      cfg.multiplication.max = 5;
      cfg.division = { max: 20, maxDivisor: 5 };
      break;
    }

    case "g3_4": {
      // כיתה ג–ד: חיבור/חיסור עד 100–200, כפל עד 10–12
      if (levelKey === "easy") {
        cfg.addition.max = 50;           // 1–50
        cfg.subtraction = { min: 1, max: 50 };
        cfg.multiplication.max = 6;      // 1–6
      } else if (levelKey === "medium") {
        cfg.addition.max = 100;          // 1–100
        cfg.subtraction = { min: 1, max: 100 };
        cfg.multiplication.max = 10;     // 1–10
      } else {
        cfg.addition.max = 200;          // 1–200
        cfg.subtraction = { min: 1, max: 200 };
        cfg.multiplication.max = 12;     // 1–12
      }
      // אם בעתיד תוסיף חילוק לכיתות האלה
      cfg.division = { max: 100, maxDivisor: 10 };
      break;
    }

    case "g5_6": {
      // כיתה ה–ו: כבר אפשר מספרים גדולים יותר
      if (levelKey === "easy") {
        cfg.addition.max = 200;            // 1–200
        cfg.subtraction = { min: 1, max: 200 };
        cfg.multiplication.max = 10;       // 1–10
        cfg.division = { max: 100, maxDivisor: 10 };
      } else if (levelKey === "medium") {
        cfg.addition.max = 500;            // 1–500
        cfg.subtraction = { min: 1, max: 500 };
        cfg.multiplication.max = 12;       // 1–12
        cfg.division = { max: 200, maxDivisor: 12 };
      } else {
        cfg.addition.max = 1000;           // 1–1000
        cfg.subtraction = { min: 1, max: 1000 };
        cfg.multiplication.max = 20;       // עד 20×20
        cfg.division = { max: 500, maxDivisor: 20 };
      }
      break;
    }

    default:
      // fallback – אם נוסיף כיתה חדשה בעתיד
      break;
  }

  return cfg;
}

const MODES = {
  learning: {
    name: "Learning",
    description: "No hard game over, practice at your pace",
  },
  challenge: {
    name: "Challenge",
    description: "Timer + lives, high score race",
  },
  speed: {
    name: "Speed Run",
    description: "Fast answers = more points! ⚡",
  },
  marathon: {
    name: "Marathon",
    description: "How many questions can you solve? 🏃",
  },
  practice: {
    name: "Practice",
    description: "Focus on one operation 📚",
  },
};

const STORAGE_KEY = "mleo_math_master";

// Build top 10 scores by score (highest first)
function buildTop10ByScore(saved, level) {
  const allScores = [];

  OPERATIONS.forEach((op) => {
    const key = `${level}_${op}`;
    const levelData = saved[key] || [];

    if (Array.isArray(levelData)) {
      // New format – array
      levelData.forEach((entry) => {
        const bestScore = entry.bestScore ?? entry.score ?? 0;
        const bestStreak = entry.bestStreak ?? entry.streak ?? 0;

        if (bestScore > 0) {
          allScores.push({
            name: entry.playerName || entry.name || "Player",
            bestScore,
            bestStreak,
            operation: op,
            timestamp: entry.timestamp || 0,
          });
        }
      });
    } else {
      // Old format – object { [name]: {bestScore, bestStreak...} }
      Object.entries(levelData).forEach(([name, data]) => {
        const bestScore = data.bestScore ?? data.score ?? 0;
        const bestStreak = data.bestStreak ?? data.streak ?? 0;

        if (bestScore > 0) {
          allScores.push({
            name,
            bestScore,
            bestStreak,
            operation: op,
            timestamp: data.timestamp || 0,
          });
        }
      });
    }
  });

  // Sort: first by score, then by streak, then by timestamp (newer first)
  const sorted = allScores
    .sort((a, b) => {
      if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore;
      if (b.bestStreak !== a.bestStreak) return b.bestStreak - a.bestStreak;
      return (b.timestamp || 0) - (a.timestamp || 0);
    })
    .slice(0, 10);

  // If there are fewer than 10 records, fill with placeholders
  while (sorted.length < 10) {
    sorted.push({
      name: "-",
      bestScore: 0,
      bestStreak: 0,
      operation: "",
      timestamp: 0,
      placeholder: true,
    });
  }

  return sorted;
}

// Save score entry - handles conversion from old format (object) to new format (array)
function saveScoreEntry(saved, key, entry) {
  let levelData = saved[key];

  if (!levelData) {
    // Nothing exists – start with new array
    levelData = [];
  } else if (!Array.isArray(levelData)) {
    // Old format: convert to array of entries
    levelData = Object.entries(levelData).map(([name, data]) => ({
      playerName: name,
      bestScore: data.bestScore ?? data.score ?? 0,
      bestStreak: data.bestStreak ?? data.streak ?? 0,
      timestamp: data.timestamp || 0,
    }));
  }

  levelData.push(entry);

  // Limit to 100 entries
  if (levelData.length > 100) {
    levelData = levelData.slice(-100);
  }

  saved[key] = levelData;
}

function generateQuestion(
  level,
  operation,
  gradeKey,
  useStory = false,
  mixedOps = null,
  practiceFocus = "default"
) {
  const isMixed = operation === "mixed";
  let ops;
  
  if (isMixed) {
    // מיקס לפי הפעולות שנבחרו או הפעולות הזמינות לכל כיתה
    let availableOps;
    if (mixedOps) {
      // השתמש בפעולות שנבחרו
      availableOps = Object.entries(mixedOps)
        .filter(([op, selected]) => selected && op !== "fractions")
        .map(([op]) => op);
    } else {
      // ברירת מחדל - כל הפעולות הזמינות
      availableOps = GRADES[gradeKey].operations.filter(
        (op) => op !== "mixed" && op !== "fractions"
      );
    }
    
    // אם אין פעולות נבחרות, נשתמש בברירת מחדל
    if (availableOps.length === 0) {
      availableOps = GRADES[gradeKey].operations.filter(
        (op) => op !== "mixed" && op !== "fractions"
      );
    }
    
    ops = availableOps[Math.floor(Math.random() * availableOps.length)];
  } else {
    ops = operation;
  }

  let a, b, correctAnswer, question;

  switch (ops) {
    case "addition": {
      let maxAdd = level.addition.max;

      // תרגול ממוקד: חיבור עד 20
      if (practiceFocus === "add_to_20") {
        maxAdd = Math.min(maxAdd, 20);
      }

      a = Math.floor(Math.random() * maxAdd) + 1;
      b = Math.floor(Math.random() * maxAdd) + 1;
      correctAnswer = a + b;
      if (useStory) {
        const stories = [
          `יש לך ${a} תפוחים וקיבלת עוד ${b}. כמה תפוחים יש לך\u200F?`,
          `בכיתה יש ${a} ילדים, הגיעו עוד ${b}. כמה ילדים יש עכשיו\u200F?`,
          `יש לך ${a} כדורים, קנית עוד ${b}. כמה כדורים יש לך\u200F?`,
        ];
        question = stories[Math.floor(Math.random() * stories.length)];
      } else {
        question = `${a} + ${b} = ?`;
      }
      break;
    }

    case "subtraction": {
      const max = level.subtraction.max;
      const min = level.subtraction.min;
      a = Math.floor(Math.random() * (max - min + 1)) + min;
      b = Math.floor(Math.random() * a); // כולל 0, כדי שיצאו גם 0– וכאלה
      correctAnswer = a - b;
      if (useStory) {
        const stories = [
          `היו לך ${a} ממתקים, אכלת ${b}. כמה נשאר\u200F?`,
          `בקופסה היו ${a} צעצועים, הוצאת ${b}. כמה נשאר\u200F?`,
          `היו ${a} בלונים, ${b} התפוצצו. כמה נשארו\u200F?`,
        ];
        question = stories[Math.floor(Math.random() * stories.length)];
      } else {
        question = `${a} - ${b} = ?`;
      }
      break;
    }

    case "multiplication": {
      // לכיתות גבוהות – לפעמים שני מספרים דו־ספרתיים
      let maxA = level.multiplication.max;
      let maxB = level.multiplication.max;

      if (gradeKey === "g5_6" && level.name !== "Easy") {
        maxA = Math.min(20, level.multiplication.max * 2);
        maxB = Math.min(20, level.multiplication.max * 2);
      }

      // תרגול ממוקד: טבלת כפל 6–8
      if (practiceFocus === "times_6_8") {
        const baseFactors = [6, 7, 8];
        a = baseFactors[Math.floor(Math.random() * baseFactors.length)];
        b = Math.floor(Math.random() * Math.min(12, maxB)) + 1;
      } else {
        a = Math.floor(Math.random() * maxA) + 1;
        b = Math.floor(Math.random() * maxB) + 1;
      }

      correctAnswer = a * b;
      if (useStory) {
        const stories = [
          `יש לך ${a} קופסאות, בכל אחת ${b} כדורים. כמה כדורים יש\u200F?`,
          `בכל שורה יש ${a} עציצים, יש ${b} שורות. כמה עציצים יש\u200F?`,
          `כל ילד קיבל ${a} ממתקים, יש ${b} ילדים. כמה ממתקים בסך הכל\u200F?`,
        ];
        question = stories[Math.floor(Math.random() * stories.length)];
      } else {
        question = `${a} × ${b} = ?`;
      }
      break;
    }

    case "division": {
      // חילוק עם תוצאה שלמה
      const maxDivisor = level.division.maxDivisor;
      const divisor =
        Math.floor(Math.random() * (maxDivisor - 1)) + 2; // 2..maxDivisor

      let maxQuotient = Math.floor(level.division.max / divisor);
      if (gradeKey === "g5_6" && level.name === "Hard") {
        maxQuotient = Math.min(maxQuotient, 50);
      } else {
        maxQuotient = Math.min(maxQuotient, 20);
      }

      const quotient =
        Math.floor(Math.random() * Math.max(2, maxQuotient)) + 1;

      a = divisor * quotient;
      b = divisor;
      correctAnswer = quotient;
      if (useStory) {
        const stories = [
          `יש לך ${a} ממתקים, אתה רוצה לחלק אותם שווה בשווה ל-${b} ילדים. כמה ממתקים כל ילד יקבל\u200F?`,
          `יש ${a} כדורים, אתה רוצה לשים אותם ב-${b} קופסאות שוות. כמה כדורים בכל קופסה\u200F?`,
          `יש לך ${a} ספרים, אתה רוצה לחלק אותם ל-${b} ערימות שוות. כמה ספרים בכל ערימה\u200F?`,
        ];
        question = stories[Math.floor(Math.random() * stories.length)];
      } else {
        question = `${a} ÷ ${b} = ?`;
      }
      break;
    }

    case "fractions": {
      // שברים – רק לכיתות הגבוהות, אחרת ניפול אחורה לחיבור רגיל
      if (gradeKey !== "g5_6") {
        return generateQuestion(level, "addition", gradeKey);
      }

      // שברים עם מכנה משותף
      const denominators = [2, 3, 4, 5, 6, 8, 10, 12];
      const denom =
        denominators[Math.floor(Math.random() * denominators.length)];

      let n1 = Math.floor(Math.random() * (denom - 1)) + 1;
      let n2 = Math.floor(Math.random() * (denom - 1)) + 1;

      // נשמור על תוצאה לא גדולה מידי
      if (n1 + n2 > denom * 2) {
        n2 = Math.max(1, denom * 2 - n1);
      }

      correctAnswer = `${n1 + n2}/${denom}`;
      question = `${n1}/${denom} + ${n2}/${denom} = ?`;
      break;
    }

    default: {
      return generateQuestion(level, "addition", gradeKey);
    }
  }

  // יצירת תשובות שגויות
  const wrongAnswers = new Set();

  if (ops === "fractions") {
    // תשובות שגויות על בסיס מונה +-1 או +-2
    const [numStr, denStr] = String(correctAnswer).split("/");
    const num = parseInt(numStr, 10);
    const den = parseInt(denStr, 10);

    while (wrongAnswers.size < 3) {
      const delta = [-2, -1, 1, 2][Math.floor(Math.random() * 4)];
      const wrongNum = num + delta;
      if (wrongNum <= 0 || wrongNum === num) continue;
      const wrong = `${wrongNum}/${den}`;
      if (wrong !== correctAnswer) {
        wrongAnswers.add(wrong);
      }
    }
  } else {
    while (wrongAnswers.size < 3) {
      let wrong;
      if (ops === "multiplication") {
        wrong = correctAnswer + Math.floor(Math.random() * 20) - 10;
      } else if (ops === "division") {
        wrong = correctAnswer + Math.floor(Math.random() * 10) - 5;
      } else {
        wrong = correctAnswer + Math.floor(Math.random() * 20) - 10;
      }

      if (wrong !== correctAnswer && wrong > 0 && !wrongAnswers.has(wrong)) {
        wrongAnswers.add(wrong);
      }
    }
  }

  const allAnswers = [correctAnswer, ...Array.from(wrongAnswers)];

  // Shuffle answers
  for (let i = allAnswers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allAnswers[i], allAnswers[j]] = [allAnswers[j], allAnswers[i]];
  }

  return {
    question,
    correctAnswer,
    answers: allAnswers,
    operation: ops,
    a,
    b,
    isStory: useStory || false,
  };
}

// פונקציה ליצירת רמז
function getHint(question, operation, gradeKey) {
  if (!question) return "";

  // לשברים לא חייבים a/b
  if (operation !== "fractions" && (!question.a || !question.b)) {
    return "";
  }

  const { a, b } = question;

  switch (operation) {
    case "addition":
      if (gradeKey === "g1_2") {
        return `התחל מהמספר הגדול (${Math.max(a, b)}) וספור קדימה עוד ${Math.min(a, b)} צעדים.`;
      }
      return `נסה לפרק לעשרות ויחידות: לדוגמה ${a} + ${b} = (עשרות) + (יחידות).`;

    case "subtraction":
      if (gradeKey === "g1_2") {
        return `תחשוב: כמה חסר ל-${b} כדי להגיע ל-${a}\u200F? אפשר לספור קדימה.`;
      }
      return `נסה להשתמש ב"חיסור בהשלמה": מה-${b} ל-${a} כמה קפיצות יש\u200F?`;

    case "multiplication":
      if (gradeKey === "g3_4") {
        return `${a} × ${b} זה בעצם ${a} + ${a} + ... (${b} פעמים).`;
      }
      return `חלק את אחד המספרים: לדוגמה ${a} × ${b} = ${a} × (${Math.floor(
        b / 2
      )} + ${Math.ceil(b / 2)}) ואז חיבור התוצאות.`;

    case "division":
      if (gradeKey === "g3_4") {
        return `דמיין ${a} פריטים שחולקו ל-${b} קבוצות שוות. כמה בכל קבוצה\u200F?`;
      }
      return `חישוב חילוק ארוך: כמה פעמים ${b} "נכנס" ב-${a}, ומה נשאר בכל צעד.`;

    case "fractions":
      return `כשמחברים שברים עם אותו מכנה:
1. המכנה נשאר אותו דבר.
2. מחברים רק את המונים (המספרים העליונים).
3. אם אפשר, מצמצמים את השבר (מחלקים גם את המונה וגם את המכנה באותו מספר).`;

    default:
      return "נסה לחשוב על הפתרון צעד אחר צעד.";
  }
}

// הסבר מפורט צעד-אחר-צעד לפי סוג תרגיל וכיתה
function getSolutionSteps(question, operation, gradeKey) {
  if (!question) return [];
  const { a, b, correctAnswer } = question;

  switch (operation) {
    case "addition": {
      if (gradeKey === "g1_2") {
        return [
          `1. נכתוב את התרגיל: ${a} + ${b}.`,
          `2. בוחרים את המספר הגדול יותר: ${Math.max(a, b)}.`,
          `3. סופרים קדימה עוד ${Math.min(a, b)} צעדים (אפשר על אצבעות או על המספרים על המסך).`,
          `4. המספר שבו נעצרים הוא התוצאה: ${correctAnswer}.`,
        ];
      }
      // ג–ו: שיטת עשרות-יחידות
      return [
        `1. נפרק את המספרים לעשרות ויחידות.`,
        `2. נחבר קודם את היחידות, ואז את העשרות.`,
        `3. אם קיבלנו יותר מ-10 ביחידות – נעביר 1 לעשרות.`,
        `4. נסכם את העשרות והיחידות ונקבל ${correctAnswer}.`,
      ];
    }

    case "subtraction": {
      if (gradeKey === "g1_2") {
        return [
          `1. נכתוב את התרגיל: ${a} - ${b}.`,
          `2. נתחיל מ-${a} ונלך אחורה ${b} צעדים.`,
          `3. נספור כל צעד בקול.`,
          `4. המספר שבו נעצרים הוא התוצאה: ${correctAnswer}.`,
        ];
      }
      return [
        `1. נכתוב את התרגיל אחד מעל השני בטור.`,
        `2. נחסר יחידות מיחידות. אם אי אפשר – נשאיל "1" מעמודת העשרות.`,
        `3. נחסר עשרות מעשרות (כולל ההשאלה אם הייתה).`,
        `4. נבדוק שהתוצאה הגיונית (קטנה מ-${a}) – התוצאה: ${correctAnswer}.`,
      ];
    }

    case "multiplication": {
      if (gradeKey === "g3_4") {
        return [
          `1. נבין ש-${a} × ${b} פירושו ${a} חזרות של ${b} או ${b} חזרות של ${a}.`,
          `2. נוכל לצייר טבלה עם ${a} שורות ו-${b} עמודות ולספור את כל הנקודות.`,
          `3. נספור את כל הנקודות ונקבל ${correctAnswer}.`,
        ];
      }
      // ה–ו: פירוק לגורמים נוחים
      return [
        `1. נפרק את אחד הגורמים (לדוגמה את ${b}) לסכום נוח – עשרות ויחידות.`,
        `2. נחשב ${a} כפול העשרות, ואז ${a} כפול היחידות.`,
        `3. נחבר את שתי התוצאות.`,
        `4. נקבל את ${correctAnswer}.`,
      ];
    }

    case "division": {
      return [
        `1. נבין ש-${a} ÷ ${b} פירושו "כמה קבוצות שוות של ${b} יש בתוך ${a}\u200F?".`,
        `2. נוכל לצייר ${b} קופסאות ולחלק את ה-${a} פריטים שווה בשווה.`,
        `3. נכניס פריט אחד בכל פעם לכל קופסה עד שנגמרים הפריטים.`,
        `4. כמה פריטים יש בכל קופסה\u200F? זה התוצאה: ${correctAnswer}.`,
      ];
    }

    case "fractions": {
      return [
        `1. כשמחברים שברים עם אותו מכנה – המכנה (המספר התחתון) נשאר אותו דבר.`,
        `2. מחברים רק את המונים (המספרים העליונים).`,
        `3. אם המונה גדול מהמכנה, אפשר להפוך לשבר מעורב (שלם ועוד שבר).`,
        `4. אם אפשר – מצמצמים (מחלקים גם את המונה וגם את המכנה באותו מספר).`,
      ];
    }

    default:
      return [];
  }
}

// "למה טעיתי?" – הסבר קצר לטעות נפוצה
function getErrorExplanation(question, operation, wrongAnswer, gradeKey) {
  if (!question) return "";
  const userAnsNum = Number(wrongAnswer);
  const correctNum = Number(question.correctAnswer);

  switch (operation) {
    case "addition":
      if (!Number.isNaN(userAnsNum) && userAnsNum < correctNum) {
        return "נראה שהפסקת לספור מוקדם מדי. נסה לספור שוב מהמספר הגדול ולהוסיף את השני.";
      }
      if (!Number.isNaN(userAnsNum) && userAnsNum > correctNum) {
        return "נראה שהוספת יותר מדי. בדוק שוב את העשרות והיחידות.";
      }
      return "בדוק שוב: האם חיברת את שני המספרים בדיוק פעם אחת כל אחד?";

    case "subtraction":
      if (!Number.isNaN(userAnsNum) && userAnsNum > correctNum) {
        return "נראה שהגדלת במקום להקטין – אולי חיברת במקום לחסר?";
      }
      return "תזכור: בחיסור אנחנו מתחילים מהמספר הגדול והולכים אחורה, לא קדימה.";

    case "multiplication":
      return "בכפל חשוב לזכור: זה חיבור חוזר. בדוק כמה פעמים חיברת את המספר, והאם זה בדיוק מספר הפעמים הנכון.";

    case "division":
      return "בדוק: כמה פעמים המספר המחלק נכנס במספר המחולק? אם מכפלת התוצאה במחלק לא יוצאת בדיוק – התוצאה לא נכונה.";

    case "fractions":
      return "בשברים עם אותו מכנה – מחברים רק את המספרים העליונים, והמכנה נשאר אותו דבר. אולי שינית גם את המכנה בטעות?";

    default:
      return "";
  }
}


export default function MathMaster() {
  useIOSViewportFix();
  const router = useRouter();
  const wrapRef = useRef(null);
  const headerRef = useRef(null);
  const gameRef = useRef(null);
  const controlsRef = useRef(null);
  const operationSelectRef = useRef(null);

  const [mounted, setMounted] = useState(false);

  // NEW: grade & mode
  const [grade, setGrade] = useState("g3_4");
  const [mode, setMode] = useState("learning");

  const [level, setLevel] = useState("easy");
  const [operation, setOperation] = useState("addition"); // לא mixed כברירת מחדל כדי שה-modal לא יפתח אוטומטית
  const [gameActive, setGameActive] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [timeLeft, setTimeLeft] = useState(20);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [bestScore, setBestScore] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

  // NEW: lives (for Challenge mode)
  const [lives, setLives] = useState(3);

  // Progress stats (אפשר להרחיב בעתיד)
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [avgTime, setAvgTime] = useState(0);
  const [questionStartTime, setQuestionStartTime] = useState(null);

  // מניעת שאלות חוזרות
  const [recentQuestions, setRecentQuestions] = useState(new Set());

  // מערכת כוכבים ותגים
  const [stars, setStars] = useState(0);
  const [badges, setBadges] = useState([]);
  const [showBadge, setShowBadge] = useState(null);

  // מערכת רמות עם XP
  const [playerLevel, setPlayerLevel] = useState(1);
  const [xp, setXp] = useState(0);
  const [showLevelUp, setShowLevelUp] = useState(false);

  // מערכת התקדמות אישית
  const [progress, setProgress] = useState({
    addition: { total: 0, correct: 0 },
    subtraction: { total: 0, correct: 0 },
    multiplication: { total: 0, correct: 0 },
    division: { total: 0, correct: 0 },
    fractions: { total: 0, correct: 0 },
  });

  // תחרויות יומיות
  const [dailyChallenge, setDailyChallenge] = useState({
    date: new Date().toDateString(),
    bestScore: 0,
    questions: 0,
  });

  // רמזים
  const [showHint, setShowHint] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);

  // הסבר מפורט לשאלה
  const [showSolution, setShowSolution] = useState(false);

  // הסבר לטעות אחרונה
  const [errorExplanation, setErrorExplanation] = useState("");

  // תרגול ממוקד (רק במצב Practice)
  const [practiceFocus, setPracticeFocus] = useState("default"); // default | add_to_20 | times_6_8

  // מצב story questions
  const [useStoryQuestions, setUseStoryQuestions] = useState(false);
  const [storyOnly, setStoryOnly] = useState(false); // שאלות מילוליות בלבד

  // בחירת פעולות למיקס
  const [showMixedSelector, setShowMixedSelector] = useState(false);
  const [mixedOperations, setMixedOperations] = useState({
    addition: true,
    subtraction: true,
    multiplication: false,
    division: false,
  });

  const [showMultiplicationTable, setShowMultiplicationTable] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardLevel, setLeaderboardLevel] = useState("easy");
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [playerName, setPlayerName] = useState("");
  const [selectedRow, setSelectedRow] = useState(null);
  const [selectedCol, setSelectedCol] = useState(null);
  const [highlightedAnswer, setHighlightedAnswer] = useState(null);
  const [tableMode, setTableMode] = useState("multiplication"); // "multiplication" or "division"
  const [selectedResult, setSelectedResult] = useState(null); // For division mode
  const [selectedDivisor, setSelectedDivisor] = useState(null); // For division mode
  const [selectedCell, setSelectedCell] = useState(null); // {row, col, value}

  useEffect(() => {
    setMounted(true);

    // Load best scores for current player
    if (typeof window !== "undefined") {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        const key = `${level}_${operation}`;

        if (saved[key] && playerName.trim()) {
          if (Array.isArray(saved[key])) {
            const playerScores = saved[key].filter(
              (s) => s.playerName === playerName.trim()
            );
            if (playerScores.length > 0) {
              const maxScore = Math.max(
                ...playerScores.map((s) => s.bestScore || 0),
                0
              );
              const maxStreak = Math.max(
                ...playerScores.map((s) => s.bestStreak || 0),
                0
              );
              setBestScore(maxScore);
              setBestStreak(maxStreak);
            } else {
              setBestScore(0);
              setBestStreak(0);
            }
          } else {
            if (saved[key][playerName.trim()]) {
              setBestScore(saved[key][playerName.trim()].bestScore || 0);
              setBestStreak(saved[key][playerName.trim()].bestStreak || 0);
            } else {
              setBestScore(0);
              setBestStreak(0);
            }
          }
        } else {
          setBestScore(0);
          setBestStreak(0);
        }
      } catch {}
    }
  }, [level, operation, playerName]);

  // לוודא שהפעולה שתבחר קיימת לכיתה שנבחרה
  useEffect(() => {
    // אל תשנה אם ה-modal פתוח
    if (showMixedSelector) return;
    
    const allowed = GRADES[grade].operations;
    if (!allowed.includes(operation)) {
      // מצא את הפעולה הראשונה שזמינה (לא mixed)
      const firstAllowed = allowed.find(op => op !== "mixed") || allowed[0];
      setOperation(firstAllowed);
    }
  }, [grade]); // רק כשהכיתה משתנה, לא כשהפעולה משתנה

  // עדכון mixedOperations לפי הכיתה
  useEffect(() => {
    const availableOps = GRADES[grade].operations.filter(
      (op) => op !== "mixed" && op !== "fractions"
    );
    const newMixedOps = {
      addition: availableOps.includes("addition"),
      subtraction: availableOps.includes("subtraction"),
      multiplication: availableOps.includes("multiplication"),
      division: availableOps.includes("division"),
    };
    setMixedOperations(newMixedOps);
  }, [grade]);

  // לא צריך useEffect - ה-modal נפתח ישירות ב-onChange

  // בדיקה אם זה יום חדש לתחרות יומית
  useEffect(() => {
    const today = new Date().toDateString();
    if (dailyChallenge.date !== today) {
      setDailyChallenge({ date: today, bestScore: 0, questions: 0 });
    }
  }, [dailyChallenge.date]);

  // לא צריך event listener - ה-modal נפתח רק ב-onChange או דרך כפתור ⚙️

  // טעינת נתונים מ-localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY + "_progress") || "{}");
      if (saved.stars) setStars(saved.stars);
      if (saved.badges) setBadges(saved.badges);
      if (saved.playerLevel) setPlayerLevel(saved.playerLevel);
      if (saved.xp) setXp(saved.xp);
      if (saved.progress) setProgress(saved.progress);
    } catch {}
  }, []);

  // Load leaderboard data when modal opens or level changes
  useEffect(() => {
    if (showLeaderboard && typeof window !== "undefined") {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        const topScores = buildTop10ByScore(saved, leaderboardLevel);
        setLeaderboardData(topScores);
      } catch (e) {
        console.error("Error loading leaderboard:", e);
        setLeaderboardData([]);
      }
    }
  }, [showLeaderboard, leaderboardLevel]);

  // Dynamic layout calculation - stable, no state dependencies
  useEffect(() => {
    if (!wrapRef.current || !mounted) return;
    const calc = () => {
      const rootH = window.visualViewport?.height ?? window.innerHeight;
      const safeBottom =
        Number(
          getComputedStyle(document.documentElement)
            .getPropertyValue("--satb")
            .replace("px", "")
        ) || 0;
      const headH = headerRef.current?.offsetHeight || 0;
      document.documentElement.style.setProperty("--head-h", headH + "px");

      const controlsH = controlsRef.current?.offsetHeight || 40;
      const used =
        headH +
        controlsH +
        100 + // Title, score, timer
        safeBottom +
        32;
      const freeH = Math.max(300, rootH - used);
      document.documentElement.style.setProperty("--game-h", freeH + "px");
    };
    const timer = setTimeout(calc, 100);
    window.addEventListener("resize", calc);
    window.visualViewport?.addEventListener("resize", calc);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", calc);
      window.visualViewport?.removeEventListener("resize", calc);
    };
  }, [mounted]);

  // Timer countdown (רק במצב Challenge או Speed)
  useEffect(() => {
    if (!gameActive || (mode !== "challenge" && mode !== "speed")) return;
    if (timeLeft == null) return;

    if (timeLeft <= 0) {
      handleTimeUp();
      return;
    }

    const timer = setTimeout(() => {
      setTimeLeft((prev) => (prev != null ? prev - 1 : prev));
    }, 1000);

    return () => clearTimeout(timer);
  }, [gameActive, mode, timeLeft]);

  // שמירת ריצה נוכחית ל־localStorage + עדכון Best & Leaderboard
  function saveRunToStorage() {
    if (typeof window === "undefined" || !playerName.trim()) return;

    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const key = `${level}_${operation}`;

      saveScoreEntry(saved, key, {
        playerName: playerName.trim(),
        bestScore: score,
        bestStreak: streak,
        timestamp: Date.now(),
      });

      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));

      const playerScores = (saved[key] || []).filter(
        (s) => s.playerName === playerName.trim()
      );
      const maxScore = Math.max(
        ...playerScores.map((s) => s.bestScore || 0),
        0
      );
      const maxStreak = Math.max(
        ...playerScores.map((s) => s.bestStreak || 0),
        0
      );
      setBestScore(maxScore);
      setBestStreak(maxStreak);

      if (showLeaderboard) {
        const topScores = buildTop10ByScore(saved, leaderboardLevel);
        setLeaderboardData(topScores);
      }
    } catch {}
  }

  function hardResetGame() {
    setGameActive(false);
    setCurrentQuestion(null);
    setScore(0);
    setStreak(0);
    setCorrect(0);
    setWrong(0);
    setTimeLeft(20);
    setSelectedAnswer(null);
    setFeedback(null);
    setLives(3);
    setTotalQuestions(0);
    setAvgTime(0);
    setQuestionStartTime(null);
  }

  function generateNewQuestion() {
    const levelConfig = getLevelForGrade(level, grade);
    let question;
    let attempts = 0;
    const maxAttempts = 50; // מקסימום ניסיונות למצוא שאלה חדשה

    do {
      question = generateQuestion(
        levelConfig,
        operation,
        grade,
        useStoryQuestions || storyOnly, // אם storyOnly מופעל, תמיד שאלות מילוליות
        operation === "mixed" ? mixedOperations : null, // העבר את הפעולות שנבחרו למיקס
        practiceFocus
      );
      attempts++;

      // יצירת מפתח ייחודי לשאלה
      const questionKey = question.question;

      // אם השאלה לא הייתה לאחרונה, נשתמש בה
      if (!recentQuestions.has(questionKey)) {
        // שמירת השאלה החדשה בהיסטוריה
        setRecentQuestions((prev) => {
          const newSet = new Set(prev);
          newSet.add(questionKey);
          // שמירה רק על 20 שאלות אחרונות
          if (newSet.size > 20) {
            const first = Array.from(newSet)[0];
            newSet.delete(first);
          }
          return newSet;
        });
        break;
      }
    } while (attempts < maxAttempts);

    // אם לא מצאנו שאלה חדשה אחרי 50 ניסיונות, נשתמש בכל מקרה
    if (attempts >= maxAttempts) {
      // איפוס ההיסטוריה כדי לאפשר שאלות חוזרות
      setRecentQuestions(new Set());
    }

    setCurrentQuestion(question);
    setSelectedAnswer(null);
    setFeedback(null);
    setQuestionStartTime(Date.now());
    setShowHint(false);
    setHintUsed(false);
    setShowSolution(false);
    setErrorExplanation("");
  }

  function startGame() {
    setRecentQuestions(new Set()); // איפוס ההיסטוריה
    setGameActive(true);
    setScore(0);
    setStreak(0);
    setCorrect(0);
    setWrong(0);
    setTotalQuestions(0);
    setAvgTime(0);
    setQuestionStartTime(null);
    setFeedback(null);
    setSelectedAnswer(null);
    setLives(mode === "challenge" ? 3 : 0);
    setShowHint(false);
    setHintUsed(false);
    setShowBadge(null);
    setShowLevelUp(false);
    setShowSolution(false);
    setErrorExplanation("");

    // הגדרת טיימר לפי מצב
    if (mode === "challenge") {
      setTimeLeft(20);
    } else if (mode === "speed") {
      setTimeLeft(10); // טיימר קצר יותר למצב מהירות
    } else {
      setTimeLeft(null);
    }

    generateNewQuestion();
  }

  function stopGame() {
    setGameActive(false);
    setCurrentQuestion(null);
    setFeedback(null);
    setSelectedAnswer(null);
    saveRunToStorage();
  }

  function handleTimeUp() {
    // Time up – במצב Challenge או Speed
    setWrong((prev) => prev + 1);
    setStreak(0);
    setFeedback("Time's up! Game Over! ⏰");
    setGameActive(false);
    setCurrentQuestion(null);
    setTimeLeft(0);
    saveRunToStorage();

    setTimeout(() => {
      hardResetGame();
    }, 2000);
  }

  function handleAnswer(answer) {
    if (selectedAnswer || !gameActive || !currentQuestion) return;

    // סטטיסטיקה – ספירת שאלה וזמן
    setTotalQuestions((prevCount) => {
      const newCount = prevCount + 1;
      if (questionStartTime) {
        const elapsed = (Date.now() - questionStartTime) / 1000;
        setAvgTime((prevAvg) =>
          prevCount === 0 ? elapsed : (prevAvg * prevCount + elapsed) / newCount
        );
      }
      return newCount;
    });

    setSelectedAnswer(answer);
    const isCorrect = answer === currentQuestion.correctAnswer;

    if (isCorrect) {
      // חישוב נקודות לפי מצב
      let points = 10 + streak;
      if (mode === "speed") {
        const timeBonus = timeLeft ? Math.floor(timeLeft * 2) : 0;
        points += timeBonus; // בונוס זמן במצב מהירות
      }
      
      setScore((prev) => prev + points);
      setStreak((prev) => prev + 1);
      setCorrect((prev) => prev + 1);
      
      setErrorExplanation("");

      // עדכון התקדמות אישית
      const op = currentQuestion.operation;
      setProgress((prev) => ({
        ...prev,
        [op]: {
          total: (prev[op]?.total || 0) + 1,
          correct: (prev[op]?.correct || 0) + 1,
        },
      }));

      // מערכת כוכבים - כוכב כל 5 תשובות נכונות
      const newCorrect = correct + 1;
      if (newCorrect % 5 === 0) {
        setStars((prev) => {
          const newStars = prev + 1;
          // שמירה ל-localStorage
          if (typeof window !== "undefined") {
            try {
              const saved = JSON.parse(localStorage.getItem(STORAGE_KEY + "_progress") || "{}");
              saved.stars = newStars;
              localStorage.setItem(STORAGE_KEY + "_progress", JSON.stringify(saved));
            } catch {}
          }
          return newStars;
        });
      }

      // מערכת תגים
      const newStreak = streak + 1;
      if (newStreak === 10 && !badges.includes("🔥 Hot Streak")) {
        const newBadge = "🔥 Hot Streak";
        setBadges((prev) => [...prev, newBadge]);
        setShowBadge(newBadge);
        setTimeout(() => setShowBadge(null), 3000);
        if (typeof window !== "undefined") {
          try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY + "_progress") || "{}");
            saved.badges = [...badges, newBadge];
            localStorage.setItem(STORAGE_KEY + "_progress", JSON.stringify(saved));
          } catch {}
        }
      } else if (newStreak === 25 && !badges.includes("⚡ Lightning Fast")) {
        const newBadge = "⚡ Lightning Fast";
        setBadges((prev) => [...prev, newBadge]);
        setShowBadge(newBadge);
        setTimeout(() => setShowBadge(null), 3000);
        if (typeof window !== "undefined") {
          try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY + "_progress") || "{}");
            saved.badges = [...badges, newBadge];
            localStorage.setItem(STORAGE_KEY + "_progress", JSON.stringify(saved));
          } catch {}
        }
      } else if (newStreak === 50 && !badges.includes("🌟 Master")) {
        const newBadge = "🌟 Master";
        setBadges((prev) => [...prev, newBadge]);
        setShowBadge(newBadge);
        setTimeout(() => setShowBadge(null), 3000);
        if (typeof window !== "undefined") {
          try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY + "_progress") || "{}");
            saved.badges = [...badges, newBadge];
            localStorage.setItem(STORAGE_KEY + "_progress", JSON.stringify(saved));
          } catch {}
        }
      }

      // מערכת XP ורמות
      const xpGain = hintUsed ? 5 : 10; // פחות XP אם השתמש ברמז
      setXp((prev) => {
        const newXp = prev + xpGain;
        const xpNeeded = playerLevel * 100;
        
        if (newXp >= xpNeeded) {
          setPlayerLevel((prevLevel) => {
            const newLevel = prevLevel + 1;
            setShowLevelUp(true);
            setTimeout(() => setShowLevelUp(false), 3000);
            if (typeof window !== "undefined") {
              try {
                const saved = JSON.parse(localStorage.getItem(STORAGE_KEY + "_progress") || "{}");
                saved.playerLevel = newLevel;
                saved.xp = newXp - xpNeeded;
                localStorage.setItem(STORAGE_KEY + "_progress", JSON.stringify(saved));
              } catch {}
            }
            return newLevel;
          });
          return newXp - xpNeeded;
        }
        
        if (typeof window !== "undefined") {
          try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY + "_progress") || "{}");
            saved.xp = newXp;
            localStorage.setItem(STORAGE_KEY + "_progress", JSON.stringify(saved));
          } catch {}
        }
        return newXp;
      });

      // עדכון תחרות יומית
      setDailyChallenge((prev) => ({
        ...prev,
        bestScore: Math.max(prev.bestScore, score + points),
        questions: prev.questions + 1,
      }));

      setFeedback("Correct! 🎉");
      if ("vibrate" in navigator) navigator.vibrate?.(50);

      setTimeout(() => {
        generateNewQuestion();
        if (mode === "challenge") {
          setTimeLeft(20);
        } else if (mode === "speed") {
          setTimeLeft(10);
        } else {
          setTimeLeft(null);
        }
      }, 1000);
    } else {
      setWrong((prev) => prev + 1);
      setStreak(0);
      
      setErrorExplanation(
        getErrorExplanation(
          currentQuestion,
          currentQuestion.operation,
          answer,
          grade
        )
      );
      
      // עדכון התקדמות אישית
      const op = currentQuestion.operation;
      setProgress((prev) => ({
        ...prev,
        [op]: {
          total: (prev[op]?.total || 0) + 1,
          correct: prev[op]?.correct || 0,
        },
      }));
      
      if ("vibrate" in navigator) navigator.vibrate?.(200);

      if (mode === "learning") {
        // במצב למידה – אין Game Over, רק הצגת תשובה והמשך
        setFeedback(
          `Wrong! Correct answer: ${currentQuestion.correctAnswer} ❌`
        );
        setTimeout(() => {
          generateNewQuestion();
          setSelectedAnswer(null);
          setFeedback(null);
          setTimeLeft(null);
        }, 1500);
      } else {
        // מצב Challenge – עובדים עם חיים
        setFeedback(
          `Wrong! Correct: ${currentQuestion.correctAnswer} ❌ (-1 ❤️)`
        );
        setLives((prevLives) => {
          const nextLives = prevLives - 1;

          if (nextLives <= 0) {
            // Game Over
            setFeedback("Game Over! 💔");
            saveRunToStorage();
            setGameActive(false);
            setCurrentQuestion(null);
            setTimeLeft(0);
            setTimeout(() => {
              hardResetGame();
            }, 2000);
          } else {
            setTimeout(() => {
              generateNewQuestion();
              setSelectedAnswer(null);
              setFeedback(null);
              setTimeLeft(20);
            }, 1500);
          }

          return nextLives;
        });
      }
    }
  }

  function resetStats() {
    setScore(0);
    setStreak(0);
    setCorrect(0);
    setWrong(0);
    setBestScore(0);
    setBestStreak(0);
    if (typeof window !== "undefined") {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        const key = `${level}_${operation}`;
        delete saved[key];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      } catch {}
    }
  }

  const backSafe = () => {
    router.push("/local-arcade");
  };

  const getOperationName = (op) => {
    switch (op) {
      case "addition":
        return "+";
      case "subtraction":
        return "-";
      case "multiplication":
        return "×";
      case "division":
        return "÷";
      case "mixed":
        return "🎲 Mixed";
      case "fractions":
        return "⅟ Fractions";
      default:
        return op;
    }
  };

  if (!mounted)
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0f1d] to-[#141928] flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );

  const accuracy =
    totalQuestions > 0 ? Math.round((correct / totalQuestions) * 100) : 0;

  return (
    <Layout>
      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden bg-gradient-to-b from-[#0a0f1d] to-[#141928]"
        style={{ height: "100svh" }}
      >
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)",
              backgroundSize: "30px 30px",
            }}
          />
        </div>

        <div
          ref={headerRef}
          className="absolute top-0 left-0 right-0 z-50 pointer-events-none"
        >
          <div
            className="relative px-2 py-3"
            style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
          >
            <div className="absolute left-2 top-2 flex gap-2 pointer-events-auto">
              <button
                onClick={backSafe}
                className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10"
              >
                BACK
              </button>
            </div>
            <div className="absolute right-2 top-2 pointer-events-auto">
              <span className="text-xs uppercase tracking-[0.3em] text-white/60">
                Local
              </span>
            </div>
          </div>
        </div>

        <div
          className="relative h-full flex flex-col items-center justify-start px-4 pb-4"
          style={{
            minHeight: "100%",
            paddingTop: "calc(var(--head-h, 56px) + 8px)",
          }}
        >
          <div className="text-center mb-1">
            <h1 className="text-2xl font-extrabold text-white mb-0.5">
              🧮 Math Master
            </h1>
            <p className="text-white/70 text-xs">
              {playerName || "Player"} • {GRADES[grade].name} •{" "}
              {LEVELS[level].name} • {getOperationName(operation)} •{" "}
              {MODES[mode].name}
            </p>
          </div>

          <div
            ref={controlsRef}
            className={`grid gap-1 mb-1 w-full max-w-md ${
              stars > 0 || playerLevel > 1
                ? "grid-cols-6"
                : "grid-cols-5"
            }`}
          >
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">Score</div>
              <div className="text-sm font-bold text-emerald-400">{score}</div>
            </div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">Streak</div>
              <div className="text-sm font-bold text-amber-400">🔥{streak}</div>
            </div>
            {stars > 0 && (
              <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
                <div className="text-[10px] text-white/60">Stars</div>
                <div className="text-sm font-bold text-yellow-400">⭐{stars}</div>
              </div>
            )}
            {playerLevel > 1 && (
              <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
                <div className="text-[10px] text-white/60">Level</div>
                <div className="text-sm font-bold text-purple-400">Lv.{playerLevel}</div>
              </div>
            )}
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">✅</div>
              <div className="text-sm font-bold text-green-400">{correct}</div>
            </div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">Lives</div>
              <div className="text-sm font-bold text-rose-400">
                {mode === "challenge" ? `${lives} ❤️` : "∞"}
              </div>
            </div>
            <div
              className={`rounded-lg p-1 text-center ${
                gameActive && (mode === "challenge" || mode === "speed") && timeLeft <= 5
                  ? "bg-red-500/30 border-2 border-red-400 animate-pulse"
                  : "bg-black/30 border border-white/10"
              }`}
            >
              <div className="text-[10px] text-white/60">⏰ Timer</div>
              <div
                className={`text-lg font-black ${
                  gameActive && (mode === "challenge" || mode === "speed") && timeLeft <= 5
                    ? "text-red-400"
                    : gameActive && (mode === "challenge" || mode === "speed")
                    ? "text-yellow-400"
                    : "text-white/60"
                }`}
              >
                {gameActive
                  ? mode === "challenge" || mode === "speed"
                    ? timeLeft ?? "--"
                    : "∞"
                  : "--"}
              </div>
            </div>
          </div>

          {/* בחירת מצב (Learning / Challenge) */}
          <div className="flex items-center justify-center gap-2 mb-2 flex-wrap w-full max-w-md">
            {Object.keys(MODES).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setGameActive(false);
                  setFeedback(null);
                }}
                className={`h-8 px-3 rounded-lg text-xs font-bold transition-all ${
                  mode === m
                    ? "bg-emerald-500/80 text-white"
                    : "bg-white/10 text-white/70 hover:bg-white/20"
                }`}
              >
                {MODES[m].name}
              </button>
            ))}
          </div>

          {/* הודעות מיוחדות */}
          {showBadge && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none">
              <div className="bg-gradient-to-br from-yellow-400 to-orange-500 text-white px-8 py-6 rounded-2xl shadow-2xl text-center animate-bounce">
                <div className="text-4xl mb-2">🎉</div>
                <div className="text-2xl font-bold">New Badge!</div>
                <div className="text-xl">{showBadge}</div>
              </div>
            </div>
          )}
          
          {showLevelUp && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none">
              <div className="bg-gradient-to-br from-purple-500 to-pink-500 text-white px-8 py-6 rounded-2xl shadow-2xl text-center animate-pulse">
                <div className="text-4xl mb-2">🌟</div>
                <div className="text-2xl font-bold">Level Up!</div>
                <div className="text-xl">You're now Level {playerLevel}!</div>
              </div>
            </div>
          )}

          {!gameActive ? (
            <>
              <div className="flex items-center justify-center gap-2 mb-2 flex-wrap w-full max-w-md">
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Player Name"
                  className="h-9 px-3 rounded-lg bg-black/30 border border-white/20 text-white text-sm font-bold placeholder:text-white/40 flex-1 min-w-[120px]"
                  maxLength={15}
                />
                <select
                  value={grade}
                  onChange={(e) => {
                    setGrade(e.target.value);
                    setGameActive(false);
                  }}
                  className="h-9 px-3 rounded-lg bg-black/30 border border-white/20 text-white text-xs font-bold"
                >
                  {Object.keys(GRADES).map((g) => (
                    <option key={g} value={g}>
                      {GRADES[g].name}
                    </option>
                  ))}
                </select>
                <select
                  value={level}
                  onChange={(e) => {
                    setLevel(e.target.value);
                    setGameActive(false);
                  }}
                  className="h-9 px-3 rounded-lg bg-black/30 border border-white/20 text-white text-xs font-bold"
                >
                  {Object.keys(LEVELS).map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {LEVELS[lvl].name}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1">
                  <select
                    ref={operationSelectRef}
                    value={operation}
                    onChange={(e) => {
                      const newOp = e.target.value;
                      setGameActive(false);
                      // אם בוחרים mixed, פתח את ה-modal לבחירת פעולות
                      if (newOp === "mixed") {
                        // עדכן את operation
                        setOperation(newOp);
                        // פתח את ה-modal מיד
                        setShowMixedSelector(true);
                      } else {
                        setOperation(newOp);
                        // סגור את ה-modal אם הוא היה פתוח
                        setShowMixedSelector(false);
                      }
                    }}
                    className="h-9 px-3 rounded-lg bg-black/30 border border-white/20 text-white text-xs font-bold flex-1"
                  >
                    {GRADES[grade].operations.map((op) => (
                      <option key={op} value={op}>
                        {getOperationName(op)}
                      </option>
                    ))}
                  </select>
                  {/* כפתור לפתיחת modal אם operation הוא mixed */}
                  {operation === "mixed" && (
                    <button
                      onClick={() => {
                        setShowMixedSelector(true);
                      }}
                      className="h-9 w-9 rounded-lg bg-blue-500/80 hover:bg-blue-500 border border-white/20 text-white text-xs font-bold flex items-center justify-center"
                      title="ערוך פעולות למיקס"
                    >
                      ⚙️
                    </button>
                  )}
                </div>
              </div>

              {/* בחירת נושא תרגול ממוקד – רק במצב Practice */}
              {mode === "practice" && (
                <select
                  value={practiceFocus}
                  onChange={(e) => setPracticeFocus(e.target.value)}
                  className="h-9 px-3 rounded-lg bg-black/30 border border-white/20 text-white text-xs font-bold w-full max-w-md mb-2"
                >
                  <option value="default">📚 כל התרגילים</option>
                  <option value="add_to_20">➕ חיבור עד 20</option>
                  <option value="times_6_8">✖️ טבלת כפל 6–8</option>
                </select>
              )}

              <div className="grid grid-cols-3 gap-2 mb-2 w-full max-w-md">
                <div className="bg-black/20 border border-white/10 rounded-lg p-2 text-center">
                  <div className="text-xs text-white/60">Best Score</div>
                  <div className="text-lg font-bold text-emerald-400">
                    {bestScore}
                  </div>
                </div>
                <div className="bg-black/20 border border-white/10 rounded-lg p-2 text-center">
                  <div className="text-xs text-white/60">Best Streak</div>
                  <div className="text-lg font-bold text-amber-400">
                    {bestStreak}
                  </div>
                </div>
                <div className="bg-black/20 border border-white/10 rounded-lg p-2 text-center">
                  <div className="text-xs text-white/60">Accuracy</div>
                  <div className="text-lg font-bold text-blue-400">
                    {accuracy}%
                  </div>
                </div>
              </div>
              
              {/* תצוגת כוכבים, רמה ותגים */}
              {(stars > 0 || playerLevel > 1 || badges.length > 0) && (
                <div className="grid grid-cols-3 gap-2 mb-2 w-full max-w-md">
                  {stars > 0 && (
                    <div className="bg-black/20 border border-white/10 rounded-lg p-2 text-center">
                      <div className="text-xs text-white/60">Stars</div>
                      <div className="text-lg font-bold text-yellow-400">
                        ⭐ {stars}
                      </div>
                    </div>
                  )}
                  {playerLevel > 1 && (
                    <div className="bg-black/20 border border-white/10 rounded-lg p-2 text-center">
                      <div className="text-xs text-white/60">Level</div>
                      <div className="text-lg font-bold text-purple-400">
                        Lv.{playerLevel} ({xp}/{playerLevel * 100} XP)
                      </div>
                    </div>
                  )}
                  {badges.length > 0 && (
                    <div className="bg-black/20 border border-white/10 rounded-lg p-2 text-center">
                      <div className="text-xs text-white/60">Badges</div>
                      <div className="text-sm font-bold text-orange-400">
                        {badges.length} 🏅
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* תחרות יומית */}
              <div className="bg-black/20 border border-white/10 rounded-lg p-2 mb-2 w-full max-w-md text-center">
                <div className="text-xs text-white/60 mb-1">Daily Challenge</div>
                <div className="text-sm text-white">
                  Best: {dailyChallenge.bestScore} • Questions: {dailyChallenge.questions}
                </div>
              </div>
              
              {/* אפשרות לשאלות עם סיפור */}
              <div className="flex items-center justify-center gap-4 mb-2 w-full max-w-md flex-wrap">
                <label className="flex items-center gap-2 text-white text-sm">
                  <input
                    type="checkbox"
                    checked={useStoryQuestions}
                    onChange={(e) => {
                      setUseStoryQuestions(e.target.checked);
                      if (!e.target.checked) setStoryOnly(false); // אם מכבים story, גם מכבים storyOnly
                    }}
                    className="w-4 h-4"
                  />
                  📖 Story Questions
                </label>
                {useStoryQuestions && (
                  <label className="flex items-center gap-2 text-white text-sm">
                    <input
                      type="checkbox"
                      checked={storyOnly}
                      onChange={(e) => setStoryOnly(e.target.checked)}
                      className="w-4 h-4"
                    />
                    📝 Story Only
                  </label>
                )}
              </div>

              <div className="flex items-center justify-center gap-2 mb-2 flex-wrap w-full max-w-md">
                <button
                  onClick={startGame}
                  disabled={!playerName.trim()}
                  className="h-10 px-6 rounded-lg bg-emerald-500/80 hover:bg-emerald-500 disabled:bg-gray-500/50 disabled:cursor-not-allowed font-bold text-sm"
                >
                  ▶️ Start
                </button>
                <button
                  onClick={() => setShowMultiplicationTable(true)}
                  className="h-10 px-4 rounded-lg bg-blue-500/80 hover:bg-blue-500 font-bold text-sm"
                >
                  📊 Times Table
                </button>
                <button
                  onClick={() => setShowLeaderboard(true)}
                  className="h-10 px-4 rounded-lg bg-amber-500/80 hover:bg-amber-500 font-bold text-sm"
                >
                  🏆 Leaderboard
                </button>
                {bestScore > 0 && (
                  <button
                    onClick={resetStats}
                    className="h-10 px-4 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-sm"
                  >
                    🧹 Reset
                  </button>
                )}
              </div>
              {!playerName.trim() && (
                <p className="text-xs text-white/60 text-center mb-2">
                  Enter your name to start
                </p>
              )}
            </>
          ) : (
            <>
              {feedback && (
                <div
                  className={`mb-2 px-4 py-2 rounded-lg text-sm font-semibold text-center ${
                    feedback.includes("Correct") ||
                    feedback.includes("∞") ||
                    feedback.includes("Start")
                      ? "bg-emerald-500/20 text-emerald-200"
                      : "bg-red-500/20 text-red-200"
                  }`}
                >
                  <div>{feedback}</div>
                  {errorExplanation && (
                    <div className="mt-1 text-xs text-red-100/90 font-normal">
                      {errorExplanation}
                    </div>
                  )}
                </div>
              )}

              {currentQuestion && (
                <div
                  ref={gameRef}
                  className="w-full max-w-md flex flex-col items-center justify-center mb-2 flex-1"
                  style={{ height: "var(--game-h, 400px)", minHeight: "300px" }}
                >
                  {/* ויזואליזציה של מספרים (רק לכיתות נמוכות) */}
                  {grade === "g1_2" && currentQuestion.operation === "addition" && (
                    <div className="mb-2 flex gap-4 items-center">
                      {currentQuestion.a <= 10 && (
                        <div className="flex flex-wrap gap-1 justify-center max-w-[100px]">
                          {Array(Math.min(currentQuestion.a, 10))
                            .fill(0)
                            .map((_, i) => (
                              <span
                                key={i}
                                className="inline-block w-3 h-3 bg-blue-500 rounded-full"
                              />
                            ))}
                        </div>
                      )}
                      <span className="text-white text-2xl">+</span>
                      {currentQuestion.b <= 10 && (
                        <div className="flex flex-wrap gap-1 justify-center max-w-[100px]">
                          {Array(Math.min(currentQuestion.b, 10))
                            .fill(0)
                            .map((_, i) => (
                              <span
                                key={i}
                                className="inline-block w-3 h-3 bg-green-500 rounded-full"
                              />
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className={`text-4xl font-black text-white mb-4 text-center ${currentQuestion.isStory ? "" : ""}`} dir={currentQuestion.isStory ? "rtl" : "ltr"} style={currentQuestion.isStory ? { unicodeBidi: "bidi-override" } : {}}>
                    {currentQuestion.question}
                  </div>
                  
                  {/* כפתור רמז */}
                  {!hintUsed && !selectedAnswer && (
                    <button
                      onClick={() => {
                        setShowHint(true);
                        setHintUsed(true);
                      }}
                      className="mb-2 px-4 py-2 rounded-lg bg-blue-500/80 hover:bg-blue-500 text-sm font-bold"
                    >
                      💡 Hint
                    </button>
                  )}
                  
                  {showHint && (
                    <div className="mb-2 px-4 py-2 rounded-lg bg-blue-500/20 border border-blue-400/50 text-blue-200 text-sm text-center max-w-md">
                      {getHint(currentQuestion, currentQuestion.operation, grade)}
                    </div>
                  )}

                  {/* כפתור הסבר מלא */}
                  {currentQuestion && (
                    <>
                      <button
                        onClick={() => setShowSolution((prev) => !prev)}
                        className="mb-2 px-4 py-2 rounded-lg bg-emerald-500/80 hover:bg-emerald-500 text-sm font-bold"
                      >
                        📘 הסבר מלא
                      </button>

                      {showSolution && (
                        <div className="mb-3 px-4 py-2 rounded-lg bg-emerald-500/15 border border-emerald-400/40 text-emerald-100 text-sm text-right space-y-1 max-w-md">
                          {getSolutionSteps(
                            currentQuestion,
                            currentQuestion.operation,
                            grade
                          ).map((line, idx) => (
                            <p key={idx}>{line}</p>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  <div className="grid grid-cols-2 gap-3 w-full mb-3">
                    {currentQuestion.answers.map((answer, idx) => {
                      const isSelected = selectedAnswer === answer;
                      const isCorrect = answer === currentQuestion.correctAnswer;
                      const isWrong = isSelected && !isCorrect;

                      return (
                        <button
                          key={idx}
                          onClick={() => handleAnswer(answer)}
                          disabled={!!selectedAnswer}
                          className={`rounded-xl border-2 px-6 py-6 text-2xl font-bold transition-all active:scale-95 disabled:opacity-50 ${
                            isCorrect && isSelected
                              ? "bg-emerald-500/30 border-emerald-400 text-emerald-200"
                              : isWrong
                              ? "bg-red-500/30 border-red-400 text-red-200"
                              : selectedAnswer &&
                                answer === currentQuestion.correctAnswer
                              ? "bg-emerald-500/30 border-emerald-400 text-emerald-200"
                              : "bg-black/30 border-white/15 text-white hover:border-white/40"
                          }`}
                        >
                          {answer}
                        </button>
                      );
                    })}
                  </div>

                  {/* כפתור חיבור לטבלת כפל/חילוק – רק במצב למידה */}
                  {mode === "learning" &&
                    (currentQuestion.operation === "multiplication" ||
                      currentQuestion.operation === "division") && (
                      <button
                        onClick={() => {
                          setShowMultiplicationTable(true);
                          setTableMode(
                            currentQuestion.operation === "multiplication"
                              ? "multiplication"
                              : "division"
                          );
                          if (currentQuestion.operation === "multiplication") {
                            const a = currentQuestion.a;
                            const b = currentQuestion.b;
                            if (a >= 1 && a <= 12 && b >= 1 && b <= 12) {
                              const value = a * b;
                              setSelectedCell({ row: a, col: b, value });
                              setSelectedRow(null);
                              setSelectedCol(null);
                              setSelectedResult(null);
                              setSelectedDivisor(null);
                            }
                          } else {
                            const { a, b } = currentQuestion;
                            const value = a;
                            if (b >= 1 && b <= 12) {
                              setSelectedCell({ row: 1, col: b, value });
                              setSelectedResult(value);
                              setSelectedDivisor(b);
                              setSelectedRow(null);
                              setSelectedCol(null);
                            }
                          }
                        }}
                        className="px-4 py-2 rounded-lg bg-blue-500/80 hover:bg-blue-500 text-sm font-bold"
                      >
                        📊 Show on table
                      </button>
                    )}
                </div>
              )}

              <button
                onClick={stopGame}
                className="h-9 px-4 rounded-lg bg-red-500/80 hover:bg-red-500 font-bold text-sm"
              >
                ⏹️ Stop
              </button>
            </>
          )}

          {/* Multiplication Table Modal */}
          {showMultiplicationTable && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={() => {
                  setShowMultiplicationTable(false);
                  setSelectedRow(null);
                  setSelectedCol(null);
                  setHighlightedAnswer(null);
                  setTableMode("multiplication");
                  setSelectedResult(null);
                  setSelectedDivisor(null);
                  setSelectedCell(null);
                }}
              />
              <div className="relative w-full max-w-md max-h-[85vh] overflow-auto bg-gradient-to-b from-[#0a0f1d] to-[#141928] rounded-2xl border-2 border-white/20 shadow-2xl">
                <div className="sticky top-0 bg-gradient-to-b from-[#0a0f1d] to-[#141928] border-b border-white/10 px-4 py-3 flex items-center justify-between z-10">
                  <h2 className="text-xl font-bold text-white">
                    📊 Multiplication Table
                  </h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedRow(null);
                        setSelectedCol(null);
                        setHighlightedAnswer(null);
                        setSelectedResult(null);
                        setSelectedDivisor(null);
                        setSelectedCell(null);
                      }}
                      className="px-2 py-1 rounded text-xs font-bold bg-white/10 hover:bg-white/20 text-white"
                    >
                      RESET
                    </button>
                    <button
                      onClick={() => {
                        setShowMultiplicationTable(false);
                        setSelectedRow(null);
                        setSelectedCol(null);
                        setHighlightedAnswer(null);
                        setTableMode("multiplication");
                        setSelectedResult(null);
                        setSelectedDivisor(null);
                        setSelectedCell(null);
                      }}
                      className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-lg flex items-center justify-center"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div className="p-4">
                  {/* Mode toggle */}
                  <div className="mb-4 flex gap-2 justify-center">
                    <button
                      onClick={() => {
                        setTableMode("multiplication");
                        setSelectedRow(null);
                        setSelectedCol(null);
                        setHighlightedAnswer(null);
                        setSelectedResult(null);
                        setSelectedDivisor(null);
                        setSelectedCell(null);
                      }}
                      className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                        tableMode === "multiplication"
                          ? "bg-blue-500/80 text-white"
                          : "bg-white/10 text-white/70 hover:bg-white/20"
                      }`}
                    >
                      × Multiplication
                    </button>
                    <button
                      onClick={() => {
                        setTableMode("division");
                        setSelectedRow(null);
                        setSelectedCol(null);
                        setHighlightedAnswer(null);
                        setSelectedResult(null);
                        setSelectedDivisor(null);
                        setSelectedCell(null);
                      }}
                      className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                        tableMode === "division"
                          ? "bg-purple-500/80 text-white"
                          : "bg-white/10 text-white/70 hover:bg-white/20"
                      }`}
                    >
                      ÷ Division
                    </button>
                  </div>

                  {/* Result window */}
                  <div className="mb-3 min-h-[30px] w-full flex items-center justify-center">
                    {tableMode === "division" &&
                      selectedCell &&
                      (selectedRow || selectedCol) &&
                      selectedResult &&
                      selectedDivisor &&
                      selectedResult % selectedDivisor !== 0 && (
                        <div className="w-full px-4 py-1 rounded-lg bg-red-500/20 border border-red-400/50 text-center flex items-center justify-center gap-2">
                          <span className="text-sm text-red-200 font-semibold">
                            ⚠️ Error: {selectedResult} ÷ {selectedDivisor} is
                            not a whole number!
                          </span>
                          <span className="text-xs text-red-300">
                            (
                            {Math.floor(selectedResult / selectedDivisor)}{" "}
                            remainder {selectedResult % selectedDivisor})
                          </span>
                        </div>
                      )}

                    {tableMode === "multiplication" &&
                      selectedCell &&
                      (selectedRow || selectedCol) && (
                        <div
                          className={`w-full px-4 py-1 rounded-lg border text-center flex items-center justify-center gap-3 ${
                            (selectedRow || selectedCell.row) *
                              (selectedCol || selectedCell.col) ===
                            selectedCell.value
                              ? "bg-emerald-500/20 border-emerald-400/50"
                              : "bg-red-500/20 border-red-400/50"
                          }`}
                        >
                          <span className="text-base text-white/80">
                            {selectedRow || selectedCell.row} ×{" "}
                            {selectedCol || selectedCell.col} =
                          </span>
                          <span
                            className={`text-xl font-bold ${
                              (selectedRow || selectedCell.row) *
                                (selectedCol || selectedCell.col) ===
                              selectedCell.value
                                ? "text-emerald-300"
                                : "text-red-300"
                            }`}
                          >
                            {selectedCell.value}
                          </span>
                          {(selectedRow || selectedCell.row) *
                            (selectedCol || selectedCell.col) !==
                            selectedCell.value && (
                            <span className="text-xs text-red-300 font-semibold">
                              ⚠️ Should be{" "}
                              {(selectedRow || selectedCell.row) *
                                (selectedCol || selectedCell.col)}
                            </span>
                          )}
                        </div>
                      )}

                    {tableMode === "division" &&
                      selectedResult &&
                      selectedDivisor &&
                      selectedResult % selectedDivisor === 0 && (
                        <div className="w-full px-4 py-1 rounded-lg bg-purple-500/20 border border-purple-400/50 text-center flex items-center justify-center gap-3">
                          <span className="text-base text-white/80">
                            {selectedResult} ÷ {selectedDivisor} =
                          </span>
                          <span className="text-xl font-bold text-purple-300">
                            {selectedResult / selectedDivisor}
                          </span>
                        </div>
                      )}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-center">
                      <thead>
                        <tr>
                          <th className="font-bold text-white/80 p-2 bg-black/30 rounded">
                            ×
                          </th>
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(
                            (num) => {
                              const isColSelected =
                                (tableMode === "multiplication" &&
                                  selectedCol &&
                                  num === selectedCol) ||
                                (tableMode === "multiplication" &&
                                  selectedCell &&
                                  selectedRow &&
                                  num === selectedCell.col);
                              const isColInvalid =
                                tableMode === "division" &&
                                selectedCell &&
                                selectedResult &&
                                selectedResult % num !== 0;
                              return (
                                <th
                                  key={num}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (tableMode === "multiplication") {
                                      if (selectedCol === num) {
                                        setSelectedCol(null);
                                      } else {
                                        setSelectedCol(num);
                                      }
                                    } else {
                                      if (selectedResult && selectedCell) {
                                        const quotient =
                                          selectedResult / num;
                                        if (
                                          quotient ===
                                            Math.floor(quotient) &&
                                          quotient > 0
                                        ) {
                                          if (selectedDivisor === num) {
                                            setSelectedDivisor(null);
                                            setSelectedCol(null);
                                          } else {
                                            setSelectedDivisor(num);
                                            setSelectedRow(null);
                                            setSelectedCol(num);
                                          }
                                        }
                                      }
                                    }
                                  }}
                                  className={`font-bold text-white/80 p-2 rounded min-w-[40px] cursor-pointer transition-all ${
                                    isColSelected
                                      ? tableMode === "multiplication"
                                        ? "bg-yellow-500/40 border-2 border-yellow-400"
                                        : "bg-purple-500/40 border-2 border-purple-400"
                                      : isColInvalid
                                      ? "bg-red-500/20 border border-red-400/30 opacity-50 cursor-not-allowed"
                                      : "bg-black/30 hover:bg-black/40"
                                  }`}
                                  style={{ pointerEvents: "auto", zIndex: 10 }}
                                >
                                  {num}
                                </th>
                              );
                            }
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(
                          (row) => (
                            <tr key={row}>
                              <td
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (tableMode === "multiplication") {
                                    if (selectedRow === row) {
                                      setSelectedRow(null);
                                    } else {
                                      setSelectedRow(row);
                                    }
                                  } else {
                                    if (selectedResult && selectedCell) {
                                      const quotient =
                                        selectedResult / row;
                                      if (
                                        quotient ===
                                          Math.floor(quotient) &&
                                        quotient > 0
                                      ) {
                                        if (selectedDivisor === row) {
                                          setSelectedDivisor(null);
                                          setSelectedRow(null);
                                        } else {
                                          setSelectedDivisor(row);
                                          setSelectedCol(null);
                                          setSelectedRow(row);
                                        }
                                      }
                                    }
                                  }
                                }}
                                className={`font-bold text-white/80 p-2 rounded cursor-pointer transition-all ${
                                  (tableMode === "multiplication" &&
                                    selectedRow &&
                                    row === selectedRow) ||
                                  (tableMode === "multiplication" &&
                                    selectedCell &&
                                    selectedCol &&
                                    row === selectedCell.row)
                                    ? "bg-yellow-500/40 border-2 border-yellow-400"
                                    : tableMode === "division" &&
                                      selectedCell &&
                                      selectedResult &&
                                      selectedResult % row !== 0
                                    ? "bg-red-500/20 border border-red-400/30 opacity-50 cursor-not-allowed"
                                    : "bg-black/30 hover:bg-black/40"
                                }`}
                                style={{ pointerEvents: "auto", zIndex: 10 }}
                              >
                                {row}
                              </td>
                              {Array.from({ length: 12 }, (_, i) => i + 1).map(
                                (col) => {
                                  const value = row * col;
                                  const isCellSelected =
                                    selectedCell &&
                                    selectedCell.row === row &&
                                    selectedCell.col === col;

                                  const isRowSelected =
                                    tableMode === "multiplication" &&
                                    selectedRow &&
                                    row === selectedRow;
                                  const isColSelected =
                                    tableMode === "multiplication" &&
                                    selectedCol &&
                                    col === selectedCol;

                                  const isAnswerCellMultiplication =
                                    tableMode === "multiplication" &&
                                    selectedRow &&
                                    selectedCol &&
                                    row === selectedRow &&
                                    col === selectedCol;

                                  const isDivisionIntersection =
                                    tableMode === "division" &&
                                    selectedCell &&
                                    selectedResult &&
                                    selectedDivisor &&
                                    ((selectedRow &&
                                      row === selectedRow &&
                                      col === selectedCell.col) ||
                                      (selectedCol &&
                                        row === selectedCell.row &&
                                        col === selectedCol));

                                  let isAnswerCell = false;
                                  if (
                                    tableMode === "division" &&
                                    selectedCell &&
                                    selectedResult &&
                                    selectedDivisor &&
                                    selectedResult % selectedDivisor === 0
                                  ) {
                                    const answer =
                                      selectedResult / selectedDivisor;
                                    if (answer >= 1 && answer <= 12) {
                                      if (
                                        selectedRow &&
                                        selectedRow === selectedDivisor &&
                                        row === selectedDivisor &&
                                        col === answer
                                      ) {
                                        isAnswerCell = true;
                                      }
                                      if (
                                        selectedCol &&
                                        selectedCol === selectedDivisor &&
                                        col === selectedDivisor &&
                                        row === answer
                                      ) {
                                        isAnswerCell = true;
                                      }
                                      if (
                                        value === answer &&
                                        ((selectedRow &&
                                          row === selectedDivisor) ||
                                          (selectedCol &&
                                            col === selectedDivisor))
                                      ) {
                                        isAnswerCell = true;
                                      }
                                    }
                                  }

                                  return (
                                    <td
                                      key={`${row}-${col}`}
                                      onClick={() => {
                                        if (tableMode === "multiplication") {
                                          setSelectedCell({
                                            row,
                                            col,
                                            value,
                                          });
                                          setSelectedRow(null);
                                          setSelectedCol(null);
                                          setHighlightedAnswer(null);
                                        } else {
                                          setSelectedResult(value);
                                          setSelectedDivisor(null);
                                          setSelectedRow(null);
                                          setSelectedCol(null);
                                          setSelectedCell({
                                            row,
                                            col,
                                            value,
                                          });
                                        }
                                      }}
                                      className={`p-2 rounded border text-white text-sm min-w-[40px] cursor-pointer transition-all ${
                                        isCellSelected
                                          ? tableMode === "multiplication"
                                            ? "bg-emerald-500/40 border-2 border-emerald-400 text-emerald-200 font-bold text-base"
                                            : "bg-purple-500/40 border-2 border-purple-400 text-purple-200 font-bold text-base"
                                          : isAnswerCellMultiplication
                                          ? "bg-emerald-500/40 border-2 border-emerald-400 text-emerald-200 font-bold text-base"
                                          : isAnswerCell
                                          ? "bg-purple-500/40 border-2 border-purple-400 text-purple-200 font-bold text-base"
                                          : isRowSelected || isColSelected
                                          ? "bg-yellow-500/20 border border-yellow-400/30"
                                          : isDivisionIntersection &&
                                            !isCellSelected
                                          ? "bg-purple-500/30 border border-purple-400/50"
                                          : "bg-black/20 border border-white/5 hover:bg-black/30"
                                      }`}
                                      style={{ pointerEvents: "auto" }}
                                    >
                                      {value}
                                    </td>
                                  );
                                }
                              )}
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4 text-center space-y-2">
                    <div className="text-xs text-white/60 mb-2 text-center">
                      {tableMode === "multiplication"
                        ? "Click a number from the table, then a row or column number"
                        : "Click a result number, then a row/column number to see the division"}
                    </div>
                    <button
                      onClick={() => {
                        setShowMultiplicationTable(false);
                        setSelectedRow(null);
                        setSelectedCol(null);
                        setHighlightedAnswer(null);
                        setSelectedResult(null);
                        setSelectedDivisor(null);
                        setSelectedCell(null);
                      }}
                      className="px-6 py-2 rounded-lg bg-blue-500/80 hover:bg-blue-500 font-bold text-sm"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Leaderboard Modal */}
          {showLeaderboard && (
            <div
              className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
              onClick={() => setShowLeaderboard(false)}
            >
              <div
                className="bg-gradient-to-br from-[#080c16] to-[#0a0f1d] border-2 border-white/20 rounded-2xl p-4 max-w-md w-full max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-center mb-4">
                  <h2 className="text-2xl font-extrabold text-white mb-1">
                    🏆 Leaderboard
                  </h2>
                  <p className="text-white/70 text-xs">Local High Scores</p>
                </div>

                {/* Level Selection */}
                <div className="flex gap-2 mb-4 justify-center">
                  {Object.keys(LEVELS).map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => {
                        setLeaderboardLevel(lvl);
                        if (typeof window !== "undefined") {
                          try {
                            const saved = JSON.parse(
                              localStorage.getItem(STORAGE_KEY) || "{}"
                            );
                            const topScores = buildTop10ByScore(saved, lvl);
                            setLeaderboardData(topScores);
                          } catch (e) {
                            console.error(
                              "Error loading leaderboard:",
                              e
                            );
                          }
                        }
                      }}
                      className={`px-3 py-2 rounded-lg font-bold text-sm transition-all ${
                        leaderboardLevel === lvl
                          ? "bg-amber-500/80 text-white"
                          : "bg-white/10 text-white/70 hover:bg-white/20"
                      }`}
                    >
                      {LEVELS[lvl].name}
                    </button>
                  ))}
                </div>

                {/* Leaderboard Table */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-center">
                    <thead>
                      <tr className="border-b border-white/20">
                        <th className="text-white/80 p-2 font-bold text-xs">
                          Rank
                        </th>
                        <th className="text-white/80 p-2 font-bold text-xs">
                          Player
                        </th>
                        <th className="text-white/80 p-2 font-bold text-xs">
                          Score
                        </th>
                        <th className="text-white/80 p-2 font-bold text-xs">
                          Streak
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboardData.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="text-white/60 p-4 text-sm"
                          >
                            No scores yet for{" "}
                            {LEVELS[leaderboardLevel].name} level
                          </td>
                        </tr>
                      ) : (
                        leaderboardData.map((score, idx) => (
                          <tr
                            key={`${score.name}-${score.timestamp}-${idx}`}
                            className={`border-b border-white/10 ${
                              score.placeholder
                                ? "opacity-40"
                                : idx === 0
                                ? "bg-amber-500/20"
                                : idx === 1
                                ? "bg-gray-500/20"
                                : idx === 2
                                ? "bg-amber-900/20"
                                : ""
                            }`}
                          >
                            <td className="text-white/80 p-2 text-sm font-bold">
                              {score.placeholder
                                ? `#${idx + 1}`
                                : idx === 0
                                ? "🥇"
                                : idx === 1
                                ? "🥈"
                                : idx === 2
                                ? "🥉"
                                : `#${idx + 1}`}
                            </td>
                            <td className="text-white p-2 text-sm font-semibold">
                              {score.name}
                            </td>
                            <td className="text-emerald-400 p-2 text-sm font-bold">
                              {score.bestScore}
                            </td>
                            <td className="text-amber-400 p-2 text-sm font-bold">
                              🔥{score.bestStreak}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 text-center">
                  <button
                    onClick={() => setShowLeaderboard(false)}
                    className="px-6 py-2 rounded-lg bg-amber-500/80 hover:bg-amber-500 font-bold text-sm"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Mixed Operations Selector Modal */}
          {showMixedSelector && (
            <div
              className="fixed inset-0 bg-black/80 flex items-center justify-center z-[200] p-4"
              onClick={() => {
                setShowMixedSelector(false);
                // אם לא נבחרו פעולות, חזור לפעולה הקודמת
                const hasSelected = Object.values(mixedOperations).some(
                  (selected) => selected
                );
                if (!hasSelected && operation === "mixed") {
                  const allowed = GRADES[grade].operations;
                  setOperation(allowed.find(op => op !== "mixed") || allowed[0]);
                }
              }}
            >
              <div
                className="bg-gradient-to-br from-[#080c16] to-[#0a0f1d] border-2 border-white/20 rounded-2xl p-6 max-w-md w-full"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-center mb-4">
                  <h2 className="text-2xl font-extrabold text-white mb-2">
                    🎲 בחר פעולות למיקס
                  </h2>
                  <p className="text-white/70 text-sm">
                    בחר אילו פעולות לכלול במיקס
                  </p>
                </div>

                <div className="space-y-3 mb-4">
                  {GRADES[grade].operations
                    .filter((op) => op !== "mixed" && op !== "fractions")
                    .map((op) => (
                      <label
                        key={op}
                        className="flex items-center gap-3 p-3 rounded-lg bg-black/30 border border-white/10 hover:bg-black/40 cursor-pointer transition-all"
                      >
                        <input
                          type="checkbox"
                          checked={mixedOperations[op] || false}
                          onChange={(e) => {
                            setMixedOperations((prev) => ({
                              ...prev,
                              [op]: e.target.checked,
                            }));
                          }}
                          className="w-5 h-5 rounded"
                        />
                        <span className="text-white font-semibold text-lg">
                          {getOperationName(op)}
                        </span>
                      </label>
                    ))}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      // בחר הכל
                      const availableOps = GRADES[grade].operations.filter(
                        (op) => op !== "mixed" && op !== "fractions"
                      );
                      const allSelected = {};
                      availableOps.forEach((op) => {
                        allSelected[op] = true;
                      });
                      setMixedOperations(allSelected);
                    }}
                    className="flex-1 px-4 py-2 rounded-lg bg-blue-500/80 hover:bg-blue-500 font-bold text-sm"
                  >
                    הכל
                  </button>
                  <button
                    onClick={() => {
                      // בטל הכל
                      const availableOps = GRADES[grade].operations.filter(
                        (op) => op !== "mixed" && op !== "fractions"
                      );
                      const noneSelected = {};
                      availableOps.forEach((op) => {
                        noneSelected[op] = false;
                      });
                      setMixedOperations(noneSelected);
                    }}
                    className="flex-1 px-4 py-2 rounded-lg bg-gray-500/80 hover:bg-gray-500 font-bold text-sm"
                  >
                    בטל הכל
                  </button>
                  <button
                    onClick={() => {
                      // בדוק שיש לפחות פעולה אחת נבחרת
                      const hasSelected = Object.values(mixedOperations).some(
                        (selected) => selected
                      );
                      if (hasSelected) {
                        setShowMixedSelector(false);
                      } else {
                        alert("אנא בחר לפחות פעולה אחת");
                      }
                    }}
                    className="flex-1 px-4 py-2 rounded-lg bg-emerald-500/80 hover:bg-emerald-500 font-bold text-sm"
                  >
                    שמור
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
