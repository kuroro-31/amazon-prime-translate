// バックグラウンドスクリプト
// Chrome拡張機能のバックグラウンドタスクを処理します

// OpenAI APIのエンドポイント
const OPENAI_API_ENDPOINT = "https://api.openai.com/v1/chat/completions";
// APIキー
const OPENAI_API_KEY =
  "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";

// 拡張機能がインストールまたは更新されたときの処理
chrome.runtime.onInstalled.addListener(() => {
  console.log("Amazon Prime Translator拡張機能がインストールされました");

  // デフォルト設定の初期化
  chrome.storage.sync.set({
    targetLanguage: "ja", // デフォルトは日本語
    sourceLanguage: "en", // デフォルトは英語
    showOriginal: true, // 原文を表示
    showTranslation: true, // 翻訳を表示
    fontSize: 16, // フォントサイズ
    position: "bottom", // 字幕の位置
    enabled: true, // 拡張機能が有効かどうか
  });
});

// OpenAI APIを使用して翻訳を行う関数
async function translateWithOpenAI(text, targetLanguage) {
  try {
    const response = await fetch(OPENAI_API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `あなたは翻訳者です。与えられたテキストを${targetLanguage}に翻訳してください。翻訳のみを返してください、追加の説明は不要です。`,
          },
          {
            role: "user",
            content: text,
          },
        ],
        temperature: 0.3,
        max_tokens: 150,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content || "翻訳エラー";
  } catch (error) {
    console.error("OpenAI API翻訳エラー:", error);
    return `翻訳エラー: ${text}`;
  }
}

// 言語コードから表示名への変換
function getLanguageName(langCode) {
  const languageMap = {
    ja: "日本語",
    en: "英語",
    ko: "韓国語",
    "zh-CN": "中国語 (簡体)",
    "zh-TW": "中国語 (繁体)",
    fr: "フランス語",
    de: "ドイツ語",
    es: "スペイン語",
    it: "イタリア語",
    ru: "ロシア語",
  };

  return languageMap[langCode] || langCode;
}

// コンテンツスクリプトからのメッセージを処理
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "translate") {
    // 翻訳リクエストの処理
    const targetLang = getLanguageName(message.to);

    // 非同期処理を行うためにPromiseを使用
    translateWithOpenAI(message.text, targetLang)
      .then((translatedText) => {
        sendResponse({ translation: translatedText });
      })
      .catch((error) => {
        console.error("翻訳処理エラー:", error);
        sendResponse({ translation: `翻訳エラー: ${message.text}` });
      });

    return true; // 非同期レスポンスのために必要
  }
});
