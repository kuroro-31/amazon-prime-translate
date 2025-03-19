// バックグラウンドスクリプト
// Chrome拡張機能のバックグラウンドタスクを処理します

// 拡張機能がインストールまたは更新されたときの処理
chrome.runtime.onInstalled.addListener(() => {
  console.log('Amazon Prime Translator拡張機能がインストールされました');
  
  // デフォルト設定の初期化
  chrome.storage.sync.set({
    targetLanguage: 'ja', // デフォルトは日本語
    sourceLanguage: 'en', // デフォルトは英語
    showOriginal: true,   // 原文を表示
    showTranslation: true, // 翻訳を表示
    fontSize: 16,         // フォントサイズ
    position: 'bottom',   // 字幕の位置
    enabled: true         // 拡張機能が有効かどうか
  });
});

// コンテンツスクリプトからのメッセージを処理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'translate') {
    // ここで翻訳APIを呼び出す（実際の実装では外部APIを使用）
    // この例では簡易的な実装のみ
    const translatedText = `翻訳: ${message.text}`;
    sendResponse({ translation: translatedText });
    return true; // 非同期レスポンスのために必要
  }
}); 