const STYLES = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  changes_requested: 'bg-red-100 text-red-800',
  review_pending: 'bg-indigo-100 text-indigo-800',
  reviewer_approved: 'bg-sky-100 text-sky-800',
  reviewer_changes_requested: 'bg-orange-100 text-orange-800',
  active: 'bg-blue-100 text-blue-800',
};

const LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  changes_requested: 'Changes requested',
  review_pending: 'Review pending',
  reviewer_approved: 'Reviewer approved',
  reviewer_changes_requested: 'Reviewer flagged',
  active: 'Active',
};

export default function StatusBadge({ status }) {
  const style = STYLES[status] || 'bg-gray-100 text-gray-700';
  const label = LABELS[status] || status;
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}
