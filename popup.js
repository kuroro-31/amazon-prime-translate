document.addEventListener("DOMContentLoaded", function () {
  const apiKeyInput = document.getElementById("apiKey");
  const targetLangSelect = document.getElementById("targetLang");
  const fontSizeSelect = document.getElementById("fontSize");
  const showOriginalCheckbox = document.getElementById("showOriginal");
  const showTranslationCheckbox = document.getElementById("showTranslation");
  const saveBtn = document.getElementById("saveBtn");
  const resetBtn = document.getElementById("resetBtn");
  const statusMsg = document.getElementById("statusMsg");

  // 設定をストレージから読み込む
  chrome.storage.sync.get(
    {
      apiKey: "",
      targetLang: "ja",
      fontSize: "medium",
      showOriginal: true,
      showTranslation: true,
    },
    function (items) {
      apiKeyInput.value = items.apiKey;
      targetLangSelect.value = items.targetLang;
      fontSizeSelect.value = items.fontSize;
      showOriginalCheckbox.checked = items.showOriginal;
      showTranslationCheckbox.checked = items.showTranslation;
    }
  );

  // 設定を保存
  saveBtn.addEventListener("click", function () {
    const settings = {
      apiKey: apiKeyInput.value.trim(),
      targetLang: targetLangSelect.value,
      fontSize: fontSizeSelect.value,
      showOriginal: showOriginalCheckbox.checked,
      showTranslation: showTranslationCheckbox.checked,
    };

    chrome.storage.sync.set(settings, function () {
      // コンテンツスクリプトに設定変更を通知
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: "updateSettings",
            settings: settings,
          });
        }
      });

      // 保存完了メッセージ
      statusMsg.textContent = "設定を保存しました";
      statusMsg.classList.remove("error");

      // 2秒後にメッセージを消す
      setTimeout(function () {
        statusMsg.textContent = "";
      }, 2000);
    });
  });

  // 設定をリセット
  resetBtn.addEventListener("click", function () {
    const defaultSettings = {
      apiKey: "",
      targetLang: "ja",
      fontSize: "medium",
      showOriginal: true,
      showTranslation: true,
    };

    // 入力フィールドをリセット
    apiKeyInput.value = defaultSettings.apiKey;
    targetLangSelect.value = defaultSettings.targetLang;
    fontSizeSelect.value = defaultSettings.fontSize;
    showOriginalCheckbox.checked = defaultSettings.showOriginal;
    showTranslationCheckbox.checked = defaultSettings.showTranslation;

    // ストレージの設定をリセット
    chrome.storage.sync.set(defaultSettings, function () {
      // コンテンツスクリプトに設定変更を通知
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: "updateSettings",
            settings: defaultSettings,
          });
        }
      });

      // リセット完了メッセージ
      statusMsg.textContent = "設定をリセットしました";
      statusMsg.classList.remove("error");

      // 2秒後にメッセージを消す
      setTimeout(function () {
        statusMsg.textContent = "";
      }, 2000);
    });
  });
});
