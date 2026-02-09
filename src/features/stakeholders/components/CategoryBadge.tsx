interface CategoryBadgeProps {
  name: string;
  color: string;
  size?: 'sm' | 'md';
}

export default function CategoryBadge({
  name,
  color,
  size = 'sm',
}: CategoryBadgeProps) {
  const sizeClasses =
    size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';

  return (
    <span
      className={`inline-flex rounded-full font-medium text-white ${sizeClasses}`}
      style={{ backgroundColor: color }}
      data-testid="category-badge"
    >
      {name}
    </span>
  );
}
