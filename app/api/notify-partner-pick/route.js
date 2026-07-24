const SECTOR_LABELS = {
  ai_chatbot: 'AI Chatbot Leads',
  website: 'No-Website Leads',
  custom_app: 'Database Integration',
};

export async function POST(request) {
  const { companyName, serviceType, picked } = await request.json();

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not configured');
    return Response.json({ error: 'Telegram not configured' }, { status: 500 });
  }

  const sector = SECTOR_LABELS[serviceType] || serviceType || 'unknown sector';
  const time = new Date().toLocaleString('bg-BG', { timeZone: 'Europe/Sofia' });
  const text = picked
    ? `⭐ Партньорът избра лийд за построяване:\n${companyName}\nСектор: ${sector}\nВреме: ${time}`
    : `↩️ Партньорът премахна избора на лийд (маркировката е свалена):\n${companyName}\nСектор: ${sector}\nВреме: ${time}`;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('Telegram sendMessage failed:', body);
    return Response.json({ error: 'Telegram send failed' }, { status: 502 });
  }

  return Response.json({ ok: true });
}
