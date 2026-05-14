import axios from 'axios';
import FormData from 'form-data';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, description: 'Method not allowed' });
  }

  const { token, chat_id, photo, caption, parse_mode } = req.body;

  if (!token || !chat_id || !photo) {
    return res.status(400).json({ ok: false, description: 'Missing required fields' });
  }

  try {
    const base64Data = photo.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');
    
    const form = new FormData();
    form.append('chat_id', chat_id);
    form.append('photo', buffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });
    form.append('caption', caption || '');
    form.append('parse_mode', parse_mode || 'HTML');

    const response = await axios.post(`https://api.telegram.org/bot${token}/sendPhoto`, form, {
      headers: form.getHeaders(),
      timeout: 20000
    });

    return res.status(200).json(response.data);
  } catch (error: any) {
    const errorData = error.response?.data;
    return res.status(error.response?.status || 500).json(errorData || { ok: false, description: error.message });
  }
}
