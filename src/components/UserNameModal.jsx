import { useState } from 'react';
import { User } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useT } from '@/hooks/useT';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import useStore from '@/store/useStore';

export default function UserNameModal({ editOpen, onEditClose }) {
  const t = useT();
  const { userName, setUserName } = useStore();
  const isFirstTime = !userName;
  const open = isFirstTime || editOpen;

  // Seeded from the stored name each time the dialog opens for an edit. Keying
  // the draft on `open` beats syncing it in an effect, which would render the
  // previous value once before correcting itself.
  const [draft, setDraft] = useState({ open: false, value: '' });
  const name = draft.open === open ? draft.value : (editOpen && userName ? userName : '');
  const setName = (value) => setDraft({ open, value });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setUserName(name.trim());
    setName('');
    onEditClose?.();
  };

  const handleOpenChange = (v) => {
    if (!v && !isFirstTime) {
      setName('');
      onEditClose?.();
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm" showCloseButton={!isFirstTime} onPointerDownOutside={isFirstTime ? (e) => e.preventDefault() : undefined}>
        <DialogHeader className="items-center text-center">
          <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-2 mx-auto">
            <User className="text-primary size-7" />
          </div>
          <DialogTitle className="text-xl">{isFirstTime ? t('onboarding.title') : t('settings.yourName')}</DialogTitle>
          <DialogDescription>
            {isFirstTime ? t('onboarding.body') : t('settings.namePlaceholder')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-1.5">
            <Label>{t('settings.yourName')}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('onboarding.placeholder')}
              autoFocus
            />
          </div>
          <Button type="submit" disabled={!name.trim()} className="w-full">
            {isFirstTime ? t('onboarding.start') : t('common.save')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
