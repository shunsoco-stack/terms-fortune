/**
 * Rebuild the original, code-drawn identity assets. No network access is used.
 * Fonts are read from the local OS; no system font is copied into the project.
 * Optional: TERMS_FORTUNE_FONT can point to a locally licensed Japanese font.
 */
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = join(projectDirectory, "public");
const PAPER = "#f6f3ec";
const INK = "#24372f";
const MUTED = "#74796f";
const LINE = "#d8d8cb";
const VERMILION = "#b94d3e";

const fontCandidates = [
  process.env.TERMS_FORTUNE_FONT,
  "C:/Windows/Fonts/yumin.ttf",
  "/System/Library/Fonts/ヒラギノ明朝 ProN.ttc",
  "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc",
  "/usr/share/fonts/noto-cjk/NotoSerifCJK-Regular.ttc",
].filter(Boolean);
const japaneseFont = fontCandidates.find((path) => existsSync(path));
if (!japaneseFont || !GlobalFonts.registerFromPath(japaneseFont, "Terms Mincho")) {
  throw new Error(
    "A local Japanese font is required. Set TERMS_FORTUNE_FONT to a licensed Mincho/serif font path.",
  );
}

const SERIF = '"Terms Mincho", Georgia, serif';
const SANS = '"Yu Gothic", "Hiragino Kaku Gothic ProN", sans-serif';

function trackedText(context, text, x, y, spacing = 1) {
  let cursor = x;
  for (const character of Array.from(text)) {
    context.fillText(character, cursor, y);
    cursor += context.measureText(character).width + spacing;
  }
}

function rule(context, x, y, width, color = LINE) {
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(x + width, y);
  context.stroke();
}

function seal(context, x, y, size, compact = false) {
  context.save();
  context.translate(x, y);
  context.rotate(-Math.PI / 42);
  context.strokeStyle = VERMILION;
  context.fillStyle = VERMILION;
  context.lineWidth = size * (compact ? 0.065 : 0.038);
  context.beginPath();
  context.roundRect(-size / 2, -size / 2, size, size, size * 0.045);
  context.stroke();
  if (!compact) {
    context.lineWidth = size * 0.012;
    context.strokeRect(-size * 0.447, -size * 0.447, size * 0.894, size * 0.894);
  }
  context.font = `400 ${size * 0.75}px ${SERIF}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("規", 0, size * 0.042);
  context.restore();
}

function icon(size, compact = false) {
  const canvas = createCanvas(size, size);
  const context = canvas.getContext("2d");
  context.fillStyle = PAPER;
  context.fillRect(0, 0, size, size);
  // A 52%-width rotated seal fits inside the central 80% maskable safe circle.
  seal(context, size / 2, size / 2, size * (compact ? 0.72 : 0.52), compact);
  return canvas.encodeSync("png");
}

function createIco(images) {
  // ICO supports lossless PNG entries, including modern 256px app favicons.
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16;
    header[entry] = size === 256 ? 0 : size;
    header[entry + 1] = size === 256 ? 0 : size;
    header[entry + 2] = 0;
    header[entry + 3] = 0;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(({ png }) => png)]);
}

function documentIllustration(context) {
  context.save();
  context.translate(972, 353);
  context.rotate(Math.PI / 24);

  context.shadowColor = "rgba(36,55,47,0.09)";
  context.shadowBlur = 24;
  context.shadowOffsetY = 12;
  context.fillStyle = "#fcfaf5";
  context.fillRect(-120, -163, 240, 326);
  context.shadowBlur = 0;
  context.shadowOffsetY = 0;
  context.strokeStyle = LINE;
  context.lineWidth = 1;
  context.strokeRect(-120, -163, 240, 326);
  context.strokeRect(-109, -152, 218, 304);

  context.fillStyle = MUTED;
  context.font = `400 17px ${SERIF}`;
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillText("今日の利用規約", -88, -107);
  rule(context, -87, -88, 174);
  context.fillStyle = INK;
  context.font = `400 33px ${SERIF}`;
  context.fillText("第 12 条", -88, -32);
  rule(context, -87, -3, 174);
  rule(context, -87, 16, 174);
  rule(context, -87, 35, 133);
  rule(context, -87, 54, 153);
  context.fillStyle = MUTED;
  context.font = `400 12px ${SANS}`;
  context.fillText("本日の運勢", -87, 113);

  context.save();
  context.translate(55, 96);
  context.rotate(-Math.PI / 12);
  context.strokeStyle = VERMILION;
  context.lineWidth = 2;
  context.strokeRect(-39, -39, 78, 78);
  context.lineWidth = 0.7;
  context.strokeRect(-34, -34, 68, 68);
  context.fillStyle = VERMILION;
  context.font = `400 29px ${SERIF}`;
  context.textAlign = "center";
  context.fillText("大吉", 0, 11);
  context.restore();
  context.restore();

  // A small, hand-drawn sun is the fortune half of the paper-and-seal identity.
  context.save();
  context.translate(813, 236);
  context.strokeStyle = VERMILION;
  context.lineWidth = 1.4;
  context.beginPath();
  context.arc(0, 0, 8, 0, Math.PI * 2);
  context.stroke();
  for (let ray = 0; ray < 8; ray += 1) {
    const angle = ray * Math.PI / 4;
    context.beginPath();
    context.moveTo(Math.cos(angle) * 14, Math.sin(angle) * 14);
    context.lineTo(Math.cos(angle) * 21, Math.sin(angle) * 21);
    context.stroke();
  }
  context.restore();
}

function openGraph() {
  const canvas = createCanvas(1200, 630);
  const context = canvas.getContext("2d");
  context.fillStyle = PAPER;
  context.fillRect(0, 0, 1200, 630);
  context.strokeStyle = LINE;
  context.lineWidth = 1;
  context.strokeRect(30.5, 30.5, 1139, 569);
  context.strokeRect(37.5, 37.5, 1125, 555);

  seal(context, 110, 105, 57);
  context.textBaseline = "alphabetic";
  context.textAlign = "left";
  context.fillStyle = INK;
  context.font = `400 31px ${SERIF}`;
  trackedText(context, "利用規約占い", 161, 108, 2);
  context.fillStyle = MUTED;
  context.font = `400 11px ${SANS}`;
  trackedText(context, "DAILY TERMS, LITTLE FORTUNES.", 163, 132, 1.25);
  context.textAlign = "right";
  context.font = "400 14px Georgia, serif";
  context.fillText("FORTUNE, IN FINE PRINT.", 1118, 108);
  rule(context, 80, 165, 1040);

  context.fillStyle = MUTED;
  context.textAlign = "left";
  context.font = `400 17px ${SERIF}`;
  trackedText(context, "あなたと、今日との約束。", 84, 217, 2);
  context.fillStyle = INK;
  context.font = `400 65px ${SERIF}`;
  trackedText(context, "今日の運勢は、", 80, 308, 0.5);
  trackedText(context, "規約に書いてある。", 80, 397, 0.5);
  context.fillStyle = MUTED;
  context.font = `400 22px ${SERIF}`;
  context.fillText("読まないはずの利用規約で、今日をちょっといい日に。", 84, 455);

  documentIllustration(context);
  rule(context, 80, 538, 1040);
  context.textAlign = "left";
  context.fillStyle = INK;
  context.font = `400 18px ${SERIF}`;
  trackedText(context, "毎日ひとつ。架空の条文、小さな運勢。", 84, 575, 0.4);
  context.textAlign = "right";
  context.fillStyle = MUTED;
  context.font = `400 14px ${SANS}`;
  context.fillText("法的効力はありません。法律相談ではありません。", 1117, 575);
  return canvas.encodeSync("png");
}

mkdirSync(outputDirectory, { recursive: true });
const outputs = new Map([
  ["icon-192.png", icon(192)],
  ["icon-512.png", icon(512)],
  ["apple-touch-icon.png", icon(180)],
  ["favicon.ico", createIco([16, 32, 48, 256].map((size) => ({ size, png: icon(size, size < 64) })))],
  ["og.png", openGraph()],
]);

for (const [name, buffer] of outputs) {
  // Only this fixed allowlist is written, always directly inside this project's public/.
  const destination = join(outputDirectory, name);
  if (dirname(destination) !== outputDirectory) throw new Error("Invalid asset destination.");
  writeFileSync(destination, buffer);
  console.log(`Created public/${name} (${buffer.length.toLocaleString("en-US")} bytes)`);
}
