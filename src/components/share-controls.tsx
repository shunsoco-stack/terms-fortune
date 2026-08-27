"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Copy, Download, LoaderCircle, Share2, X } from "lucide-react";
import type { FortuneResult } from "@/lib/fortune";
import { createShareCard, getShareText } from "@/lib/share-card";
import { trackFortuneEvent } from "@/lib/analytics";
import { SITE_URL } from "@/lib/site";

type Props = { result: FortuneResult; sample: boolean; notify: (message: string) => void };

export function ShareControls({ result, sample, notify }: Props) {
  const [card, setCard] = useState<{ blob: Blob; url: string } | null>(null);
  const [cardError, setCardError] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [sharing, setSharing] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLButtonElement>(null);
  const shareUrl = sample ? `${SITE_URL}/#sample` : `${SITE_URL}/?date=${result.date}#result`;
  const text = getShareText(result, shareUrl, { sample });
  const fileName = `terms-fortune-${sample ? "sample-" : ""}${result.date}.png`;

  useEffect(() => {
    let mounted = true;
    let blobUrl: string | null = null;
    createShareCard(result, { sample }).then((blob) => {
      if (!mounted) return;
      blobUrl = URL.createObjectURL(blob);
      setCard({ blob, url: blobUrl });
    }).catch(() => { if (mounted) setCardError(true); });
    return () => { mounted = false; if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [result, sample]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialogOpen || !dialog) return;
    const previousOverflow = document.body.style.overflow;
    const returnFocus = returnFocusRef.current;
    const keepFocusInDialog = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first || !last) return;
      // Native modal dialogs make the page inert, but some browsers still move
      // Tab focus to browser chrome at the edges. Keep the visible loop local.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.body.style.overflow = "hidden";
    dialog.addEventListener("keydown", keepFocusInDialog);
    dialog.showModal();
    return () => {
      dialog.removeEventListener("keydown", keepFocusInDialog);
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      returnFocus?.focus();
    };
  }, [dialogOpen]);

  function download() {
    if (!card) { notify("画像を準備しています。少し待ってからもう一度お試しください。"); return; }
    const link = document.createElement("a");
    link.href = card.url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    trackFortuneEvent("image_save", { rank: result.rankKey, format: "png" }, sample);
    notify("画像の保存を開始しました。保存されない場合は、共有画面の画像を長押ししてください。");
  }

  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setCopyError(false);
      trackFortuneEvent("share", { channel: "clipboard", outcome: "copied" }, sample);
      notify("条文とリンクをコピーしました。");
    } catch {
      setCopyError(true);
      notify("コピーできませんでした。共有用テキストを選択して、手動でコピーしてください。");
    }
  }

  async function nativeShare() {
    if (!navigator.share) { await copy(); return; }
    setSharing(true);
    try {
      const file = card ? new File([card.blob], fileName, { type: "image/png" }) : null;
      const payload = file && navigator.canShare?.({ files: [file] })
        ? { title: "利用規約占い", text, files: [file] }
        : { title: "利用規約占い", text, url: shareUrl };
      await navigator.share(payload);
      trackFortuneEvent("share", { channel: "native", outcome: "completed" }, sample);
      notify("共有しました。");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        notify("端末の共有メニューを利用できませんでした。コピーか画像保存をお試しください。");
      }
    } finally { setSharing(false); }
  }

  function shareX() {
    const url = `https://x.com/intent/post?${new URLSearchParams({ text }).toString()}`;
    window.open(url, "_blank", "noopener,noreferrer");
    trackFortuneEvent("share", { channel: "x", outcome: "intent_opened" }, sample);
  }

  return (
    <>
      <div className="result-actions">
        <button className="button button-primary" onClick={download} disabled={!card}><Download size={17} />画像として保存</button>
        <button ref={returnFocusRef} className="button button-secondary" onClick={() => setDialogOpen(true)}><Share2 size={17} />結果を共有する</button>
      </div>
      {cardError && <p className="inline-error" role="alert">画像の作成に失敗しました。ページを読み直すか、テキスト共有をご利用ください。</p>}
      {dialogOpen && <dialog ref={dialogRef} className="share-dialog" aria-labelledby="share-title" onCancel={() => setDialogOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setDialogOpen(false); } }}>
        <div className="dialog-heading"><div><span className="eyebrow">A LITTLE GOOD FORTUNE TO GO</span><h2 id="share-title">運勢を、おすそわけ。</h2></div><button className="icon-button" onClick={() => setDialogOpen(false)} aria-label="共有画面を閉じる" autoFocus><X size={21} /></button></div>
        <p className="share-description">今日の一条を、あなたらしいかたちで。</p>
        <div className="share-preview">{card ? <Image src={card.url} alt={`${sample ? "大吉の見本。" : ""}${result.rank}。${result.clause.text} ラッキー条項：${result.clause.luckyClause}。ラッキーアイテム：${result.clause.luckyItem}。今日やってはいけないこと：${result.clause.avoid}。法的効力はありません。法律相談ではありません。`} width={1200} height={1200} unoptimized /> : <div className="share-loading" role="status">{cardError ? "画像を作成できませんでした" : <><LoaderCircle size={22} className="spinner" />共有カードを準備しています</>}</div>}</div>
        <p className="share-image-note">PNG · 1200 × 1200 px · 画像は端末内で作成します</p>
        <div className="share-buttons">
          <button className="button button-primary" onClick={download} disabled={!card}><Download size={17} />画像を保存</button>
          <button className="button button-secondary" onClick={nativeShare} disabled={sharing}><Share2 size={17} />{sharing ? "共有中…" : "端末で共有"}</button>
          <button className="button button-secondary" onClick={shareX}><span className="x-brand" aria-hidden="true">𝕏</span>Xで共有<ArrowUpRight size={14} /></button>
          <button className="button button-secondary" onClick={copy}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? "コピーしました" : "文章をコピー"}</button>
        </div>
        <details className="share-text-details" open={copyError || undefined}><summary>共有用テキストを表示</summary>{copyError && <p className="inline-error">下の文章を選択してコピーしてください。</p>}<textarea aria-label="共有用テキスト" value={text} readOnly rows={5} onFocus={(event) => event.currentTarget.select()} /></details>
        <p className="share-privacy">Xは投稿画面が開きます。自動で投稿されることはありません。</p>
      </dialog>}
    </>
  );
}
