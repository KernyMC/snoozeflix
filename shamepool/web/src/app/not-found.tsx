import { Button } from '@/components/ui/Button';
import { Flakey } from '@/components/ui/Flakey';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md min-h-dvh grid place-items-center p-8 text-center">
      <div className="space-y-3">
        <div className="flex justify-center"><Flakey mood="sleepy" size={140} /></div>
        <h1 className="font-display font-black text-3xl">Nothing here</h1>
        <p className="text-ink-soft font-bold">This page flaked on us.</p>
        <Button href="/home">Back home</Button>
      </div>
    </main>
  );
}
