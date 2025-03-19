// 拡張機能がインストールされたとき、または更新されたときに呼ばれる
chrome.runtime.onInstalled.addListener(() => {
  // デフォルト設定を初期化
  chrome.storage.sync.get(
    {
      apiKey: "",
      targetLang: "ja",
      fontSize: "medium",
      showOriginal: true,
      showTranslation: true,
    },
    (items) => {
      // ストレージに既に設定がなければ、デフォルト値を設定する
      if (!items.apiKey && !items.targetLang) {
        chrome.storage.sync.set({
          apiKey: "",
          targetLang: "ja",
          fontSize: "medium",
          showOriginal: true,
          showTranslation: true,
        });
      }
    }
  );
});

// コンテンツスクリプトからのメッセージを受け取る
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "translate") {
    translateText(request.text, request.apiKey, request.targetLang)
      .then((translation) => {
        sendResponse({ translation });
      })
      .catch((error) => {
        console.error("翻訳エラー:", error);
        sendResponse({ error: error.message });
      });
    return true; // 非同期応答を処理するために true を返す
  }
});

// OpenAI APIを使用してテキストを翻訳する関数
async function translateText(text, apiKey, targetLang) {
  if (!text || text.trim() === "") {
    return "";
  }

  const langMap = {
    ja: "日本語",
    en: "英語",
    zh: "中国語",
    ko: "韓国語",
    fr: "フランス語",
    de: "ドイツ語",
    es: "スペイン語",
  };

  const targetLanguage = langMap[targetLang] || "日本語";

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // gpt-4o-mini モデルを使用
        messages: [
          {
            role: "system",
            content: `字幕を${targetLanguage}に翻訳してください。原文のニュアンスや文化的な参照を尊重し、自然で流暢な翻訳を提供してください。翻訳のみを返し、余分な説明を加えないでください。`,
          },
          {
            role: "user",
            content: text,
          },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API エラー: ${errorData.error.message}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (error) {
    console.error("翻訳API呼び出しエラー:", error);
    throw new Error(
      "翻訳処理中にエラーが発生しました。APIキーが正しいか確認してください。"
    );
  }
}
