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
    if (!photo.startsWith('data:image/')) {
      return res.status(400).json({ ok: false, description: 'Invalid photo format. Must be a base64 data URL.' });
    }

    const base64Data = photo.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');
    
    if (buffer.length === 0) {
      return res.status(400).json({ ok: false, description: 'Photo buffer is empty' });
    }

    // Limit buffer size to 4MB for Vercel stability
    if (buffer.length > 4 * 1024 * 1024) {
      return res.status(413).json({ ok: false, description: 'Photo is too large (max 4MB after decoding)' });
    }
    
    const form = new FormData();
    form.append('chat_id', chat_id);
    form.append('photo', buffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });
    form.append('caption', caption || '');
    form.append('parse_mode', parse_mode || 'HTML');

    console.log(`Sending photo to Telegram. Token length: ${token.length}, Chat ID: ${chat_id}, Buffer size: ${buffer.length}`);

    const response = await axios.post(`https://api.telegram.org/bot${token}/sendPhoto`, form, {
      headers: form.getHeaders(),
      timeout: 30000 // Increase to 30s
    });

    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error('Error in sendPhoto handler:', error.message);
    if (error.response) {
      console.error('Telegram API Error Data:', JSON.stringify(error.response.data));
      return res.status(error.response.status).json(error.response.data);
    }
    return res.status(500).json({ ok: false, description: error.message });
  }
}
