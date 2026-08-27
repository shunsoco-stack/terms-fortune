"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight, ArrowUpRight, Ban, BookOpen, Check, ChevronRight,
  Clock3, FileCheck2, FileText, Gift, History, Info, Leaf,
  Moon, ShieldCheck, Sparkles, Sun, Trash2, WifiOff,
} from "lucide-react";
import {
  formatClauseNumber, formatJapaneseDate, getFortune, getRareExample,
  getRecentDates, type FortuneResult,
} from "@/lib/fortune";
import {
  eraseViewedDates, navigate, saveViewedDate, useAppLocation,
  useIsOnline, useTheme, useToday, useViewedDates, type AppView,
} from "@/lib/client-state";
import { trackFortuneEvent } from "@/lib/analytics";
import { ShareControls } from "./share-controls";

function NavLink({ view, active, children }: { view: AppView; active?: boolean; children: React.ReactNode }) {
  return (
    <a href={`#${view}`} aria-current={active ? "page" : undefined}
      onClick={(event) => { event.preventDefault(); navigate(view); }}>
      {children}
    </a>
  );
}

function Header({ view }: { view: AppView }) {
  const { theme, toggle } = useTheme();
  return (
    <header className="site-header">
      <div className="header-inner">
        <a className="brand" href="#today" aria-label="利用規約占い トップへ"
          onClick={(event) => { event.preventDefault(); navigate("today"); }}>
          <span className="brand-seal" aria-hidden="true">規</span>
          <span><span className="brand-name">利用規約占い</span><span className="brand-en">TERMS & FORTUNE</span></span>
        </a>
        <nav className="main-nav" aria-label="メインメニュー">
          <NavLink view="today" active={view === "today" || view === "result"}><FileText size={15} /><span>今日の規約</span></NavLink>
          <NavLink view="history" active={view === "history"}><History size={15} /><span>これまでの条文</span></NavLink>
          <NavLink view="about" active={view === "about"}><span>この占いについて</span></NavLink>
        </nav>
        <button className="theme-button" onClick={toggle} aria-label={theme === "dark" ? "ライトモードに切り替える" : "ダークモードに切り替える"} title="表示モードを切り替える">
          {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
        </button>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-upper">
        <span className="footer-thought">日々に、ささやかな余白を。</span>
        <div className="footer-links"><NavLink view="sample">大吉の見本 <ArrowUpRight size={13} /></NavLink><NavLink view="about">ご利用にあたって</NavLink></div>
      </div>
      <div className="footer-lower">
        <span>© 利用規約占い <span className="footer-english">TERMS & FORTUNE</span></span>
        <span>法的効力はありません。法律相談ではありません。</span>
      </div>
    </footer>
  );
}

function HomeView({ today, viewed, onDraw }: { today: string; viewed: boolean; onDraw: () => void }) {
  return (
    <>
      <section className="hero" aria-labelledby="hero-heading">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> A LITTLE FORTUNE, IN FINE PRINT.</div>
          <p className="hero-pretitle">一日一条。暮らしに、ちょっとしたお告げ。</p>
          <h1 id="hero-heading">今日の運勢は、<br /><span className="headline-accent">規約</span>に書いてある。</h1>
          <p className="hero-description">いつもは読み飛ばす、あの文章。<br />今日は、あなたにいいことが書いてあるかも。</p>
          <button className="button button-primary hero-cta" onClick={onDraw} disabled={!today}>
            <FileCheck2 size={19} strokeWidth={1.7} /><span>今日の利用規約を確認する</span><ArrowRight size={18} />
          </button>
          <p className="hero-microcopy"><span className="small-check"><Check size={12} /></span>登録不要・無料<span className="micro-dot">·</span>毎日0:00更新（日本時間）</p>
          {viewed && <p className="already-viewed"><Check size={13} /> 本日は確認済み。同じ条文をもう一度読めます。</p>}
        </div>
        <div className="document-scene" aria-label="条文の一例を描いた規約書">
          <span className="scene-plus scene-plus-one" aria-hidden="true">＋</span>
          <span className="scene-plus scene-plus-two" aria-hidden="true">＋</span>
          <div className="document-back document-back-one" aria-hidden="true" />
          <div className="document-back document-back-two" aria-hidden="true" />
          <div className="hero-document">
            <div className="document-topline"><span>DAILY FORTUNE DOCUMENT</span><span>No. 001</span></div>
            <div className="document-title"><span className="document-title-small">あなたの一日に関する</span><strong>利用規約</strong><span className="document-title-en">TERMS OF A GOOD DAY</span></div>
            <div className="document-date">{today ? formatJapaneseDate(today) : "本日発行"}<span>発行</span></div>
            <div className="document-rule" />
            <p className="document-article">第1条 <span>（小さなしあわせについて）</span></p>
            <p className="document-clause">利用者は、本日、<br />小さないいことを<br /><span>受け取るものとします。</span></p>
            <div className="document-signoff"><span>なお、遠慮は不要とします。</span><span className="paper-stamp" aria-label="運勢在中"><span>運勢</span><span>在中</span></span></div>
            <div className="document-bottomline"><span>条文の一例</span><span>ひらくまで、今日の運勢は内緒です。</span></div>
          </div>
          <span className="document-side-note" aria-hidden="true">いい日になりますように。</span>
        </div>
      </section>

      <section className="how-it-works" aria-label="この占いの楽しみ方">
        <div className="how-title"><span className="eyebrow">HOW IT WORKS</span><h2>読むだけで、<br className="desktop-break" />ちょっといい一日。</h2></div>
        <div className="how-step"><span className="step-number">01</span><div><h3><FileText size={17} /> 今日の条文をひらく</h3><p>あなたに届くのは、一日ひとつ。<br />むずかしい言葉は、気楽にどうぞ。</p></div></div>
        <div className="how-step"><span className="step-number">02</span><div><h3><Sparkles size={17} /> 運勢を受け取る</h3><p>ラッキー条項やアイテムを、<br />今日の小さなヒントに。</p></div></div>
        <div className="how-step"><span className="step-number">03</span><div><h3><Gift size={17} /> だれかにおすそわけ</h3><p>くすっとしたら、画像で共有。<br />いい運勢は、分けても減りません。</p></div></div>
      </section>
      <aside className="gentle-notice"><ShieldCheck size={18} strokeWidth={1.6} /><p>本サービスは、肩の力を抜くためのものです。<span>すべてこのアプリのために書いた、オリジナルのパロディ条文です。</span></p><span className="notice-end" aria-hidden="true">どうぞ、お気軽に。</span></aside>
    </>
  );
}

function FortuneDocument({ result, sample }: { result: FortuneResult; sample: boolean }) {
  return (
    <article className={`result-document ${result.isRare ? "is-rare" : ""}`} aria-label={`${formatJapaneseDate(result.date)}の占い結果`}>
      <div className="result-paper-top"><span>{sample ? "SPECIAL EDITION · SAMPLE" : "YOUR DAILY FORTUNE"}</span><span>{formatJapaneseDate(result.date)}</span></div>
      <div className="result-heading-row"><div><p className="result-caption">{sample ? "特別条項" : "本日の利用規約"}</p><h2>{formatClauseNumber(result.clause)}</h2><p className="clause-title">（{result.clause.title}）</p></div><div className={`fortune-stamp ${result.isRare ? "rare-stamp" : ""}`}><span>本日の運勢</span><strong>{result.isRare ? "大吉" : result.rank}</strong><span>{result.isRare ? "特 別 承 認" : "確 認 済"}</span></div></div>
      {result.isRare && <div className="rare-rank"><Sparkles size={15} /><span>全部読んだことにする大吉</span><Sparkles size={15} /></div>}
      <p className="result-clause" data-testid="fortune-clause">{result.clause.text}</p>
      <div className="interpretation"><Leaf size={18} strokeWidth={1.5} /><div><p className="detail-label">つまり、こんな一日。</p><p>{result.clause.interpretation}</p></div></div>
      <div className="lucky-grid">
        <div className="lucky-detail"><span className="lucky-icon"><BookOpen size={17} /></span><p className="detail-label">ラッキー条項</p><p>{result.clause.luckyClause}</p></div>
        <div className="lucky-detail"><span className="lucky-icon"><Gift size={17} /></span><p className="detail-label">ラッキーアイテム</p><p>{result.clause.luckyItem}</p></div>
        <div className="lucky-detail avoid-detail"><span className="lucky-icon"><Ban size={17} /></span><p className="detail-label">今日やってはいけないこと</p><p>{result.clause.avoid}</p></div>
      </div>
      <div className="result-paper-footer"><span className="tiny-brand">利用規約占い</span><span>{sample ? "大吉の見本 · 今日の結果ではありません" : "同意しなくても、いい一日を。"}</span></div>
    </article>
  );
}

function ResultView({ result, today, sample, notify }: { result: FortuneResult; today: string; sample: boolean; notify: (message: string) => void }) {
  const past = result.date !== today;
  return (
    <section className={`result-view page-view ${result.isRare ? "rare-view" : ""}`}>
      <div className="page-heading result-page-heading">
        <div className="eyebrow">{sample ? "A VERY SPECIAL CLAUSE" : "TODAY’S TERMS, YOUR FORTUNE"}</div>
        <h1>{sample ? "たまには、すべてよし。" : past ? "あの日の条文を、もう一度。" : "本日の条文を、お届けします。"}</h1>
        <p>{sample ? "めったに出会えない、特別な大吉の見本です。" : past ? "日付にひもづいた、その日だけの運勢です。" : "ひと息ついて、今日のあなたへの一条を。"}</p>
      </div>
      {sample && <div className="sample-banner"><Info size={17} /><span><strong>大吉の見本</strong> — 今日の占い結果ではありません。履歴には保存されません。</span></div>}
      <FortuneDocument result={result} sample={sample} />
      <ShareControls key={`${result.date}-${sample}`} result={result} sample={sample} notify={notify} />
      <p className="result-reminder"><Clock3 size={14} /> 同じ日は、何度ひらいても同じ運勢。次の条文は日本時間0:00に。</p>
      <div className="result-bottom-links"><NavLink view="today">今日の規約へ戻る</NavLink><NavLink view="history">これまでの条文 <ArrowRight size={14} /></NavLink></div>
    </section>
  );
}

function HistoryView({ today, dates, onRead, notify }: { today: string; dates: string[]; onRead: (date: string) => void; notify: (message: string) => void }) {
  const [confirmClear, setConfirmClear] = useState(false);
  const recent = today ? getRecentDates(today) : [];
  const viewed = dates.filter((date) => recent.includes(date));
  function clear() {
    const { cleared, sessionCleared } = eraseViewedDates();
    if (cleared) { notify("この端末の確認履歴を削除しました。"); setConfirmClear(false); }
    else if (sessionCleared) { notify("この画面の確認履歴を消しました。ブラウザ内の保存データは削除できない場合があります。"); setConfirmClear(false); }
    else notify("履歴を削除できませんでした。ブラウザの保存設定をご確認ください。");
  }
  return (
    <section className="history-view page-view">
      <div className="page-heading"><div className="eyebrow">A SMALL ARCHIVE OF YOUR DAYS</div><h1>これまでの条文</h1><p>振り返ってみると、なかなかいい日々です。</p></div>
      <div className="history-meta"><span><History size={16} /> 直近7日間</span><span>この端末で <strong>{viewed.length}</strong> 日分を確認済み</span></div>
      <div className="history-list" aria-label="直近7日間の占い履歴">
        {recent.map((date, index) => {
          const fortune = getFortune(date);
          const isViewed = viewed.includes(date);
          return (
            <button key={date} className={`history-row ${isViewed ? "was-viewed" : ""}`} onClick={() => onRead(date)} aria-label={`${formatJapaneseDate(date)} ${isViewed ? fortune.rank : "未確認の条文を開く"}`}>
              <span className="history-calendar"><span>{date.slice(5, 7)}月</span><strong>{date.slice(8)}</strong></span>
              <span className="history-entry"><span className="history-entry-top">{index === 0 && <span className="today-tag">今日</span>}<span>{isViewed ? formatClauseNumber(fortune.clause) : "この日の条文"}</span><span className="history-check">{isViewed ? <><Check size={12} />確認済み</> : "未確認"}</span></span><span className="history-entry-text">{isViewed ? fortune.clause.text : "まだひらいていない、あなたへの一条。"}</span></span>
              {isViewed ? <span className={`history-rank ${fortune.isRare ? "history-rare" : ""}`}>{fortune.isRare ? "特別大吉" : fortune.rank}</span> : <span className="history-unopened"><FileText size={20} /></span>}
              <ChevronRight size={17} className="history-chevron" />
            </button>
          );
        })}
      </div>
      <div className="history-footnote"><ShieldCheck size={17} /><p>確認履歴は、このブラウザだけに保存されます。<br />未確認の日もひらけます。7日より前の確認履歴は表示・保存の対象外です。</p></div>
      {viewed.length > 0 && <div className="clear-history">{confirmClear ? <div className="clear-confirm"><p>この端末の確認履歴を削除しますか？<br /><small>条文の内容は変わりません。確認済みの記録だけが消えます。</small></p><div><button className="button button-small" onClick={() => setConfirmClear(false)}>キャンセル</button><button className="button button-danger button-small" onClick={clear}>確認履歴を削除</button></div></div> : <button className="text-button" onClick={() => setConfirmClear(true)}><Trash2 size={14} /> この端末の確認履歴を削除</button>}</div>}
    </section>
  );
}

function AboutView() {
  return (
    <section className="about-view page-view">
      <div className="page-heading"><div className="eyebrow">PLEASE READ. OR JUST SMILE.</div><h1>むずかしい規約に、<br />やさしい余白を。</h1><p>読まないはずの文章が、読みたくなる文章になったら。</p></div>
      <div className="about-intro"><span className="brand-seal large-brand-seal" aria-hidden="true">規</span><p>「利用規約占い」は、利用規約のような文章を<br className="desktop-break" />今日の運勢として楽しむ、小さなWebアプリです。<br /><br />まじめな顔をした条文に、少しのユーモアを。<br />一日のはじまりや、ひと休みのおともにどうぞ。</p></div>
      <div className="about-sections">
        <section><span className="about-number">01</span><div><h2>これは、占いという名のパロディです。</h2><p>表示する条文はすべて、このアプリのために新しく作成したオリジナル文章です。実在するサービスの利用規約を転載していません。</p><p className="disclaimer-explicit">法的効力はありません。<br />法律相談ではありません。</p><p>運勢や「やってはいけないこと」は、娯楽としてお楽しみください。契約の解釈や法律上の判断、未来の出来事を保証するものではありません。</p></div></section>
        <section><span className="about-number">02</span><div><h2>一日ひとつ。だれにでも、同じ一条。</h2><p>72件の通常条文と、レアな「全部読んだことにする大吉」を用意しました。日本時間の毎日0:00に新しい条文に切り替わります。同じ日なら、どの端末でも同じ結果です。</p><p>運勢のランクは、大吉・吉・中吉・小吉・末吉と特別大吉。見本の大吉は今日の結果を変えず、確認履歴にも入りません。</p><NavLink view="sample">レアな大吉の見本を読む <ArrowUpRight size={14} /></NavLink></div></section>
        <section><span className="about-number">03</span><div><h2>あなたの履歴は、あなたの端末に。</h2><p>登録は不要です。確認した日付と表示モードを、ブラウザのlocalStorageに保存します。直近7日間の確認履歴は、この端末だけのものです。履歴画面から削除できます。</p><p>プライベートブラウズや保存を制限している環境では、履歴が次の訪問に残らない場合があります。別端末への同期はありません。</p></div></section>
        <section><span className="about-number">04</span><div><h2>ひとことの運勢を、おすそわけ。</h2><p>結果をPNG画像として保存したり、X・端末の共有メニュー・クリップボードで共有できます。共有カードの生成は端末内で行い、画像や確認履歴をサーバーへアップロードしません。</p><p>共有はあなたの操作で開始します。端末の共有メニューやクリップボードが使えない場合は、共有用の文章を手動でコピーできます。</p></div></section>
        <section><span className="about-number">05</span><div><h2>ホーム画面にも、小さな規約を。</h2><p>ブラウザのメニューから「アプリをインストール」または「ホーム画面に追加」を選ぶと、アプリのように使えます。Safariでは共有メニューから追加できます。</p><p>初回のオンライン読み込みと保存が完了すれば、オフラインでも占い・履歴・画像作成を利用できます。外部への共有には通信が必要です。</p></div></section>
        <section><span className="about-number">06</span><div><h2>よりよい使い心地のために。</h2><p>ページ閲覧の統計にVercel Analyticsを利用します。占い実行・画像保存・共有の計測コードも組み込んでいますが、現在の公開先プランでは操作イベントを集計できません。集計には対応プランが必要です。</p><p>確認履歴の一覧は送信しません。占いの生成に外部APIや生成AIは使用していません。共有イベントはXの投稿画面を開く操作・端末共有の完了・コピー成功を区別する設計です。Xへの投稿完了そのものを取得することはありません。</p><a href="https://vercel.com/docs/analytics/privacy-policy" target="_blank" rel="noopener noreferrer">Vercel Analyticsのプライバシーについて <ArrowUpRight size={14} /></a></div></section>
      </div>
      <button className="button button-primary about-cta" onClick={() => navigate("today")}>今日の規約をひらきにいく <ArrowRight size={17} /></button>
    </section>
  );
}

function OfflineSupport() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let active = true;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        if (!active) return;
        const urls = performance.getEntriesByType("resource").map((entry) => entry.name);
        registration.active?.postMessage({ type: "CACHE_ASSETS", urls });
      })
      .catch(() => { /* The online app remains fully usable when storage is restricted. */ });
    return () => { active = false; };
  }, []);
  return null;
}

export function FortuneApp() {
  const today = useToday();
  const viewedDates = useViewedDates();
  const { view, date: requestedDate } = useAppLocation();
  const online = useIsOnline();
  const [notice, setNotice] = useState("");
  const { result, invalidDate } = useMemo((): { result: FortuneResult | null; invalidDate: boolean } => {
    if (!today || (view !== "result" && view !== "sample")) return { result: null, invalidDate: false };
    try {
      if (view === "sample") return { result: getRareExample(today), invalidDate: false };
      const date = requestedDate ?? today;
      if (date > today) throw new Error("Future dates are unopened");
      return { result: getFortune(date), invalidDate: false };
    } catch { return { result: null, invalidDate: true }; }
  }, [today, view, requestedDate]);
  const resultDate = result?.date;
  useEffect(() => {
    if (view === "result" && resultDate && today && getRecentDates(today).includes(resultDate)) {
      saveViewedDate(resultDate, today);
    }
  }, [view, resultDate, today]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function draw() {
    if (!today) return;
    const fortune = getFortune(today);
    const persisted = saveViewedDate(today, today);
    trackFortuneEvent("fortune_draw", { rank: fortune.rankKey, repeated: viewedDates.includes(today) });
    navigate("result");
    if (!persisted) setNotice("占いは利用できますが、履歴を保存できませんでした。この画面で結果をお楽しみください。");
  }
  function readDate(date: string) {
    const persisted = saveViewedDate(date, today);
    if (date === today) trackFortuneEvent("fortune_draw", { rank: getFortune(date).rankKey, repeated: viewedDates.includes(date) });
    navigate("result", date === today ? undefined : date);
    if (!persisted) setNotice("このブラウザでは確認履歴を保存できません。占いはそのまま楽しめます。");
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); const main = document.getElementById("main-content"); main?.focus(); main?.scrollIntoView({ block: "start", behavior: "instant" }); }}>本文へスキップ</a>
      <Header view={view} />
      {!online && <div className="offline-banner" role="status"><WifiOff size={14} /> オフラインです。保存済みのアプリで占いを楽しめます。</div>}
      <main id="main-content" className="main-content" tabIndex={-1}>
        {view === "today" && <HomeView today={today} viewed={viewedDates.includes(today)} onDraw={draw} />}
        {(view === "result" || view === "sample") && (invalidDate ? <div className="error-page"><Info size={28} /><h1>その日の条文は、開封できません。</h1><p>日付が正しくないか、まだ先の日付です。今日の運勢をお楽しみください。</p><button className="button button-primary" onClick={() => navigate("today")}>今日の規約へ戻る</button></div> : result ? <ResultView result={result} today={today} sample={view === "sample"} notify={setNotice} /> : <p className="loading-message" role="status">今日の日付を確認しています…</p>)}
        {view === "history" && <HistoryView today={today} dates={viewedDates} onRead={readDate} notify={setNotice} />}
        {view === "about" && <AboutView />}
      </main>
      <Footer />
      <div className={`toast ${notice ? "toast-visible" : ""}`} role="status" aria-live="polite">{notice && <><Check size={16} /><span>{notice}</span></>}</div>
      <OfflineSupport />
      <noscript><p className="noscript-message">占いと履歴にはJavaScriptを使用します。ブラウザの設定で有効にしてください。</p></noscript>
    </div>
  );
}
