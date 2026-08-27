import Link from "next/link";

export default function NotFound() {
  return (
    <main className="error-page">
      <span className="eyebrow">ARTICLE 404</span>
      <h1>その条文は、まだ白紙です。</h1>
      <p>お探しのページは見つかりませんでした。</p>
      <Link href="/" className="button button-primary">今日の規約へ戻る</Link>
    </main>
  );
}
