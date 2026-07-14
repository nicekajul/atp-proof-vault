/**
 * Renders one correction marker: a box if the comment has boxW/boxH (the
 * current drag-to-draw style), or a small dot for older point-pin comments
 * created before that existed. `pointer-events-none` so markers never block
 * starting a new drag on top of an existing one. `data-comment-id` gives
 * callers a hook to scroll a specific marker into view (e.g. from a
 * checklist selection) without needing a ref passed through every viewer.
 */
export default function AnnotationMarker({ comment, selected = false }) {
  const hasBox = comment.boxW !== '' && comment.boxW !== undefined && Number(comment.boxW) > 0;

  if (hasBox) {
    return (
      <div
        data-comment-id={comment.id}
        title={comment.body}
        className={`absolute border-2 pointer-events-none transition-shadow ${
          selected
            ? 'border-amber-400 bg-amber-400/20 ring-4 ring-amber-300/60 z-10'
            : comment.resolved
              ? 'border-gray-400 bg-gray-400/10'
              : 'border-red-500 bg-red-500/10'
        }`}
        style={{ left: `${comment.posX}%`, top: `${comment.posY}%`, width: `${comment.boxW}%`, height: `${comment.boxH}%` }}
      />
    );
  }

  return (
    <div
      data-comment-id={comment.id}
      title={comment.body}
      className={`absolute w-5 h-5 -ml-2.5 -mt-2.5 text-white text-[10px] rounded-full flex items-center justify-center shadow pointer-events-none transition-shadow ${
        selected ? 'bg-amber-400 ring-4 ring-amber-300/60 z-10' : comment.resolved ? 'bg-gray-400' : 'bg-red-500'
      }`}
      style={{ left: `${comment.posX}%`, top: `${comment.posY}%` }}
    >
      ●
    </div>
  );
}
