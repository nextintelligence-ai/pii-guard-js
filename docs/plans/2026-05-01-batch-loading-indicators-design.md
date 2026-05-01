# Batch Loading Indicators Design

## Goal

Batch processing should make active work visible without adding detailed progress math. The user needs a clear loading cue so a running batch row does not look idle or stuck.

## Scope

- Show a small loading spinner for running batch job statuses.
- Add a short secondary message under the filename for running rows.
- Keep the existing batch execution flow and job status model.
- Do not add page-count progress, percentage estimates, elapsed time, or ETA.

## UX

Running statuses are `opening`, `detecting`, `ocr`, and `applying`.

Each running row shows:

- A spinner next to the status label.
- A short action message under the filename:
  - `opening`: `PDF 여는 중...`
  - `detecting`: `개인정보 후보 탐지 중...`
  - `ocr`: `OCR 처리 중...`
  - `applying`: `비식별 적용 중...`

Completed, warning, failed, cancelled, and queued rows remain visually unchanged.

## Architecture

The change stays inside the batch table presentation layer. `BatchJobTable` already receives each job and status, and `batchStore` already defines all running states. A local helper can derive whether a status is running and which message to show.

No new store fields are needed. The runner already updates the status before each coarse stage, so the UI can render from the existing data.

## Testing

Add or update a component test for `BatchJobTable` that verifies:

- A running status renders the spinner and secondary loading text.
- A non-running status does not render loading text.

Run the focused test and the TypeScript build check.
