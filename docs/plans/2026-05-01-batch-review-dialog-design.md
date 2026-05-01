# Batch Review Dialog Design

## Goal

Batch job review should open in a large popup from the batch list instead of navigating to a separate `/batch/$jobId` page. The batch queue should remain visible behind the modal so users keep their place in the list.

## Scope

- Change the batch table review action to open an in-page dialog.
- Reuse the existing single-file review/editing experience inside a large modal.
- Keep batch job update behavior the same: review edits can be applied back to the selected batch job.
- Keep the existing `/batch/$jobId` route as a fallback for now.
- Do not redesign the editor, candidate panel, PDF canvas, or batch processing pipeline.

## UX

The `검수` button opens a full-height, wide dialog. The dialog header shows:

- The selected job file name.
- A status badge.
- A `다시 적용` action.
- The standard close button from the dialog component.

The body contains the existing review layout so users can inspect candidates, adjust boxes, move between PDF pages, run OCR if needed, and reapply anonymization. Closing the dialog returns to the unchanged batch list.

The dialog should use most of the viewport, for example:

- Width: `calc(100vw - 32px)`.
- Height: `calc(100vh - 32px)`.
- Internal content should scroll where needed rather than expanding past the viewport.

## Architecture

`BatchPage` owns a local `reviewJobId` state. Passing `onReview` into `BatchJobTable` removes router knowledge from the table. When a review starts, `BatchPage` opens `BatchReviewDialog`.

`BatchReviewDialog` is a new component that finds the job from `useBatchStore`, loads `job.file` through `usePdfDocument().load`, and renders the existing review editor. It also owns the current "reapply to batch job" action currently implemented in `BatchJobPage`.

The current `BatchJobPage` and `/batch/$jobId` route remain in place. They continue to support direct route access while the list button uses the dialog.

## Data Flow

1. User clicks `검수` in `BatchJobTable`.
2. `BatchJobTable` calls `onReview(job.id)`.
3. `BatchPage` stores the selected job id and opens `BatchReviewDialog`.
4. `BatchReviewDialog` loads the selected file into the existing app editing store.
5. User edits candidates or boxes in the existing review UI.
6. User clicks `다시 적용`.
7. `applyCurrentDocument()` produces the output blob and report.
8. `useBatchStore().updateJob()` writes the updated status, counts, report, blob, error, and review flag back to the selected job.

## Error Handling

If the selected job no longer exists, the dialog shows `해당 batch 파일을 찾을 수 없습니다.` with a close path. If PDF load or apply fails, the existing document error state and batch job failure update behavior are used. Closing the dialog should not clear the batch list or queued jobs.

## Testing

Tests should cover:

- `BatchJobTable` calls `onReview(job.id)` when the review button is clicked.
- `BatchPage` opens a review dialog for a selected job without changing route.
- `BatchReviewDialog` renders the selected file name and the embedded editor area.
- Existing `/batch/$jobId` tests still pass as fallback route coverage.

Verification should include the focused component/page tests, related batch tests, and `npm run lint`.
