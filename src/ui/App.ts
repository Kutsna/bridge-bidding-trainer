/* =========================================================
   IMPORTS
========================================================= */

import * as tf from "@tensorflow/tfjs";

import { computeHandFacts } from "../engine/hand/handFacts.ts";
import { recommendBid } from "../engine/recommendBid.ts";
import { derivePosition } from "../engine/auction/derivePosition.ts";

import { saycOpeningRules } from "../engine/rules/sayc/opening.ts";
import { sayc1NTResponseRules } from "../engine/rules/sayc/ntResponses.ts";
import { saycStaymanReplyRules } from "../engine/rules/sayc/staymanReplies.ts";
import { saycJacobyReplyRules } from "../engine/rules/sayc/jacobyReplies.ts";
import { saycStaymanContinuationRules } from "../engine/rules/sayc/staymanContinuations.ts";

/* ML (used in Phase 3) */
import { recognizeCard } from "../ml/recognizeCard";
import { loadRankModel } from "../ml/rankModel";
import { loadSuitModel } from "../ml/suitModel";

/* =========================================================
   OPENCV LOADER (FOR LATER)
========================================================= */

let cvReady = false;

const opencvScript = document.createElement("script");
opencvScript.src = "https://docs.opencv.org/4.x/opencv.js";
opencvScript.async = true;
opencvScript.onload = () => {
  cvReady = true;
  console.log("OpenCV loaded");
};
document.head.appendChild(opencvScript);

/* =========================================================
   CONSTANTS & TYPES
========================================================= */

const ALL_RANKS = "AKQJT98765432".split("");
const RANK_ORDER: Record<string, number> = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  T: 10,
  9: 9,
  8: 8,
  7: 7,
  6: 6,
  5: 5,
  4: 4,
  3: 3,
  2: 2,
};
const ALL_SUITS = ["S", "H", "D", "C"] as const;
const CARD_COUNT = 13;

const FONT_SCALE = window.innerWidth < 768 ? 4 : 2;

const SUIT_SYMBOLS = {
  S: { symbol: "♠", color: "black" },
  H: { symbol: "♥", color: "red" },
  D: { symbol: "♦", color: "red" },
  C: { symbol: "♣", color: "black" },
};

async function initModels() {
  await tf.ready();
  await loadRankModel();
  await loadSuitModel();
  console.log("Rank and Suit models loaded");
}

initModels();

const BASE_SEATS = ["W", "N", "E", "S"] as const;
type Seat = (typeof BASE_SEATS)[number];

const BID_OPTIONS = [
  "P",
  "X",
  "XX",
  "1C",
  "1D",
  "1H",
  "1S",
  "1NT",
  "2C",
  "2D",
  "2H",
  "2S",
  "2NT",
  "3C",
  "3D",
  "3H",
  "3S",
  "3NT",
  "4C",
  "4D",
  "4H",
  "4S",
  "4NT",
  "5C",
  "5D",
  "5H",
  "5S",
  "5NT",
  "6C",
  "6D",
  "6H",
  "6S",
  "6NT",
  "7C",
  "7D",
  "7H",
  "7S",
  "7NT",
];

/* =========================================================
   ARC FAN GUIDE — FINAL, CORRECT
========================================================= */

const ARC_FAN_GUIDE = (() => {
  const guides: {
    x: number;
    y: number;
    rotation: number;
    w: number;
    h: number;
  }[] = [];

  const CARD_W = 0.09;
  const CARD_H = 0.22;

  const centerX = 0.5;
  const centerY = 0.9;
  const radius = 0.45;

  const arcDeg = 120;
  const startDeg = -90 - arcDeg / 2;
  const stepDeg = arcDeg / 12;

  for (let i = 0; i < 13; i++) {
    const a = ((startDeg + i * stepDeg) * Math.PI) / 180;

    guides.push({
      x: centerX + radius * Math.cos(a),
      y: centerY + radius * Math.sin(a),
      rotation: a + Math.PI / 2,
      w: CARD_W,
      h: CARD_H,
    });
  }

  return guides;
})();

type CornerBox = { x: number; y: number; w: number; h: number };

/* =========================================================
   STATE
========================================================= */

//let selectedHand: { rank: string; suit: string }[] = [];
let auction: string[] = [];

let selectedLevel: string | null = null;

let dealer: Seat = "S";
let vulnerability: "NONE" | "NS" | "EW" | "BOTH" = "NONE";

let cameraStream: MediaStream | null = null;
let cameraVisible = false;

type HandItem = { rank: string; suit: string } | { image: HTMLCanvasElement };

let selectedHand: HandItem[] = [];

/* =========================================================
   CAMERA
========================================================= */

async function openCamera() {
  if (cameraStream) return;

  try {
    // 1️⃣ Try environment camera first (phones)
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
    } catch {
      // 2️⃣ Fallback for PCs
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });
    }

    cameraVisible = true;
    renderCameraArea();

    const video = document.getElementById("camera") as HTMLVideoElement | null;
    if (!video) {
      alert("Camera element not found");
      return;
    }

    video.srcObject = cameraStream;

    video.onloadedmetadata = async () => {
      video.play();

      // 🔦 Torch only if supported
      const track = cameraStream!.getVideoTracks()[0] as any;

      if (track && track.getCapabilities) {
        const caps = track.getCapabilities();
        if (caps.torch) {
          try {
            await track.applyConstraints({
              advanced: [{ torch: true }],
            });
            console.log("Torch enabled");
          } catch {
            console.log("Torch not supported");
          }
        }
      }

      // 🟢 Draw guide overlay
      const guide = document.getElementById("guide") as HTMLCanvasElement;
      if (!guide) return;

      guide.width = video.videoWidth;
      guide.height = video.videoHeight;

      const ctx = guide.getContext("2d")!;
      ctx.clearRect(0, 0, guide.width, guide.height);

      ctx.strokeStyle = "lime";
      ctx.lineWidth = 6;
      ctx.strokeRect(
        guide.width * 0.05,
        guide.height * 0.05,
        guide.width * 0.9,
        guide.height * 0.9,
      );

      ctx.fillStyle = "white";
      ctx.font = "bold 28px Arial";
      ctx.textAlign = "center";

      ctx.fillText(
        "Fill the frame completely",
        guide.width / 2,
        guide.height * 0.08,
      );

      ctx.fillText(
        "Tilt cards to avoid flash reflection",
        guide.width / 2,
        guide.height * 0.14,
      );
    };
  } catch (err) {
    console.error(err);
    alert("Camera not available.");
  }
}

/* =========================================================
   DRAW ARC FAN GUIDES — FIXED
========================================================= */

function drawArcFanGuides(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "lime";
  ctx.lineWidth = 3;

  ARC_FAN_GUIDE.forEach((g) => {
    const cx = g.x * w;
    const cy = g.y * h;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(g.rotation);

    // visible tilted green corner box
    ctx.strokeRect(-22, -34, 44, 68);

    ctx.restore();
  });
}

function closeCamera() {
  cameraVisible = false;
  renderCameraArea();
  renderUI();
}

async function captureCards() {
  if (!cameraStream) {
    alert("Camera not running");
    return;
  }

  const video = document.getElementById("camera") as HTMLVideoElement | null;
  if (!video) {
    alert("Video element not found");
    return;
  }

  if (!video.videoWidth || !video.videoHeight) {
    alert("Video not ready yet");
    return;
  }

  // Create / reuse snapshot canvas
  let canvas = document.getElementById("snapshot") as HTMLCanvasElement | null;

  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "snapshot";
    canvas.style.width = "100%";
    canvas.style.maxWidth = "500px";
    canvas.style.border = "3px solid red";
    canvas.style.marginTop = "6px";

    const wrapper = document.getElementById("cameraWrapper");
    if (wrapper) wrapper.appendChild(canvas);
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    alert("Canvas context error");
    return;
  }

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // Convert to blob safely
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas!.toBlob((b) => resolve(b), "image/jpeg", 0.95)
  );

  if (!blob) {
    alert("Failed to create image blob");
    return;
  }

  const formData = new FormData();
  formData.append("image", blob);

  try {
    const response = await fetch("/analyze-cards", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Server ${response.status}: ${text}`);
    }

    const parsed = await response.json();

    if (!parsed || !Array.isArray(parsed.cards)) {
      throw new Error("Invalid JSON structure from server");
    }

    selectedHand = parsed.cards.map((c: string) => ({
      rank: c[0],
      suit: c[1],
    }));

    renderUI();

  } catch (err: any) {
    console.error("FULL API ERROR:", err);
    alert("API call failed: " + err.message);
  }

  // Turn off torch safely
  try {
    const track = cameraStream?.getVideoTracks()?.[0] as any;
    if (track?.getCapabilities?.().torch) {
      await track.applyConstraints({ advanced: [{ torch: false }] });
    }
  } catch {}

  // Stop camera safely
  try {
    cameraStream?.getTracks().forEach((t) => t.stop());
  } catch {}

  cameraStream = null;
  cameraVisible = false;
  renderCameraArea();
}


function drawFanCornerGuides(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  ctx.save();

  const W = canvas.width;
  const H = canvas.height;

  // 🔥 TRUE FAN GEOMETRY (matches real hand hold)
  const pivotX = W * 0.52; // thumb position
  const pivotY = H * 0.78;

  const radius = W * 0.38; // INNER arc (card corners, not edges)

  const CARD_COUNT = 13;
  const ARC_DEG = 120;
  const START_DEG = -150; // leftmost card
  const STEP = ARC_DEG / (CARD_COUNT - 1);

  const boxW = W * 0.055;
  const boxH = boxW;

  ctx.strokeStyle = "lime";
  ctx.lineWidth = 3;

  for (let i = 0; i < CARD_COUNT; i++) {
    const deg = START_DEG + i * STEP;
    const rad = (deg * Math.PI) / 180;

    // position of upper-left corner
    const x = pivotX + Math.cos(rad) * radius;
    const y = pivotY + Math.sin(rad) * radius;

    ctx.save();
    ctx.translate(x, y);

    // 🔥 rotate box to follow card tilt
    ctx.rotate(rad + Math.PI / 2);

    // 🔥 shift box to upper-left of card
    ctx.strokeRect(-boxW * 0.15, -boxH * 0.85, boxW, boxH);

    ctx.restore();
  }

  ctx.restore();
}

function captureFrame() {
  const video = document.getElementById("camera") as HTMLVideoElement;
  const canvas = document.getElementById("snapshot") as HTMLCanvasElement;

  if (!cameraStream) {
    alert("Camera not running");
    return;
  }

  const w = video.videoWidth;
  const h = video.videoHeight;

  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0); // reset scale

  // 1️⃣ draw snapshot
  ctx.drawImage(video, 0, 0, w, h);

  canvas.style.display = "block";
  video.pause();

  // 🔴 4️⃣ FORCE DRAW TEXT (NO ML, NO HELPERS)
  ctx.font = "bold 28px Arial";
  ctx.textBaseline = "top";

  boxes.forEach((b, i) => {
    // white background
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillRect(b.x + 4, b.y + 4, 44, 32);

    // black text
    ctx.fillStyle = "black";
  });

  console.log("FORCED DRAW DONE, boxes =", boxes.length);
}

/* =========================================================
   PHASE 2 — CORNER DETECTION (HEURISTIC)
========================================================= */

function detectSuit(canvas: HTMLCanvasElement): "S" | "H" | "D" | "C" | null {
  const ctx = canvas.getContext("2d")!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  let red = 0;
  let black = 0;

  for (let i = 0; i < img.length; i += 4) {
    const r = img[i];
    const g = img[i + 1];
    const b = img[i + 2];

    // strong red
    if (r > 150 && g < 120 && b < 120) red++;

    // strong black
    if (r < 80 && g < 80 && b < 80) black++;
  }

  if (red > black * 1.3) {
    // distinguish ♥ vs ♦ by vertical mass
    return canvas.height > canvas.width ? "D" : "H";
  }

  if (black > red * 1.3) {
    // distinguish ♠ vs ♣ by vertical mass
    return canvas.height > canvas.width ? "S" : "C";
  }

  return null;
}

const rankTemplates: Record<string, HTMLImageElement> = {};

let rankTemplatesReady = false;

function loadRankTemplates() {
  let loaded = 0;

  ALL_RANKS.forEach((r) => {
    const img = new Image();
    img.onload = () => {
      loaded++;
      if (loaded === ALL_RANKS.length) {
        rankTemplatesReady = true;
        console.log("Rank templates ready");
      }
    };
    img.src = `/assets/ranks/${r}.png`;
    rankTemplates[r] = img;
  });
}

function detectRank(canvas: HTMLCanvasElement): string | null {
  if (!rankTemplatesReady) return null;

  binarize(canvas);

  const ctx = canvas.getContext("2d")!;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  let bestRank: string | null = null;
  let bestScore = Infinity;

  for (const r of ALL_RANKS) {
    const tmpl = rankTemplates[r];
    if (!tmpl.complete) continue;

    const tCanvas = document.createElement("canvas");
    tCanvas.width = canvas.width;
    tCanvas.height = canvas.height;

    const tCtx = tCanvas.getContext("2d")!;
    tCtx.drawImage(tmpl, 0, 0, tCanvas.width, tCanvas.height);
    binarize(tCanvas);

    const tData = tCtx.getImageData(0, 0, tCanvas.width, tCanvas.height).data;

    let diff = 0;
    for (let i = 0; i < data.length; i += 4) {
      diff += Math.abs(data[i] - tData[i]);
    }

    if (diff < bestScore) {
      bestScore = diff;
      bestRank = r;
    }
  }

  // 🔥 CRITICAL FILTER — WITHOUT THIS YOU GET TTTTT
  const MAX_DIFF = canvas.width * canvas.height * 30;

  if (bestScore > MAX_DIFF) {
    return null;
  }

  return bestRank;
}

function recognizeCardsFromCanvas(canvas: HTMLCanvasElement) {
  selectedHand = [];

  for (const c of corners) {
    const crop = document.createElement("canvas");
    crop.width = Math.floor(c.width * 0.55);
    crop.height = Math.floor(c.height * 0.55);

    crop
      .getContext("2d")!
      .drawImage(
        c,
        0,
        0,
        crop.width,
        crop.height,
        0,
        0,
        crop.width,
        crop.height,
      );

    // 🔥 CONVERT TO IMAGE
    const dataUrl = crop.toDataURL("image/png");

    selectedHand.push({ image: dataUrl });
  }

  renderUI();
}

function guessRankByInk(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext("2d")!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  let ink = 0;
  for (let i = 0; i < img.length; i += 4) {
    if (img[i] < 120) ink++;
  }

  if (ink > 1800) return "A";
  if (ink > 1400) return "K";
  if (ink > 1100) return "Q";
  if (ink > 900) return "J";
  if (ink > 700) return "T";
  if (ink > 500) return "9";
  if (ink > 400) return "8";
  if (ink > 320) return "7";
  if (ink > 260) return "6";
  if (ink > 200) return "5";
  if (ink > 160) return "4";
  if (ink > 120) return "3";
  return "2";
}

function drawCardLabels(
  canvas: HTMLCanvasElement,
  boxes: CornerBox[],
  preds: {
    rank: string;
    suit: "S" | "H" | "D" | "C";
    ok: boolean;
  }[],
) {
  const ctx = canvas.getContext("2d")!;
  ctx.font = "bold 22px Arial";
  ctx.textBaseline = "top";

  preds.forEach((p, i) => {
    const b = boxes[i];
    if (!b) return;

    const suitSymbol =
      p.suit === "S"
        ? "♠"
        : p.suit === "H"
          ? "♥"
          : p.suit === "D"
            ? "♦"
            : "♣";

    const color = p.suit === "H" || p.suit === "D" ? "red" : "black";

    // background
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillRect(b.x + 4, b.y + 4, b.w - 8, 28);

    // text
    ctx.fillStyle = p.ok ? color : "gray";
    ctx.fillText(p.ok ? `${p.rank}${suitSymbol}` : "?", b.x + 8, b.y + 6);
  });
}

/* =========================================================
   HELPERS
========================================================= */

function orderedSeatsFromDealer(): Seat[] {
  const i = BASE_SEATS.indexOf(dealer);
  return [
    BASE_SEATS[i],
    BASE_SEATS[(i + 1) % 4],
    BASE_SEATS[(i + 2) % 4],
    BASE_SEATS[(i + 3) % 4],
  ];
}

function currentTurn(): Seat {
  return orderedSeatsFromDealer()[auction.length % 4];
}

function auctionEnded() {
  return auction.length >= 4 && auction.slice(-3).every((b) => b === "P");
}

function binarize(canvas: HTMLCanvasElement, threshold = 140) {
  const ctx = canvas.getContext("2d")!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < img.data.length; i += 4) {
    const v = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
    const b = v < threshold ? 0 : 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = b;
  }

  ctx.putImageData(img, 0, 0);
}

function renderCornerPreview(corners: HTMLCanvasElement[]) {
  const container = document.getElementById("cornerPreview");
  if (!container) return;

  container.innerHTML = "";

  corners.forEach((c, i) => {
    const wrap = document.createElement("div");
    wrap.style.border = "1px solid #ccc";
    wrap.style.padding = "4px";

    c.style.width = "48px";
    wrap.appendChild(c);

    container.appendChild(wrap);
  });
}

function sortHandHighToLow(hand: { rank: string; suit: string }[]) {
  return hand.sort((a, b) => {
    // First sort by suit order S, H, D, C
    const suitOrder = { S: 0, H: 1, D: 2, C: 3 };
    if (suitOrder[a.suit] !== suitOrder[b.suit]) {
      return suitOrder[a.suit] - suitOrder[b.suit];
    }

    // Then sort rank high → low
    return RANK_ORDER[b.rank] - RANK_ORDER[a.rank];
  });
}

function detectCardCornersOpenCV(canvas: HTMLCanvasElement) {
  if (!cvReady || !(window as any).cv) {
    console.warn("OpenCV not ready");
    return [];
  }

  const cv = (window as any).cv;

  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  const thresh = new cv.Mat();

  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  // 🔥 threshold for bright (white card area)
  cv.threshold(gray, thresh, 200, 255, cv.THRESH_BINARY);

  // remove small noise
  const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
  cv.morphologyEx(thresh, thresh, cv.MORPH_OPEN, kernel);

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  cv.findContours(
    thresh,
    contours,
    hierarchy,
    cv.RETR_EXTERNAL,
    cv.CHAIN_APPROX_SIMPLE,
  );

  const results: { x: number; y: number; w: number; h: number }[] = [];

  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const rect = cv.boundingRect(cnt);

    // filter small blobs
    if (rect.width < 20 || rect.height < 20) continue;

    // must be near square
    const ratio = rect.width / rect.height;
    if (ratio < 0.7 || ratio > 1.3) continue;

    // upper half only (where corners exist)
    if (rect.y > canvas.height * 0.75) continue;

    results.push({
      x: rect.x,
      y: rect.y,
      w: rect.width,
      h: rect.height,
    });
  }

  results.sort((a, b) => a.x - b.x);

  src.delete();
  gray.delete();
  thresh.delete();
  contours.delete();
  hierarchy.delete();
  kernel.delete();

  console.log("Bright square candidates:", results.length);

  return results;
}

/* =========================================================
   MANUAL CARD SELECTION
========================================================= */

function toggleCard(card) {
  const i = selectedHand.findIndex(
    (c) => c.rank === card.rank && c.suit === card.suit,
  );
  if (i >= 0) selectedHand.splice(i, 1);
  else if (selectedHand.length < 13) selectedHand.push(card);
  renderUI();
}

/* =========================================================
   RENDERING
========================================================= */

function renderHand(hand: any[]) {
  // IMAGE DEBUG MODE
  if (hand.length && hand[0].image) {
    return `
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${hand
          .map(
            (c) => `
              <div style="border:1px solid #ccc;padding:4px;">
                <img src="${c.image}"
                     style="font-size:60px;font-weight:bold;color:${SUIT_SYMBOLS[s].color}" />
              </div>
            `,
          )
          .join("")}
      </div>
    `;
  }

  // NORMAL MODE (unchanged)
  const bySuit = {
    S: hand.filter((c) => c.suit === "S"),
    H: hand.filter((c) => c.suit === "H"),
    D: hand.filter((c) => c.suit === "D"),
    C: hand.filter((c) => c.suit === "C"),
  };

  const hcp = hand.reduce((sum, c) => {
    if (c.rank === "A") return sum + 4;
    if (c.rank === "K") return sum + 3;
    if (c.rank === "Q") return sum + 2;
    if (c.rank === "J") return sum + 1;
    return sum;
  }, 0);

  // ✅ Card count only shown if not 13
  const countLine =
    hand.length < 13 ? `<div><b>Cards:</b> ${hand.length}/13</div>` : "";

  return `
    ${(["S", "H", "D", "C"] as const)
      .map(
        (s) =>
          `<div style="font-size:55px;font-weight:bold;color:${SUIT_SYMBOLS[s].color}">
            <span style="
  text-shadow:
    -1px -1px 0 grey,
           1px -1px 0 grey,
          -1px  1px 0 grey,
           1px  1px 0 grey;
">
  ${SUIT_SYMBOLS[s].symbol}
</span>
${
  bySuit[s].length
    ? bySuit[s]
        .map(
          (c) => `
      <span style="
        margin-right:1px;
        text-shadow:
          -1px -1px 0 grey,
           1px -1px 0 grey,
          -1px  1px 0 grey,
           1px  1px 0 grey;
      ">
        ${c.rank}
      </span>
    `,
        )
        .join("")
    : "-"
}
          </div>`,
      )
      .join("")}
    <div class="handStats"><b>HCP:</b> ${hcp}</div>
<div class="handStats">
  ${hand.length < 13 ? `<b>Cards:</b> ${hand.length}/13` : ""}
</div>
  `;
}

function renderDeck() {
  return (["S", "H", "D", "C"] as const)
    .map(
      (suit) =>
        `<div>
      <b style="color:${SUIT_SYMBOLS[suit].color}">${SUIT_SYMBOLS[suit].symbol}</b>
      ${ALL_RANKS.map(
        (rank) =>
          `<span onclick="toggleCard({rank:'${rank}',suit:'${suit}'})"
  style="
    display:inline-flex;
    align-items:center;
    justify-content:center;
    width:56px;
    height:56px;
    margin:4px;
    font-size:30px;
    border-radius:8px;
    border:${selectedHand.some((c) => c.rank === rank && c.suit === suit) ? "6px solid red" : "3px solid #ccc"};
    cursor:pointer;
    font-weight:bold;
    background:#f8f8f8;
    color:${SUIT_SYMBOLS[suit].color};
  ">
  ${rank}
</span>`,
      ).join("")}
    </div>`,
    )
    .join("");
}

function renderAuctionTable() {
  const seats = orderedSeatsFromDealer();
  let rows = "";

  for (let i = 0; i < auction.length; i += 4) {
    rows += "<tr>";
    for (let j = 0; j < 4; j++) rows += `<td>${auction[i + j] || ""}</td>`;
    rows += "</tr>";
  }

  return `
    <table border="1">
      <tr>${seats
        .map(
          (s) => `<th style="
  ${s === dealer ? "background:#ffe0b2;" : ""}
  ${isVulnerableSeat(s) ? "color:red;font-weight:bold;" : ""}
">
  ${s}${s === dealer ? " (D)" : ""}
</th>`,
        )
        .join("")}</tr>
      ${rows}
    </table>
    <div>${auctionEnded() ? "Auction Ended" : `${currentTurn()} to bid: `}</div>
  `;
}

function renderBidButtons() {
  const levels = ["1", "2", "3", "4", "5", "6", "7"];
  const suits = ["C", "D", "H", "S", "NT"];

  const suitSymbols: Record<string, string> = {
    C: "♣",
    D: "♦",
    H: "♥",
    S: "♠",
    NT: "NT",
  };

  const suitColors: Record<string, string> = {
    C: "black",
    D: "red",
    H: "red",
    S: "black",
    NT: "black",
  };

  return `
    <!-- P / X / XX -->
<div style="margin-bottom:12px;">
  ${["P", "X", "XX"]
    .map(
      (b) => `
    <button 
      onclick="addBid('${b}')"
      style="
        width:clamp(20px, 10vw, 80px);
        height:clamp(20px, 10vw, 80px);
        font-size:clamp(1rem, 3vw, 1.6rem);
        font-weight:bold;
        margin:4px;
      ">
      ${b}
    </button>
  `,
    )
    .join("")}
</div>

<!-- Levels -->
<div style="margin-bottom:10px;">
  ${levels
    .map(
      (l) => `
    <button 
  onclick="selectLevel('${l}')"
  style="
    width: clamp(20px, 12vw, 85px);
    height: clamp(20px, 12vw, 85px);
    font-size: clamp(0.8rem, 3vw, 2rem);
    font-weight:bold;
    margin:4px;
    background:${selectedLevel === l ? "#d0ffd0" : "#eee"};
  ">
  ${l}
</button>
  `,
    )
    .join("")}
</div>

<!-- Suits -->
<div>
  ${suits
    .map(
      (s) => `
    <button 
      onclick="selectSuit('${s}')"
      style="
        width:clamp(30px, 10vw, 80px);
        height:clamp(30px, 10vw, 80px);
        font-size:clamp(1rem, 2.5vw, 1.8rem);
        font-weight:bold;
        margin:4px;
        color:${suitColors[s]};
      ">
      ${suitSymbols[s]}
    </button>
  `,
    )
    .join("")}
</div>
  `;
}

function isVulnerableSeat(seat: Seat) {
  if (vulnerability === "NONE") return false;
  if (vulnerability === "BOTH") return true;
  if (vulnerability === "NS") return seat === "N" || seat === "S";
  if (vulnerability === "EW") return seat === "E" || seat === "W";
  return false;
}

/* =========================================================
   AUCTION + RECOMMENDATION
========================================================= */

function addBid(bid: string) {
  if (!auctionEnded()) {
    auction.push(bid);
    renderUI();
  }
}

function selectLevel(level: string) {
  selectedLevel = level;
  renderUI();
}

function selectSuit(suit: string) {
  if (!selectedLevel) {
    alert("Select level first");
    return;
  }

  const bid = selectedLevel + suit;
  selectedLevel = null;

  addBid(bid);
}

function undoBid() {
  auction.pop();
  renderUI();
}

function resetHand() {
  selectedHand = [];
  renderUI();
}

function resetAuction() {
  auction = [];
  renderUI();
}

const rules = [
  ...saycOpeningRules,
  ...sayc1NTResponseRules,
  ...saycStaymanReplyRules,
  ...saycJacobyReplyRules,
  ...saycStaymanContinuationRules,
];

function recommend() {
  if (selectedHand.length !== 13) {
    alert("Select exactly 13 cards.");
    return;
  }

  const auctionState = {
    auction, // ← EMPTY array = opening
    position: derivePosition(auction), // ← let engine decide

    dealer,
    vulnerability,

    forcing: false,
    system: "SAYC",
    strategy: "THOROUGH",
    competition: "none",
  };

  const facts = computeHandFacts(selectedHand);
  const rec = recommendBid(rules, facts, auctionState);

  document.getElementById("output")!.innerHTML = rec
    ? `
        <div style="font-size:120px;color:yellow;font-weight:bold;">
  ${rec.bid}
        </div>
        <div style="font-size:40px;line-height:1;">
          ${rec.explanation}
        </div>
     </div>`
    : `<div>No SAYC rule matched.</div>`;
  `<b>No SAYC rule matched.</b>
       <br/>Opening=${isOpening}
       <br/>HCP=${facts.hcp}`;
}

/* =========================================================
   UI + EXPORTS
========================================================= */
document.body.style.background =
  "radial-gradient(circle at center, #1f7a3a 0%, #0b5d2a 60%, #083d1f 100%)";
document.body.style.minHeight = "100vh";
document.body.style.margin = "0";
document.body.style.color = "white";

document.body.innerHTML = `
<!-- Table -->
<style>
  /* PC */
  #auctionTable table {
    font-size: 200%;
  }

  /* Phone */
  @media (max-width: 768px) {
    #auctionTable table {
      font-size: 700%;
    }
  }
</style>


<!-- Header  -->
<style> 
  h2 {
    font-size: 300%;
  }

  /* Phones */
  @media (max-width: 768px) {
    h2 {
      font-size: 400%;
    }
  }
</style>

<style>
  .handStats {
    font-size: 200%;
  }
</style>


<style>
  h3 {
    font-size: 200%;
  }

  /* Phones */
  @media (max-width: 768px) {
    h3 {
      font-size: 500%;
    }
  }
</style>


<!-- DropDowns -->
<style>
  /* PC */
  select {
    font-size: 200%;
  }

  /* Phone */
  @media (max-width: 768px) {
    select {
      font-size: 700%;
    }
  }
</style>


<!-- Auction -->
<style>
  button {
    font-size: 200%;
  }

  /* Phones */
  @media (max-width: 1080px) {
    button {
      font-size: 300%;
    }
  }
</style>


<style>
  /* PC */
  #bidButtons button {
    font-size: 150%;
    padding: 12px 10px;
  }

  /* Phone */
  @media (max-width: 1080px) {
    #bidButtons button {
      font-size: 300%;
      padding: 20px 30px;
    }
  }
</style>

<h2>Bridge Bidding Trainer (SAYC)</h2>

<!-- CAMERA -->
<div id="cameraArea" style="margin-bottom:12px;"></div>

<div id="cornerPreview"
     style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
</div>

<!-- ================= ROW 1 ================= -->
<div style="margin-bottom:24px;">
  <h2 style="margin-bottom:12px;">Select / Correct Your Hand</h2>
  <div id="deck"></div>
</div>

<!-- ================= ROW 2 ================= -->
<div style="display:flex;gap:40px;flex-wrap:wrap;margin-bottom:32px;">

  <!-- Your Hand -->
  <div style="flex:1;min-width:300px;">
    <h2>Your Hand</h2>
    <div id="handView"></div>
  </div>

  <!-- Auction Buttons -->
  <div style="flex:1;min-width:300px;">
    <h2>Auction</h2>
    <div id="bidButtons" style="margin-top:12px;"></div>
    <div id="auctionTable"></div>
  </div>

</div>

<!-- ================= ROW 3 ================= -->
<div style="display:flex;gap:40px;flex-wrap:wrap;align-items:flex-start;">

  <!-- Dealer -->
  <div>
    <h2>Dealer</h2>
    <select id="dealer" style="font-size:1.4em;padding:12px 20px;">
      <option value="W">West</option>
      <option value="N">North</option>
      <option value="E">East</option>
      <option value="S" selected>South</option>
    </select>
  </div>

  <!-- Vulnerability -->
  <div>
    <h2>Vulnerability</h2>
    <select id="vuln" style="font-size:1.4em;padding:12px 20px;">
      <option value="NONE">None</option>
      <option value="NS">NS</option>
      <option value="EW">EW</option>
      <option value="BOTH">Both</option>
    </select>
  </div>

</div>

<br/>

<button onclick="undoBid()">Undo</button>
<button onclick="resetAuction()">Clear Auction</button>
<button onclick="resetHand()">Clear Hand</button>
<button onclick="recommend()">Recommend Bid</button>

<div id="output"></div>
`;

(window as any).toggleCard = toggleCard;
(window as any).addBid = addBid;
(window as any).undoBid = undoBid;
(window as any).resetHand = resetHand;
(window as any).resetAuction = resetAuction;
(window as any).recommend = recommend;
//(window as any).startCamera = startCamera;
(window as any).captureFrame = captureFrame;
(window as any).openCamera = openCamera;
(window as any).captureCards = captureCards;
(window as any).selectLevel = selectLevel;
(window as any).selectSuit = selectSuit;

function renderUI() {
  document.getElementById("deck")!.innerHTML = renderDeck();
  sortHandHighToLow(selectedHand);
  document.getElementById("handView")!.innerHTML = renderHand(selectedHand);
  document.getElementById("auctionTable")!.innerHTML = renderAuctionTable();
  document.getElementById("bidButtons")!.innerHTML = renderBidButtons();
  (document.getElementById("dealer") as HTMLSelectElement).onchange = (e) => {
    dealer = (e.target as HTMLSelectElement).value as Seat;
    resetAuction();
  };

  (document.getElementById("vuln") as HTMLSelectElement).onchange = (e) => {
    vulnerability = (e.target as HTMLSelectElement).value as any;
    renderUI();
  };
}

// draw cropped images into canvases
const canvases =
  document.querySelectorAll<HTMLCanvasElement>("#handView canvas");

let i = 0;
for (const item of selectedHand) {
  if ("image" in item && canvases[i]) {
    canvases[i].getContext("2d")!.drawImage(item.image, 0, 0);
    i++;
  }
}

function renderCameraArea() {
  const el = document.getElementById("cameraArea");
  if (!el) return;

  if (!cameraVisible) {
    el.innerHTML = `
      <button onclick="openCamera()">Open Camera to Capture Cards</button>
      <div id="cameraWrapper"></div>
    `;
    return;
  }

  el.innerHTML = `
    <div id="cameraWrapper"
         style="position:relative;width:100%;max-width:500px;">

      <video id="camera"
             autoplay muted playsinline
             style="width:100%;object-fit:cover;">
      </video>

      <button onclick="captureCards()"
              style="
                position:absolute;
                bottom:12px;
                right:12px;
                padding:10px 16px;
                font-size:16px;
                font-weight:bold;
                background:#2196f3;
                color:white;
                border:none;
                border-radius:6px;
                cursor:pointer;">
        Capture Cards
      </button>

    </div>
  `;
}

renderUI();
renderCameraArea();
loadRankTemplates();
