import axios from 'axios';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, description: 'Method not allowed' });
  }

  const { token, chat_id, message_id } = req.body;

  if (!token || !chat_id || !message_id) {
    return res.status(400).json({ ok: false, description: 'Missing required fields' });
  }

  try {
    const response = await axios.post(`https://api.telegram.org/bot${token}/deleteMessage`, {
      chat_id,
      message_id
    }, {
      timeout: 10000
    });

    return res.status(200).json(response.data);
  } catch (error: any) {
    const errorData = error.response?.data;
    return res.status(error.response?.status || 500).json(errorData || { ok: false, description: error.message });
  }
}
