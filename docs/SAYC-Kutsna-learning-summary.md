# SAYC-Kutsna Learning Summary (OCR-based)

## Source and extraction
- Source PDF: `public/SAYC-Kutsna.pdf`
- OCR full text: `public/SAYC-Kutsna.ocr.txt`
- OCR paged markdown: `public/SAYC-Kutsna.ocr.md`

## What was learned (high relevance to current BBT work)

### 1) 1D opener with 4 spades and extras
From OCR pages around the rebid matrix sections, these patterns appear repeatedly:
- `1♦-1♥-2♠` shown as a strong/new-suit continuation
- `1♦-1NT-2♠` appears in "after 1NT" continuation examples
- `1♦-1♠-3♠` appears in support/jump-support examples
- `1♦-2♣-2♠` and `1♦-2♦-2♠` are consistent with reverse/new-suit style treatment in the same strength zone

### 2) Strength zoning appears explicit
The OCR repeatedly groups rebids by strength bands such as:
- minimum zone (roughly 12-15)
- invitational/strong zone (roughly 16-18)
- upper strong zone (roughly 19-21)

This supports coding deterministic bid-rebid couples by HCP range and fit/new-suit logic.

### 3) 1NT response handling is emphasized
Multiple table snippets mention follow-ups after responder `1NT` (not forcing style / range-limited continuation), including explicit examples like:
- `1♥-1NT-2♥`
- `1♥-1NT-2♦`
- `1♥-1NT-2♠`
- `1♦-1NT-2♠`

### 4) Major support ladder is present
Several examples indicate:
- simple raises for lower range
- jump raises with extra values
- distinct treatment when opener instead shows a second suit

## Reliability note
- The PDF is scanned-image based; direct text extraction failed.
- OCR quality is usable for bid sequences but noisy in prose.
- Bid sequence tokens (`1D-1H-2S`, `1D-1S-3S`, etc.) are much more reliable than surrounding natural-language explanations.

## Recommended implementation approach in BBT
1. Keep hard sequence overrides for critical couples (highest confidence).
2. Apply range ladder by HCP bands for simple raise vs jump raise vs forcing new-suit continuations.
3. Treat `after 1NT` and `after second responder answer` as explicit phase rules, not generic matrix fallback.
