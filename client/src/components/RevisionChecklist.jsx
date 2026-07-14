import { useEffect, useState } from 'react';

export default function RevisionChecklist({ comments, title = 'Revision checklist', onToggleComment, selectedId, onSelectComment }) {
  const authorComments = (comments || []).filter((c) => c.authorType === 'author');
  const [checked, setChecked] = useState({});

  useEffect(() => {
    const next = {};
    for (const comment of authorComments) {
      next[comment.id] = comment.reviewerChecked === 'true';
    }
    setChecked(next);
  }, [authorComments]);

  if (authorComments.length === 0) return null;

  function toggle(comment) {
    const nextValue = !checked[comment.id];
    setChecked((prev) => ({ ...prev, [comment.id]: nextValue }));
    if (onToggleComment) onToggleComment(comment.id, nextValue);
  }

  return (
    <div className="border rounded-xl p-3 bg-gray-50">
      <h4 className="text-sm font-medium mb-2">{title}</h4>
      {onSelectComment && (
        <p className="text-xs text-gray-400 mb-2">Click a note to jump to its marker on the proof.</p>
      )}
      <div className="space-y-2 text-sm">
        {authorComments.map((comment) => {
          const hasMarker = Boolean(onSelectComment) && comment.posX !== '' && comment.posX !== undefined;
          return (
            <div
              key={comment.id}
              onClick={hasMarker ? () => onSelectComment(comment.id) : undefined}
              className={`flex items-start gap-2 rounded-lg px-1.5 py-1 -mx-1.5 ${hasMarker ? 'cursor-pointer' : ''} ${
                selectedId === comment.id ? 'bg-amber-100' : hasMarker ? 'hover:bg-gray-100' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={Boolean(checked[comment.id])}
                onChange={(e) => {
                  e.stopPropagation();
                  toggle(comment);
                }}
                onClick={(e) => e.stopPropagation()}
                className="mt-1"
              />
              <span className={checked[comment.id] ? 'text-gray-500 line-through' : 'text-gray-700'}>
                {comment.body}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
