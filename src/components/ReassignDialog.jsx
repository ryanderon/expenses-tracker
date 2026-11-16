import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ChoicePill } from '@/components/ui/design';
import { useT } from '@/hooks/useT';
import { cn } from '@/lib/utils';

/**
 * Asks what to do with transactions that are about to lose their account or
 * category: move them somewhere else, or delete them along with it. Used both
 * when deleting and when cleaning up ones an older version left behind.
 *
 * `onConfirm(target)` gets the chosen option's value, or null to delete.
 */
export default function ReassignDialog({
  open, onOpenChange, title, description, count, options, defaultTarget, confirmLabel, onConfirm,
}) {
  const t = useT();
  const [action, setAction] = useState('move');
  const [target, setTarget] = useState(defaultTarget || options[0]?.value || '');
  const canMove = options.length > 0;
  const deleting = action === 'delete' || !canMove;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px] rounded-[20px] p-6">
        <DialogHeader>
          <DialogTitle className="text-base font-extrabold">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <p className="text-[11.5px] uppercase tracking-[0.04em] text-muted-foreground">
            {t('reassign.question', { count })}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {canMove && (
              <ChoicePill active={action === 'move'} onClick={() => setAction('move')}>
                {t('reassign.move')}
              </ChoicePill>
            )}
            <ChoicePill active={deleting} onClick={() => setAction('delete')}>
              {t('reassign.delete')}
            </ChoicePill>
          </div>

          {deleting ? (
            <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">
              {t('reassign.deleteWarn', { count })}
            </p>
          ) : (
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger className="h-10 w-full rounded-xl">
                <SelectValue placeholder={t('reassign.pick')} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="mt-2 flex gap-2.5">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1 rounded-xl py-3 font-bold"
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={!deleting && !target}
            onClick={() => {
              onConfirm(deleting ? null : target);
              onOpenChange(false);
            }}
            className={cn(
              'flex-1 rounded-xl py-3 font-bold',
              deleting && 'bg-destructive text-white hover:bg-destructive/90'
            )}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
