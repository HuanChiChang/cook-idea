const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '30mb' }));
app.use(express.static(path.join(__dirname)));

const SYSTEM_PROMPT = `你是一位台灣宜蘭在地的家常料理專家。
用戶會告訴你手邊有的食材（可能是文字列表，也可能是食材照片）。
請根據這些食材，推薦「至少三種」家常做法。

重要規則：
1. 推薦的料理要符合台灣家庭口味，簡單易做，不需要專業廚藝。
2. 若食譜需要額外食材，請確保這些食材在宜蘭的傳統市場、全聯、或 7-11、全家便利商店都能輕鬆買到。
3. 每道食譜請包含：料理名稱、烹飪時間、難易度、食材清單（區分手邊已有的和需要另外買的）、步驟說明（條列清楚）、小撇步。
4. 語氣親切，像鄰居阿嬤在指導，不要太正式。
5. 若照片中看到食材，請自動辨識並列入考量。

輸出格式（JSON array）：
[
  {
    "name": "料理名稱",
    "time": "30分鐘",
    "difficulty": "簡單",
    "have": ["已有食材1", "已有食材2"],
    "buy": ["需要買的食材1"],
    "steps": ["步驟一", "步驟二", "步驟三"],
    "tip": "小撇步文字"
  }
]
只輸出 JSON，不要加其他文字。`;

app.post('/api/recipes', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: '伺服器尚未設定 API Key。' });

  const { textIngredients = [], photos = [] } = req.body || {};

  if (textIngredients.length === 0 && photos.length === 0) {
    return res.status(400).json({ error: '請至少提供一樣食材或一張照片。' });
  }

  const contentBlocks = [];

  if (photos.length > 0) {
    contentBlocks.push({ type: 'text', text: '以下是食材照片：' });
    photos.forEach(p => {
      contentBlocks.push({
        type: 'image',
        source: { type: 'base64', media_type: p.mediaType, data: p.base64 }
      });
    });
  }

  let userText = '';
  if (textIngredients.length > 0) {
    userText += `手邊有的食材：${textIngredients.join('、')}。`;
  }
  userText += '請推薦至少三種家常做法，用 JSON 格式回覆。';
  contentBlocks.push({ type: 'text', text: userText });

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: contentBlocks }]
      })
    });

    if (!upstream.ok) {
      const err = await upstream.json().catch(() => ({}));
      return res.status(upstream.status).json({ error: err.error?.message || `API 錯誤 ${upstream.status}` });
    }

    const data = await upstream.json();
    const raw = data.content?.[0]?.text || '[]';
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    res.setHeader('Content-Type', 'application/json');
    res.send(cleaned);
  } catch (err) {
    res.status(500).json({ error: err.message || '未知錯誤' });
  }
});

app.listen(PORT, () => console.log(`伺服器啟動於 port ${PORT}`));
