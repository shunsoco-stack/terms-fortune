import type { FortuneResult } from "./fortune";

export type ShareCardOptions = { sample?: boolean };

const PAPER = "#f6f3ec";
const INK = "#24372f";
const MUTED = "#74796f";
const LINE = "#d8d8cb";
const VERMILION = "#b94d3e";
const GOLD = "#a18242";
const SERIF = 'Georgia, "Yu Mincho", "Hiragino Mincho ProN", "Noto Serif CJK JP", serif';
const SANS = '"Yu Gothic", "Hiragino Kaku Gothic ProN", system-ui, sans-serif';
const SAMPLE_LABEL = "大吉の見本 / 今日の結果ではありません";
const DISCLAIMER = "法的効力はありません。法律相談ではありません。";

function graphemes(text: string): string[] {
  if (typeof Intl.Segmenter === "function") {
    return Array.from(
      new Intl.Segmenter("ja", { granularity: "grapheme" }).segment(text),
      ({ segment }) => segment,
    );
  }
  return Array.from(text);
}

/** Wrap Japanese without splitting graphemes or leaving punctuation on its own. */
function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  const noLineStart = /^[、。，．！？!?：:；;）」』】〉》〕｝］ぁぃぅぇぉっゃゅょァィゥェォッャュョー]/u;
  const noLineEnd = /[（「『【〈《〔｛［]$/u;

  for (const paragraph of text.split(/\r?\n/u)) {
    let line = "";
    for (const character of graphemes(paragraph)) {
      if (!line || context.measureText(line + character).width <= maxWidth) {
        line += character;
        continue;
      }

      let carry = "";
      if (noLineStart.test(character) || noLineEnd.test(line)) {
        const units = graphemes(line);
        if (units.length > 1) {
          carry = units.pop() ?? "";
          line = units.join("");
        }
      }

      lines.push(line.trimEnd());
      line = carry + character;
    }
    lines.push(line.trimEnd());
  }

  return lines;
}

type TextBlock = {
  x: number;
  y: number;
  width: number;
  fontSize: number;
  minFontSize: number;
  lineHeight: number;
  maxLines: number;
  fontFamily?: string;
  color?: string;
  weight?: string;
};

function drawTextBlock(
  context: CanvasRenderingContext2D,
  text: string,
  options: TextBlock,
): void {
  const { x, y, width, minFontSize, maxLines, lineHeight } = options;
  let fontSize = options.fontSize;
  let lines: string[] = [];

  while (fontSize >= minFontSize) {
    context.font = `${options.weight ?? "400"} ${fontSize}px ${options.fontFamily ?? SERIF}`;
    lines = wrapText(context, text, width);
    if (lines.length <= maxLines) break;
    fontSize -= 1;
  }

  // Never silently crop a lucky item or a disclaimer from the saved result.
  if (lines.length > maxLines) {
    throw new Error("共有カードの文章が長すぎるため、画像を作成できませんでした。");
  }

  context.fillStyle = options.color ?? INK;
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  for (const [index, line] of lines.entries()) {
    context.fillText(line, x, y + index * lineHeight);
  }
}

function fitLine(
  context: CanvasRenderingContext2D,
  text: string,
  width: number,
  size: number,
  family = SERIF,
): void {
  let fontSize = size;
  context.font = `400 ${fontSize}px ${family}`;
  while (context.measureText(text).width > width && fontSize > 12) {
    fontSize -= 1;
    context.font = `400 ${fontSize}px ${family}`;
  }
}

function drawSeal(
  context: CanvasRenderingContext2D,
  result: FortuneResult,
): void {
  const color = result.isRare ? GOLD : VERMILION;
  context.save();
  context.translate(968, 327);
  context.rotate(-Math.PI / 26);
  context.strokeStyle = color;
  context.lineWidth = 3;
  context.strokeRect(-91, -91, 182, 182);
  context.lineWidth = 1;
  context.strokeRect(-83, -83, 166, 166);
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.font = `400 18px ${SANS}`;
  context.fillText(result.isRare ? "特別承認" : "本日の判定", 0, -53);

  if (result.isRare) {
    fitLine(context, "全部読んだことにする", 150, 17);
    context.fillText("全部読んだことにする", 0, -15);
    context.font = `400 65px ${SERIF}`;
    context.fillText("大吉", 0, 57);
  } else {
    fitLine(context, result.rank, 148, 71);
    context.fillText(result.rank, 0, 42);
  }
  context.restore();
}

function horizontalRule(context: CanvasRenderingContext2D, y: number): void {
  context.beginPath();
  context.strokeStyle = LINE;
  context.lineWidth = 1;
  context.moveTo(104, y);
  context.lineTo(1096, y);
  context.stroke();
}

/** Render a completely local, high-resolution PNG without external images/fonts. */
export async function createShareCard(
  result: FortuneResult,
  options: ShareCardOptions = {},
): Promise<Blob> {
  if (typeof document === "undefined") {
    throw new Error("画像の作成はブラウザーでご利用ください。");
  }
  if (document.fonts) await document.fonts.ready;

  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1200;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("このブラウザーでは画像を作成できません。");

  context.fillStyle = PAPER;
  context.fillRect(0, 0, 1200, 1200);
  context.strokeStyle = LINE;
  context.lineWidth = 1;
  context.strokeRect(42.5, 42.5, 1115, 1115);
  context.strokeRect(52.5, 52.5, 1095, 1095);

  // A restrained registration mark makes the card feel like printed stationery.
  context.save();
  context.translate(133, 131);
  context.rotate(-Math.PI / 40);
  context.strokeStyle = VERMILION;
  context.lineWidth = 2;
  context.strokeRect(-28, -28, 56, 56);
  context.fillStyle = VERMILION;
  context.font = `400 41px ${SERIF}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("規", 0, 2);
  context.restore();

  context.fillStyle = INK;
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.font = `400 40px ${SERIF}`;
  context.fillText("利用規約占い", 187, 137);
  context.fillStyle = MUTED;
  context.font = `400 15px ${SANS}`;
  context.fillText("DAILY TERMS, LITTLE FORTUNES.", 188, 168);
  context.textAlign = "right";
  context.font = `400 29px ${SERIF}`;
  context.fillText(result.date.replaceAll("-", "."), 1093, 132);
  context.font = `400 15px ${SANS}`;
  context.fillText(options.sample ? "SAMPLE / NOT TODAY" : "TODAY’S TERMS / JAPAN STANDARD TIME", 1093, 164);
  horizontalRule(context, 205);

  context.fillStyle = options.sample ? VERMILION : MUTED;
  context.textAlign = "left";
  context.font = `400 23px ${SANS}`;
  context.fillText(options.sample ? SAMPLE_LABEL : "あなたと、今日との約束。", 106, 263);

  drawTextBlock(context, `第${result.clause.article}条 第${result.clause.paragraph}項`, {
    x: 104,
    y: 347,
    width: 665,
    fontSize: 57,
    minFontSize: 36,
    lineHeight: 64,
    maxLines: 1,
  });
  drawTextBlock(context, result.clause.title, {
    x: 107,
    y: 393,
    width: 672,
    fontSize: 26,
    minFontSize: 19,
    lineHeight: 32,
    maxLines: 1,
    color: MUTED,
    fontFamily: SANS,
  });
  drawSeal(context, result);

  drawTextBlock(context, result.clause.text, {
    x: 105,
    y: 492,
    width: 990,
    fontSize: 47,
    minFontSize: 30,
    lineHeight: 72,
    maxLines: 3,
  });
  drawTextBlock(context, result.clause.interpretation, {
    x: 108,
    y: 716,
    width: 984,
    fontSize: 26,
    minFontSize: 21,
    lineHeight: 41,
    maxLines: 2,
    color: MUTED,
    fontFamily: SANS,
  });
  horizontalRule(context, 797);

  const details = [
    ["ラッキー条項", result.clause.luckyClause],
    ["ラッキーアイテム", result.clause.luckyItem],
    ["今日やってはいけないこと", result.clause.avoid],
  ] as const;

  details.forEach(([label, value], index) => {
    const y = 850 + index * 79;
    context.fillStyle = MUTED;
    context.font = `400 20px ${SANS}`;
    context.textAlign = "left";
    context.fillText(label, 108, y);
    drawTextBlock(context, value, {
      x: 386,
      y,
      width: 704,
      fontSize: 28,
      minFontSize: 21,
      lineHeight: 35,
      maxLines: 2,
      color: index === 2 ? VERMILION : INK,
    });
  });

  horizontalRule(context, 1081);
  context.fillStyle = MUTED;
  context.font = `400 18px ${SANS}`;
  context.textAlign = "left";
  context.fillText("心が少し軽くなる、架空の利用規約。", 108, 1120);
  context.textAlign = "right";
  context.font = `400 16px ${SANS}`;
  context.fillText(DISCLAIMER, 1093, 1120);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("画像を作成できませんでした。もう一度お試しください。"));
    }, "image/png");
  });
}

/**
 * The URL is included once for X, Web Share, or the clipboard. Lucky details
 * remain on the image, keeping the original clause and both disclaimers within
 * X's standard text limit for the complete v1 collection, including the sample.
 */
export function getShareText(
  result: FortuneResult,
  url: string,
  options: ShareCardOptions = {},
): string {
  const intro = options.sample
    ? `【${SAMPLE_LABEL}】`
    : `【${result.date}の利用規約占い】`;
  return [
    intro,
    `運勢：${result.rank}`,
    `第${result.clause.article}条第${result.clause.paragraph}項：${result.clause.text}`,
    "#利用規約占い",
    DISCLAIMER,
    url,
  ].join("\n");
}
