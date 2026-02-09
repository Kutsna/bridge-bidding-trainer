/* =========================================================
   IMPORTS
========================================================= */

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
const ALL_SUITS = ["S", "H", "D", "C"] as const;

const SUIT_SYMBOLS = {
  S: { symbol: "♠", color: "black" },
  H: { symbol: "♥", color: "red" },
  D: { symbol: "♦", color: "red" },
  C: { symbol: "♣", color: "black" },
};

const BASE_SEATS = ["W", "N", "E", "S"] as const;
type Seat = (typeof BASE_SEATS)[number];

const BID_OPTIONS = [
  "P",
  "X",
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
];

type CornerBox = { x: number; y: number; w: number; h: number };

/* =========================================================
   STATE
========================================================= */

let selectedHand: { rank: string; suit: string }[] = [];
let auction: string[] = [];

let dealer: Seat = "S";
let vulnerability: "NONE" | "NS" | "EW" | "BOTH" = "NONE";

let cameraStream: MediaStream | null = null;

/* =========================================================
   CAMERA
========================================================= */

async function startCamera() {
  if (cameraStream) return;

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });

    (document.getElementById("camera") as HTMLVideoElement).srcObject =
      cameraStream;
  } catch {
    alert("Camera not available.");
  }
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

  // 2️⃣ detect boxes
  const boxes = detectCornerBoxes(canvas);

  // 3️⃣ draw green boxes
  ctx.strokeStyle = "lime";
  ctx.lineWidth = 3;
  boxes.forEach((b) => ctx.strokeRect(b.x, b.y, b.w, b.h));

  // 🔴 4️⃣ FORCE DRAW TEXT (NO ML, NO HELPERS)
  ctx.font = "bold 28px Arial";
  ctx.textBaseline = "top";

  boxes.forEach((b, i) => {
    // white background
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillRect(b.x + 4, b.y + 4, 44, 32);

    // black text
    ctx.fillStyle = "black";
    ctx.fillText("A♠", b.x + 8, b.y + 6);
  });

  console.log("FORCED DRAW DONE, boxes =", boxes.length);
}

/* =========================================================
   PHASE 2 — CORNER DETECTION (HEURISTIC)
========================================================= */

function detectCornerBoxes(canvas: HTMLCanvasElement): CornerBox[] {
  const { width, height } = canvas;
  const boxes: CornerBox[] = [];

  // ✅ Corrected geometry (wider + shorter)
  const boxW = Math.floor(width * 0.095); // wider
  const boxH = Math.floor(height * 0.085); // shorter

  // Fan layout parameters
  const startX = Math.floor(width * 0.04);
  const startY = Math.floor(height * 0.045);
  const stepX = Math.floor(boxW * 0.72); // overlap like real cards

  const RANK_CONF_MIN = 0.75;
  const SUIT_CONF_MIN = 0.75;

  for (let i = 0; i < 13; i++) {
    boxes.push({
      x: startX + i * stepX,
      y: startY,
      w: boxW,
      h: boxH,
    });
  }

  return boxes;
}

function drawCornerBoxes(canvas: HTMLCanvasElement, boxes: CornerBox[]) {
  const ctx = canvas.getContext("2d")!;
  ctx.strokeStyle = "lime";
  ctx.lineWidth = 3;

  for (const b of boxes) {
    ctx.strokeRect(b.x, b.y, b.w, b.h);
  }
}

function extractCornerCanvases(
  canvas: HTMLCanvasElement,
  boxes: CornerBox[],
): HTMLCanvasElement[] {
  return boxes.map((b) => {
    const c = document.createElement("canvas");
    c.width = b.w;
    c.height = b.h;
    c.getContext("2d")!.drawImage(canvas, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    return c;
  });
}

/* =========================================================
   PHASE 3 — CARD RECOGNITION
========================================================= */

let mlReady = false;

async function recognizeCardsFromSnapshot(
  canvas: HTMLCanvasElement,
  boxes: CornerBox[],
) {
  console.log("PHASE 3.3: recognition started");

  if (!mlReady) {
    await loadRankModel();
    await loadSuitModel();
    mlReady = true;
    console.log("ML models loaded");
  }

  const cornerCanvases = extractCornerCanvases(canvas, boxes);

  if (cornerCanvases.length !== 13) {
    alert("Expected 13 card corners.");
    return;
  }

  type Pred = {
    rank: string;
    suit: "S" | "H" | "D" | "C";
    rankConf: number;
    suitConf: number;
    ok: boolean;
  };

  const predictions: Pred[] = [];

  for (let i = 0; i < cornerCanvases.length; i++) {
    const p = await recognizeCard(cornerCanvases[i]);

    const rankConf = p.rankConfidence ?? 1;
    const suitConf = p.suitConfidence ?? 1;

    const ok =
      rankConf >= RANK_CONF_MIN &&
      suitConf >= SUIT_CONF_MIN &&
      "AKQJT98765432".includes(p.rank) &&
      "SHDC".includes(p.suit);

    predictions.push({
      rank: p.rank,
      suit: p.suit,
      rankConf,
      suitConf,
      ok,
    });
  }

  // 🔴 Draw labels on snapshot
  drawCardLabels(canvas, boxes, predictions);

  // 🟡 Validate before applying to hand
  const good = predictions.filter((p) => p.ok);
  const unique = new Set(good.map((p) => p.rank + p.suit));

  if (good.length === 13 && unique.size === 13) {
    console.log("All 13 cards recognized with confidence");

    selectedHand = good.map((p) => ({
      rank: p.rank,
      suit: p.suit,
    }));

    renderUI();
  } else {
    console.warn("Recognition incomplete:", `${good.length}/13 confident`);
  }
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

function renderCornerPreview(corners: HTMLCanvasElement[]) {
  const container = document.getElementById("cornerPreview");
  if (!container) return;

  container.innerHTML = "";

  corners.forEach((c, i) => {
    const wrapper = document.createElement("div");
    wrapper.style.border = "1px solid #ccc";
    wrapper.style.padding = "2px";
    wrapper.style.textAlign = "center";

    c.style.width = "48px";
    c.style.height = "64px";

    const label = document.createElement("div");
    label.textContent = predictions[i]
      ? `${predictions[i].rank}${predictions[i].suit}`
      : `#${i + 1}`;
    label.style.fontSize = "10px";

    wrapper.appendChild(c);
    wrapper.appendChild(label);
    container.appendChild(wrapper);
  });
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

function renderHand(hand) {
  const bySuit = {
    S: hand.filter((c) => c.suit === "S"),
    H: hand.filter((c) => c.suit === "H"),
    D: hand.filter((c) => c.suit === "D"),
    C: hand.filter((c) => c.suit === "C"),
  };

  const hcp =
    hand.length === 13 ? computeHandFacts(hand).hcp : `${hand.length}/13`;

  return `
    ${(["S", "H", "D", "C"] as const)
      .map(
        (s) =>
          `<div style="font-size:26px;font-weight:bold;color:${SUIT_SYMBOLS[s].color}">
        ${SUIT_SYMBOLS[s].symbol} ${bySuit[s].map((c) => c.rank).join(" ") || "-"}
      </div>`,
      )
      .join("")}
    <div><b>HCP:</b> ${hcp}</div>
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
         style="display:inline-block;width:26px;margin:2px;
         border:${selectedHand.some((c) => c.rank === rank && c.suit === suit) ? "2px solid green" : "1px solid #ccc"};
         cursor:pointer;font-weight:bold;color:${SUIT_SYMBOLS[suit].color}">
         ${rank}</span>`,
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
    <div>${auctionEnded() ? "Auction Ended" : `Turn: ${currentTurn()}`}</div>
  `;
}

function renderBidButtons() {
  return BID_OPTIONS.map(
    (b) => `<button onclick="addBid('${b}')">${b}</button>`,
  ).join("");
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
    ? `<b style="font-size:22px;color:green">${rec.bid}</b><br/>${rec.explanation}`
    : `<b>No SAYC rule matched.</b>
       <br/>Opening=${isOpening}
       <br/>HCP=${facts.hcp}`;
}

/* =========================================================
   UI + EXPORTS
========================================================= */

document.body.innerHTML = `
<h2>Bridge Bidding Trainer (SAYC)</h2>

<!-- CAMERA -->
<div style="margin-bottom:12px;">
  <button onclick="startCamera()">Open Camera</button>
  <button onclick="captureFrame()">Capture Cards</button><br/><br/>

  <video id="camera" autoplay playsinline
    style="width:100%;max-width:420px;border:1px solid #ccc;"></video>

  <canvas id="snapshot"
    style="display:none;width:100%;max-width:420px;border:1px solid #ccc;margin-top:6px;"></canvas>
</div>

<div id="cornerPreview"
     style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
</div>

<!-- MAIN ROW -->
<div style="display:flex;gap:16px;flex-wrap:wrap;">

  <div style="flex:1;min-width:260px;">
    <h3>Select Your Hand</h3>
    <div id="deck"></div>
  </div>

  <div style="flex:1;min-width:260px;">
    <h3>Your Hand</h3>
    <div id="handView"></div>
  </div>

  <div style="flex:1;min-width:260px;">
    <h3>Auction</h3>
    <div id="auctionTable"></div>
    <div id="bidButtons"></div>
  </div>

  <div style="flex:1;min-width:200px;">
    <h3>Dealer</h3>
    <select id="dealer">
      <option value="W">West</option>
      <option value="N">North</option>
      <option value="E">East</option>
      <option value="S" selected>South</option>
    </select>

    <h3>Vulnerability</h3>
    <select id="vuln">
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

<pre id="output"></pre>
`;

(window as any).toggleCard = toggleCard;
(window as any).addBid = addBid;
(window as any).undoBid = undoBid;
(window as any).resetHand = resetHand;
(window as any).resetAuction = resetAuction;
(window as any).recommend = recommend;
(window as any).startCamera = startCamera;
(window as any).captureFrame = captureFrame;

function renderUI() {
  document.getElementById("deck")!.innerHTML = renderDeck();
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

renderUI();
