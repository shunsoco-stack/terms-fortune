# 検証・公開記録

実行した確認と、未確認の項目を分けて記録します。未確認は成功を意味しません。

- 対象：利用規約占い / terms-fortune
- 記録日：2026-08-27（日本時間）
- 公開アプリ：[https://terms-fortune.vercel.app](https://terms-fortune.vercel.app)
- GitHub：[shunsoco-stack/terms-fortune](https://github.com/shunsoco-stack/terms-fortune)（Public）
- 初回公開コミット：[557aee5](https://github.com/shunsoco-stack/terms-fortune/commit/557aee50cf3ac69f52793808e8428c5e56764a55)

VercelのREADY状態、匿名Chromeからの公開URL表示、主要画面の公開QA、公開UIからの5枚の撮影を確認しています。Analyticsの実HTTP受信とダッシュボード上の集計は未確認です。

## 自動検証

ローカル環境で npm run verify とE2Eが完了し、GitHubの品質CIも成功しました。E2Eの接続先はローカルの本番サーバー（ポート3174）で、公開先での検証とは区別しています。Node.jsは24.xです。

| 項目 | 状態 | 確認内容 |
| --- | --- | --- |
| lint | 成功 | ESLint、警告0件 |
| typecheck | 成功 | Next.jsの型生成とTypeScriptの型検査 |
| unit tests | 成功 | 78件中78件成功 |
| secret-scan | 成功 | 自作ソースツリースキャナー、疑わしい検出0件 |
| build | 成功 | Next.js 16.3.3の本番ビルド |
| E2E | 成功 | 29ケース × デスクトップ／モバイルの2設定＝58件中58件成功 |
| GitHub Actions | 成功 | Node.js 24でlint・型検査・単体テスト・Secret Scan・build。[確認済み実行](https://github.com/shunsoco-stack/terms-fortune/actions/runs/33062013483) |
| Gitleaks | 成功 | 8.30.1で初回公開時の全Git履歴（1コミット）を検査、検出0件 |
| GitHub Secret Scanning | 有効 | 確認時点の未解決アラート0件 |
| GitHub Push Protection | 有効 | リポジトリ設定を確認 |

自作Secret Scanはネットワーク送信を行わず、検出値を出力しません。ソースツリー検査と、別途実行したGitleaksのGit履歴検査を分けています。検出0件は、完全な安全性や第三者依存関係の安全性を保証するものではありません。

### E2Eの再現手順

1つ目のターミナルで npm run build を実行し、その後 npm run start -- --port 3174 で本番サーバーを起動します。起動したまま、別のターミナルで npm run test:e2e を実行します。

既定はインストール済みGoogle Chrome、接続先は http://127.0.0.1:3174 です。PlaywrightのChromiumを使用する場合は npx playwright install chromium の後、E2E_BROWSER_CHANNEL=chromiumを設定します。公開先の確認ではE2E_BASE_URLに検証対象の公開URLを指定します。[詳細手順](../README.md#e2eテスト)

E2E58件では、日付境界・共有URL・履歴・保存失敗・PNG保存・テーマ・キーボード操作・準備済みService Workerによるオフラインの占い／画像／履歴を確認しています。AnalyticsのSDK呼び出し検査は外部への計測通信を遮断しています。Web Shareやクリップボードの成功・失敗分岐にはテスト用のAPI実装も用いており、SNSへの実投稿は行っていません。

## 日付・データ・履歴

以下は単体テストとローカル本番ビルドのE2Eで確認済みの項目です。公開UIでの再検証とは区別しています。

- [x] オリジナル通常条文72件＋レア条文1件。IDと本文の重複、必須項目の欠落がない
- [x] 同じ日本時間の日付は同じ結果になる
- [x] 日本時間の0時で翌日の別条文に変わる
- [x] 不正な日付を別の日付へ自動補正しない
- [x] 共有URLが指定日の結果を再現する
- [x] 直近7暦日だけを履歴として表示する
- [x] 閲覧した日付だけに確認済みマークをつける
- [x] レア見本は今日の結果と明示的に区別し、履歴や通常イベントに混ぜない
- [x] localStorage破損・保存拒否でも占いを継続できる
- [x] 履歴削除は本アプリの履歴キーだけに作用する

## 公開アプリでの確認

- [x] 公開URLが認証なしで表示できる
- [x] GitHubリポジトリがPublicで表示できる
- [x] 今日の条文と3つの詳細（ラッキー条項・ラッキーアイテム・今日やってはいけないこと）が表示される
- [x] デスクトップ画面の表示、および390px幅のトップ・結果・履歴で横はみ出しがない
- [x] ダークテーマへ切り替えられる
- [x] 共有ダイアログで実寸1,200 × 1,200pxのPNGを生成し、ダイアログを閉じられる
- [x] レア見本に「今日の結果ではない」「履歴には保存されない」と表示される
- [x] 履歴7件と、実際に確認した日付のマークが表示される
- [x] トップ・manifest・robots・sitemap・Service Worker・アプリアイコン2種・Apple用アイコン・favicon・OG画像の計10リソースがHTTP 200
- [x] PNGの実寸・ICO形式・manifestのstandalone表示／アイコン／scope、robots・sitemapの公開元が正しい
- [x] canonical・OG URL・OG画像が公開アプリのURLを参照する
- [x] 公開ページが同じ公開元のService Workerに制御される
- [x] 「法的効力はありません」「法律相談ではありません」が表示される
- [x] 公開ブラウザの未捕捉ページエラー0件

公開スモークテストは [scripts/verify-published.mjs](../scripts/verify-published.mjs) で実行し、結果はローカルの .cache/published-verification.json に記録します。PNGの実ダウンロード、キーボード／フォーカス、X・コピーの内容、Web Shareの対応・非対応・キャンセル分岐、オフラインでの再読み込みと占い・履歴・PNG生成はローカル本番ビルドのE2Eで確認済みですが、この公開スモークテストの実行対象には含めていません。

Vercelの本番エラーログも確認し、確認時点から過去15分には該当ログがありませんでした。これは期間外を含む無障害の保証ではありません。

## スクリーンショット

公開アプリのUIを操作し、以下の5枚を撮影・保存しました。撮影時刻とブラウザの詳細は [capture-info.json](../public/screenshots/capture-info.json) を参照してください。

| 画面 | 保存先 | 撮影状況 |
| --- | --- | --- |
| トップ | public/screenshots/01-home.png | 公開UIから撮影済み |
| 占い結果 | public/screenshots/02-result.png | 公開UIから撮影済み |
| 大吉結果 | public/screenshots/03-daikichi.png | 公開UIのレア見本を撮影済み。今日の結果ではない |
| 共有カード | public/screenshots/04-share.png | 公開UIの共有プレビューを撮影済み |
| 履歴 | public/screenshots/05-history.png | 公開UIで直近7日の結果を実際に開いた状態を撮影済み |

5枚のPNGファイルと撮影記録の存在、記録された撮影元URLを確認済みです。READMEに上記5枚を埋め込んでいます。

### 撮影手順と撮影元の記録

再撮影は npm run screenshots -- https://terms-fortune.vercel.app を実行します。

スクリプトは新しいプロファイルで公開アプリのUIを操作します。大吉は見本画面を使い、履歴は今日と過去6日の結果を実際に開いて確認済みにしたうえで撮影します。

public/screenshots/capture-info.json に公開元URL・画面サイズ・ブラウザ・各画像の撮影時URLと時刻・見本と履歴の説明を記録しています。再撮影時はこのJSONも更新し、5枚のPNGと一緒に管理します。

## Vercel Analytics

計測コードに実装済みのカスタムイベントは fortune_draw / image_save / share。見本操作とローカル履歴一覧は送信しません。

現在のデプロイ先チームは **Hobbyプラン** です。ページビューは無料上限内で利用できますが、**カスタムイベントの集計・ダッシュボード表示はPro／Enterprise限定のため、本番での3操作の集計は未対応**です。これは単なる受信確認待ちではなく、現行プランの機能制限です。[Vercel公式のプラン別対応表](https://vercel.com/docs/analytics/limits-and-pricing)

| 確認対象 | 状態 |
| --- | --- |
| イベントを呼び出すコード | fortune_draw / image_save / share を実装済み |
| ローカルモックによる計測関数の検査 | 成功。3種類のイベント名・属性、見本除外、計測失敗時も例外を外へ出さないことを確認 |
| ローカルE2Eでの実操作からSDKへの呼び出し | 成功。計測通信を遮断し、3種類の操作イベントと見本除外を確認 |
| 公開画面からの操作イベント呼び出し | 未確認。上記モック検査とは別 |
| Web Analyticsの有効化 | 有効化済み。設定更新の成功応答と、プロジェクトAPIの読み戻しでenabledAtを確認。Hobbyを維持 |
| 公開Analyticsスクリプトの取得 | SDKスクリプト読込みとHTTP 200を確認。ページビュー受信の証拠とは区別 |
| 本番ページビューの受信・集計 | 未確認 |
| カスタムイベントの本番集計・表示 | Hobby非対応のため未達。計測コードの存在を集計成功とは扱わない |
| プラン変更・トライアル・追加課金 | 実施していない |

モックとE2Eの計測検査は、Vercel SDKへ渡すイベントをテスト用関数で捕捉したものです。Vercelの受信サーバーやダッシュボードでの確認ではありません。

公開SDKスクリプトには navigator.webdriver またはHeadlessを含むユーザーエージェントを計測対象から除外する処理があり、今回の隔離headless ChromeではページビューPOSTが発生しませんでした。ブラウザの偽装や受信数の作成は行わず、本番ページビューの受信・ダッシュボード集計は未検証としています。これはHobbyのカスタムイベント非対応とは別の制約です。

無料ページビューの正式な有効化手段は、VercelダッシュボードのAnalyticsからEnable、またはCLIの project web-analytics enable コマンドです。確認したCLI 59.7.0はHobbyでも有効化時に対話確認を要求します。有効化後は再デプロイが必要です。この設定だけでカスタムイベントのプラン制限が解除されることはありません。[公式セットアップ手順](https://vercel.com/docs/analytics/quickstart)、[CLIリファレンス](https://vercel.com/docs/cli/project#web-analytics)

必要なプラン変更や課金操作は、承認なしで行いません。

## 公開・掲載

- Vercel公開：CLIによる本番公開済み。READYと匿名Chromeアクセスを確認
- GitHub公開：Publicリポジトリで公開済み
- GitHub→Vercel自動デプロイ：未接続。公開はVercel CLI、GitHub Actionsは品質確認のみ
- Tsukutta掲載状況：未掲載
- YOUTRUST：投稿文のみ作成、未投稿
