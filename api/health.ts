export default function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");

  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Chỉ hỗ trợ phương thức GET" });
  }

  return res.status(200).json({
    ok: true,
    geminiKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
    appVersion: "2.0.0",
  });
}
