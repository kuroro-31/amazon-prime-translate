import { useState, useEffect } from "react";

interface Settings {
  targetLanguage: string;
  sourceLanguage: string;
  showOriginal: boolean;
  showTranslation: boolean;
  fontSize: number;
  position: string;
  enabled: boolean;
}

const Settings = () => {
  const [settings, setSettings] = useState<Settings>({
    targetLanguage: "ja",
    sourceLanguage: "en",
    showOriginal: true,
    showTranslation: true,
    fontSize: 16,
    position: "bottom",
    enabled: true,
  });

  const [status, setStatus] = useState<string>("");

  // 設定の読み込み
  useEffect(() => {
    chrome.storage.sync.get(settings, (items) => {
      setSettings(items as Settings);
    });
  }, []);

  // 設定の保存
  const saveSettings = () => {
    chrome.storage.sync.set(settings, () => {
      setStatus("設定が保存されました");
      setTimeout(() => setStatus(""), 3000);
    });
  };

  // 言語オプション
  const languageOptions = [
    { value: "ja", label: "日本語" },
    { value: "en", label: "英語" },
    { value: "ko", label: "韓国語" },
    { value: "zh-CN", label: "中国語 (簡体)" },
    { value: "zh-TW", label: "中国語 (繁体)" },
    { value: "fr", label: "フランス語" },
    { value: "de", label: "ドイツ語" },
    { value: "es", label: "スペイン語" },
    { value: "it", label: "イタリア語" },
    { value: "ru", label: "ロシア語" },
  ];

  // 位置オプション
  const positionOptions = [
    { value: "bottom", label: "下" },
    { value: "top", label: "上" },
  ];

  return (
    <div className="settings-container">
      <h1>Amazon Prime Translator 設定</h1>

      <div className="setting-group">
        <label>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) =>
              setSettings({ ...settings, enabled: e.target.checked })
            }
          />
          拡張機能を有効にする
        </label>
      </div>

      <div className="setting-group">
        <label>原語:</label>
        <select
          value={settings.sourceLanguage}
          onChange={(e) =>
            setSettings({ ...settings, sourceLanguage: e.target.value })
          }
        >
          {languageOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="setting-group">
        <label>翻訳言語:</label>
        <select
          value={settings.targetLanguage}
          onChange={(e) =>
            setSettings({ ...settings, targetLanguage: e.target.value })
          }
        >
          {languageOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="setting-group">
        <label>
          <input
            type="checkbox"
            checked={settings.showOriginal}
            onChange={(e) =>
              setSettings({ ...settings, showOriginal: e.target.checked })
            }
          />
          原文を表示
        </label>
      </div>

      <div className="setting-group">
        <label>
          <input
            type="checkbox"
            checked={settings.showTranslation}
            onChange={(e) =>
              setSettings({ ...settings, showTranslation: e.target.checked })
            }
          />
          翻訳を表示
        </label>
      </div>

      <div className="setting-group">
        <label>フォントサイズ:</label>
        <input
          type="number"
          value={settings.fontSize}
          min={10}
          max={32}
          onChange={(e) =>
            setSettings({
              ...settings,
              fontSize: parseInt(e.target.value) || 16,
            })
          }
        />
      </div>

      <div className="setting-group">
        <label>字幕の位置:</label>
        <select
          value={settings.position}
          onChange={(e) =>
            setSettings({ ...settings, position: e.target.value })
          }
        >
          {positionOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <button className="save-button" onClick={saveSettings}>
        設定を保存
      </button>

      {status && <div className="status-message">{status}</div>}
    </div>
  );
};

export default Settings;
