export default async function handler(req, res) {
  // בדיקת Session בצד שרת (למשל מה-DB/Redis), כאן דמו ע"י cookie
  const verified = Boolean(req.cookies?.mleo_email_session);
  res.status(200).json({ verified });
}
