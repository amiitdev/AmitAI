# Documents on the SD card

AmitAI can answer questions about the files on your phone — *"what was my
vitamin D in the last lab report?"*, *"when did I buy the device with IMEI
357269623177888?"*, *"what does my rent agreement say about the deposit?"* —
including **scanned** PDFs that have no text layer.

It does this **without any app code running the search**. The reading and the
searching happen in Termux, in the opencode agent that already powers the
**AmitAI Bridge** provider, and the app sees the result as ordinary chat text.

> **App version:** unchanged. This feature ships **no APK** — the phone stays on
> 4.4.0. Nothing in `src/` or `android/` is involved.

---

## What it looks like

```
you   what was my vitamin D in the last lab report?

      - bash  rg -il "vitamin d" ~/.local/share/docindex/text   ✓
      - bash  rg -i -C2 "25-OH Vitamin D" .../Abnormal Diagnostic Report Summary.pdf.txt   ✓

      Your last lab report (02 Nov 2026, Thyrocare) shows
      25-OH Vitamin D (Total) 6.13 ng/mL — reference 30.0–100.0,
      flagged "High Deficiency (Severe Low)".
```

The tool lines are the same `- **bash** \`…\`` trace the bridge already streams,
so they render as a normal Markdown list. Whole exchange: two greps.

---

## Where it lives

```
 AmitAI app ──HTTP──▶ opencode-bridge :8130 ──▶ opencode :4610 ──▶ /storage/emulated/0
 (unchanged)          (prompt +1 block)          (agent, tools)      (read only)
                                                       │
                                                       ▼
                                        ~/.local/share/docindex/text
                                        338 extracted plain-text files
```

| Piece | Path | State |
|---|---|---|
| Text extractor | `~/docindex.sh` | new |
| OCR quality filter | `~/ocrclean.py` | new, one-off |
| The index | `~/.local/share/docindex/text/` | 28 MB, 338 files |
| Prompt injection | `~/opencode-bridge/server.mjs` | +28 lines |
| `pdftotext` / `pdftoppm` | Termux `poppler` 26.11.0 | installed |
| `tesseract` | Termux | already present (`eng` only) |

**Why not in the app?** Because the app never reads those files — the agent does.
The index is the only portable part, and it is a plain directory of `.txt`, so it
can be pointed at from anything later. Because it lives in the bridge, it is
**provider-scoped**: it works while AmitAI is on the *AmitAI Bridge* provider, and
disappears if you switch to Gemini / OpenRouter / OpenAI. An in-app index would be
the way to make it universal; see *Limits*.

---

## Install (already done on this phone)

```bash
pkg install poppler              # pdftotext + pdftoppm
./docindex.sh                    # build / refresh the index
```

`server.mjs` addition — a prompt block, nothing else is touched:

```js
const DOC_INDEX = process.env.DOC_INDEX || `${HOME}/.local/share/docindex/text`;

function docsBlock() {
  try {
    const m = fs.readFileSync(`${DOC_INDEX}/_manifest.txt`, 'utf8').trim();
    if (!m) return '';
    return '[DOCUMENTS] …';       // index path, search recipe, read-only rule
  } catch {
    return '';                     // no manifest → byte-identical old prompt
  }
}
```

It is read **per request**, so the index refreshes without restarting the bridge,
and a missing manifest degrades to the exact prompt the bridge used before.

---

## How a document becomes searchable

| Type | Method | Notes |
|---|---|---|
| `.pdf` | `pdftotext -layout` | page layout preserved, so tables stay readable |
| `.pdf` with no text layer | `pdftoppm -r 150 -png` → `tesseract` | opt-in, per file or `DO_OCR=1` |
| `.docx` | `unzip -p … word/document.xml` → strip tags | no `pandoc` needed |
| `.md .txt .csv` | copied as-is | already text |
| images, `.doc`, `.xls` | not indexed | out of scope for now |

Each source file becomes `…/<relative path>.txt` in the index, so the path in an
answer maps straight back to the real file.

Two safety nets, both learned from real files here:

- **A scan is not text.** `pdftotext` happily emits `Scanned by CamScanner` and
  calls it a day. Anything under **40 non-whitespace characters** is treated as
  empty and listed in `_failed.log` instead of indexed.
- **Junk OCR is worse than nothing.** Tesseract here ships `eng` only, so scanned
  Hindi forms produce character soup like `(a)ém@mﬁmﬁmmﬁmm:ﬁa?ﬁmﬁémﬁaa`, which
  creates *false* search hits. Output that is more than **15 % non-Latin
  characters** is deleted and reported as still needing text.

---

## Measured on this phone (iQOO I2305)

```
372 files scanned   →  338 indexed  (203 pdf · 112 md · 16 txt · 5 docx · 1 csv · 1 MD)
                      34 without text (Hindi scans, tesseract has eng only)
                      28 MB of plain text
full pass (cached)  →  ~40 s, 338 unchanged, nothing re-extracted
first full pass     →  ~6 min (325 documents)
OCR                 →  ~60 s/page at 200 dpi, ~25 s/page at 150 dpi
```

Verified answers, each from a different document type:

| Question | Answer | Source |
|---|---|---|
| vitamin D in the last lab report | 6.13 ng/mL (ref 30–100) | digital PDF |
| device with IMEI 357269623177888 | 29-10-2024, CLOUDSTORE RETAIL, ₹12,999 | tax invoice PDF |
| rent agreement deposit clause | quoted Clause 6, flagged placeholders | contract PDF |
| vehicle registration number | `BRO1CQ$478`, 12-Nov-2015 | **OCR'd scan** |

And the honest failure: asking about a landlord conversation the library does not
contain produced *"the only rental document is a blank template … I found no
messages from your landlord"* — no invention.

---

## Commands

```bash
./docindex.sh                            # refresh (skips unchanged files)
./docindex.sh --stats                    # counts, sizes, manifest
./docindex.sh --ocr "path/to/scan.pdf"   # OCR one file, reject non-Latin junk
DO_OCR=1 ./docindex.sh                   # OCR every scan (slow, hours)
LIMIT=3 ./docindex.sh                    # dry run on the first 3 files
```

Environment knobs: `OCR_DPI` (150), `OCR_MAX_PAGES` (12), `DOC_INDEX`.

---

## Limits, stated plainly

| Limit | Why | Path forward |
|---|---|---|
| Only on the **AmitAI Bridge** provider | the reading happens in opencode/Termux, not in the app | in-app Kotlin scanner + SQLite FTS5 + a `search_docs` tool, for every provider |
| **34 scans** stay unreadable | `tesseract` has `eng` traineddata only | drop `hin.traineddata` into `$PREFIX/share/tessdata` |
| Index is **manual** | `crond` is down on this phone (and would fire `wabackup.py` too) | re-run `docindex.sh`, or enable `crond` and add one line |
| Large scans are slow to OCR | ~8 MB PNG per page at 200 dpi | already lowered to 150 dpi; per-file OCR avoids the global pass |
| Doc questions are slower than chat | the agent runs 1–3 greps before answering; the bridge caps a turn at 180 s | expected; free-tier saturation makes it worse |
| Not a vector database | 338 documents and 28 MB of text are greppable in milliseconds | revisit past ~5 000 documents, or when questions are semantic rather than term-based |
| Keyword, not meaning | `rg` matches terms | same as above |

---

## Privacy and safety

- **The originals are never written.** `/storage/emulated/0` is read only; the
  index lives in Termux home.
- **Only matching lines leave the phone** — the agent sends greps and the lines
  they return to the model provider, exactly like web-page reading already does.
  Nothing else from the library is uploaded.
- The prompt block instructs the agent to **read only** while answering document
  questions, and to report `_failed.log` entries rather than guess at them.
- The bridge stays on loopback with its existing `Bearer` token.

---

## Troubleshooting

| Symptom | Check |
|---|---|
| *"I don't have access to your files"* | `./docindex.sh --stats` — is `_manifest.txt` there? Is the provider set to AmitAI Bridge? |
| Answer cites nothing | the manifest may be stale; re-run the extractor |
| A document is missing | `grep -i <name> ~/.local/share/docindex/text/_failed.log` — it is a scan |
| OCR rejected as junk | the scan is not English; add traineddata |
| Bridge times out on doc questions | free-tier quota; try another model or wait for the window |

## Rollback

```bash
cp ~/opencode-bridge/server.mjs.bak.docindex.* ~/opencode-bridge/server.mjs
sv restart opencode-bridge          # SVDIR=$PREFIX/var/service
rm -rf ~/.local/share/docindex
```

Nothing else was changed: no app build, no repo file, no permission.
