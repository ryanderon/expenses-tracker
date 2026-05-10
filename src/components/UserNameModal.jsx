import { useState, useEffect } from 'react';
import { User } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import useStore from '@/store/useStore';

export default function UserNameModal({ editOpen, onEditClose }) {
  const { userName, setUserName } = useStore();
  const [name, setName] = useState('');
  const isFirstTime = !userName;
  const open = isFirstTime || editOpen;

  useEffect(() => {
    if (editOpen && userName) setName(userName);
  }, [editOpen, userName]);

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
          <DialogTitle className="text-xl">{isFirstTime ? 'Welcome to Penny!' : 'Change Name'}</DialogTitle>
          <DialogDescription>
            {isFirstTime ? 'What should we call you? This helps personalize your experience.' : 'Update your display name.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-1.5">
            <Label>Your Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name..."
              autoFocus
            />
          </div>
          <Button type="submit" disabled={!name.trim()} className="w-full">
            {isFirstTime ? 'Get Started' : 'Save'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
