import { useEffect, useState } from 'react';
import { AuthHero } from './AuthHero';

/**
 * LoadingPage — Full-screen animated diagram that shows on initial load
 * Fades out smoothly after animations complete (~2.5s)
 * Uses the same AuthHero component for consistency
 */
export function LoadingPage({ onComplete }: { onComplete: () => void }) {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // Wait for all node + edge animations to complete (longest is ~1.5s)
    // Add extra 1s for user to see the final state
    const timer = setTimeout(() => {
      setFadeOut(true);
      // After fade-out animation (0.8s), notify parent
      setTimeout(onComplete, 800);
    }, 2500);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className={`loading-page${fadeOut ? ' loading-page--fade-out' : ''}`}>
      <AuthHero />
    </div>
  );
}
