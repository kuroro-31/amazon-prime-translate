# Amazon Prime Translate

Amazon Prime Video 用の翻訳 Chrome 拡張機能です。Amazon Prime Video の再生中に字幕を検出し、OpenAI API を使用してリアルタイムで翻訳を表示します。

## 機能

- Amazon Prime Video の字幕をリアルタイムで翻訳
- オリジナル字幕と翻訳字幕の同時表示
- 字幕サイズのカスタマイズ
- 複数の言語に対応
- OpenAI の GPT-4o-mini モデルを使用した高品質な翻訳

## インストール方法

### Chrome ウェブストアからインストール（予定）

Chrome ウェブストアから拡張機能をインストールできるようになる予定です。

### 手動インストール

1. このリポジトリをダウンロードまたはクローンします。
2. Chrome で `chrome://extensions` を開きます。
3. 右上の「デベロッパーモード」をオンにします。
4. 「パッケージ化されていない拡張機能を読み込む」をクリックし、ダウンロードしたフォルダを選択します。

## 使い方

1. 拡張機能をインストールします。
2. 拡張機能のアイコンをクリックし、設定を開きます。
3. OpenAI API キーを入力します（キーを取得するには [OpenAI のウェブサイト](https://platform.openai.com/) にアクセスしてください）。
4. 翻訳先の言語、字幕サイズ、表示オプションを設定します。
5. Amazon Prime Video でビデオを再生すると、自動的に字幕が検出され翻訳されます。

## 設定

- **API キー**: OpenAI API キーを入力してください（必須）。
- **翻訳先言語**: 字幕を翻訳する言語を選択できます。
- **字幕サイズ**: 字幕のサイズを小・中・大から選択できます。
- **オリジナル字幕を表示**: オン/オフを切り替えることで、元の字幕の表示を制御できます。
- **翻訳字幕を表示**: オン/オフを切り替えることで、翻訳字幕の表示を制御できます。

## 注意事項

- この拡張機能は OpenAI API を使用するため、使用量に応じて料金が発生する場合があります。
- API キーは安全に保管し、共有しないでください。
- 翻訳精度は OpenAI モデルの性能に依存します。
- すべての Amazon Prime Video コンテンツに対して動作を保証するものではありません。

## プライバシー

この拡張機能は、字幕テキストを OpenAI API に送信して翻訳を取得します。ユーザーの視聴履歴や個人情報は収集しません。API キーはローカルに保存され、翻訳リクエストにのみ使用されます。

## サポート

問題や提案がある場合は、GitHub リポジトリの Issues セクションで報告してください。
