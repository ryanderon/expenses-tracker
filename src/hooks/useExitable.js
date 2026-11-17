import { useEffect, useState } from 'react';

/**
 * For a dialog that's only mounted while something is set (`{deleting &&
 * <Dialog/>}`): unmounting at once cuts its closing animation off. This keeps
 * it mounted, showing the last value, for `ms` after `value` clears, then lets
 * it go, so the next open still starts from a fresh form.
 *
 *   const del = useExitable(deleting);
 *   {del.mounted && <ReassignDialog open={del.open} target={del.value} />}
 */
export default function useExitable(value, ms = 300) {
  const open = !!value;
  const [kept, setKept] = useState(value);
  const [mounted, setMounted] = useState(open);

  // Derived during render (React's documented pattern), so the dialog is
  // mounted in the same render that opens it.
  if (open && value !== kept) setKept(value);
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (open) return undefined;
    const id = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(id);
  }, [open, ms]);

  return { open, mounted: open || mounted, value: open ? value : kept };
}
