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

  // 翻訳キャッシュを初期化
  chrome.storage.local.set({ translationCache: {} });
});

// 翻訳リクエストキュー
let translationQueue = [];
let isProcessingQueue = false;

// コンテンツスクリプトからのメッセージを受け取る
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "translate") {
    const priority = request.priority || "normal";

    // 優先度に応じてキューに追加
    if (priority === "high") {
      // 高優先度のリクエストは最優先で処理
      translationQueue.unshift({
        text: request.text,
        apiKey: request.apiKey,
        targetLang: request.targetLang,
        callback: sendResponse,
        priority: priority,
      });
    } else {
      // それ以外は通常の優先度
      translationQueue.push({
        text: request.text,
        apiKey: request.apiKey,
        targetLang: request.targetLang,
        callback: sendResponse,
        priority: priority,
      });
    }

    // キューの処理を開始
    if (!isProcessingQueue) {
      processTranslationQueue();
    }

    return true; // 非同期応答を処理するために true を返す
  }
});

// 翻訳キューを処理する関数
async function processTranslationQueue() {
  if (translationQueue.length === 0) {
    isProcessingQueue = false;
    return;
  }

  isProcessingQueue = true;

  // キャッシュから読み込み
  let translationCache = {};
  try {
    const result = await chrome.storage.local.get("translationCache");
    translationCache = result.translationCache || {};
  } catch (error) {
    console.error("キャッシュの読み込みエラー:", error);
  }

  // キューから次のリクエストを取得
  const request = translationQueue.shift();

  try {
    // キャッシュにあるか確認
    const cacheKey = `${request.targetLang}:${request.text}`;
    if (translationCache[cacheKey]) {
      request.callback({ translation: translationCache[cacheKey] });
    } else {
      // 翻訳実行
      const translation = await translateText(
        request.text,
        request.apiKey,
        request.targetLang
      );

      // キャッシュに保存
      translationCache[cacheKey] = translation;
      chrome.storage.local.set({ translationCache: translationCache });

      // 結果を返す
      request.callback({ translation });
    }
  } catch (error) {
    console.error("翻訳エラー:", error);
    request.callback({ error: error.message });
  }

  // 優先度の低いリクエストの場合は少し遅延を入れる
  if (request.priority === "low") {
    setTimeout(() => {
      processTranslationQueue();
    }, 200);
  } else {
    // 次のリクエストを処理
    processTranslationQueue();
  }
}

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

  // 言語に応じた指示を作成
  let instructionText = "";
  if (targetLang === "ja") {
    instructionText = `以下の映画/ドラマの字幕を${targetLanguage}に翻訳してください。自然で分かりやすく、映画の文脈に合った翻訳にしてください。翻訳のみを返してください。`;
  } else if (targetLang === "en") {
    instructionText = `Translate the following movie/TV subtitle into ${targetLanguage}. Make it natural and clear, appropriate for the context of the movie. Return only the translation.`;
  } else {
    instructionText = `字幕を${targetLanguage}に翻訳してください。原文のニュアンスや文化的な参照を尊重し、自然で流暢な翻訳を提供してください。翻訳のみを返し、余分な説明を加えないでください。`;
  }

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
            content: instructionText,
          },
          {
            role: "user",
            content: text,
          },
        ],
        temperature: 0.2, // 低めの温度で一貫性を高める
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

// キャッシュメンテナンス（1時間ごとに古いキャッシュをクリア）
setInterval(async () => {
  try {
    const result = await chrome.storage.local.get("translationCache");
    const cache = result.translationCache || {};

    // キャッシュサイズが大きすぎる場合は一部削除
    if (Object.keys(cache).length > 1000) {
      const newCache = {};
      const keys = Object.keys(cache);

      // 新しいキャッシュには最新の500エントリのみ保持
      for (let i = keys.length - 500; i < keys.length; i++) {
        newCache[keys[i]] = cache[keys[i]];
      }

      chrome.storage.local.set({ translationCache: newCache });
    }
  } catch (error) {
    console.error("キャッシュメンテナンスエラー:", error);
  }
}, 3600000); // 1時間ごと
