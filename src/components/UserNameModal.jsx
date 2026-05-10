import { useState } from 'react';
import { User } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import useStore from '@/store/useStore';

export default function UserNameModal() {
  const { userName, setUserName } = useStore();
  const [name, setName] = useState('');
  const open = !userName;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setUserName(name.trim());
  };

  if (!open) return null;

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false} onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader className="items-center text-center">
          <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-2 mx-auto">
            <User className="text-primary size-7" />
          </div>
          <DialogTitle className="text-xl">Welcome to Penny!</DialogTitle>
          <DialogDescription>
            What should we call you? This helps personalize your experience.
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
            Get Started
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
