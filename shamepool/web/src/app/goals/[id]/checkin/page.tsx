'use client';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useGoal, useMe } from '@/data';
import { CheckinFlow } from '@/components/CheckinFlow';
import { Button } from '@/components/ui/Button';
import { Flakey } from '@/components/ui/Flakey';
import { Skeleton } from '@/components/ui/States';

export default function CheckinPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const goal = useGoal(id);
  const router = useRouter();

  useEffect(() => {
    if (me === null) router.replace('/');
    else if (me && goal && goal.userId !== me.id) router.replace(`/goals/${id}`);
  }, [me, goal, id, router]);

  if (me === undefined) return <div className="mx-auto max-w-md p-5"><Skeleton className="h-64" /></div>;
  if (!me || !goal || goal.userId !== me.id) {
    return (
      <div className="mx-auto max-w-md p-8 text-center space-y-3">
        <div className="flex justify-center"><Flakey mood="sleepy" size={110} /></div>
        <h1 className="font-display font-black text-2xl">Goal not found</h1>
        <Button href="/home">Back home</Button>
      </div>
    );
  }
  return <CheckinFlow goal={goal} />;
}
