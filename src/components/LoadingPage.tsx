import { useEffect, useState } from 'react';

/**
 * LoadingPage — Full-screen animated diagram that shows on initial load
 * Fades out smoothly after animations complete (~2.5s)
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
      {/* Ambient glow blobs */}
      <div className="ah-blob ah-blob--blue" />
      <div className="ah-blob ah-blob--purple" />
      <div className="ah-blob ah-blob--teal" />

      {/* Dot grid */}
      <div className="ah-grid" />

      {/* SVG diagram */}
      <svg className="ah-svg" viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg">
        {/* ── Nodes (5 entities) ── */}
        
        {/* User */}
        <g className="ah-node ah-node--0" transform="translate(100, 80)">
          <rect width="140" height="110" rx="12" fill="rgba(59, 130, 246, 0.08)" stroke="rgba(59, 130, 246, 0.4)" strokeWidth="1.5"/>
          <rect x="8" y="8" width="124" height="28" rx="6" fill="rgba(59, 130, 246, 0.15)"/>
          <text x="70" y="26" textAnchor="middle" fill="#60a5fa" fontSize="13" fontWeight="600">👤 User</text>
          <text x="16" y="52" fill="rgba(148, 163, 184, 0.9)" fontSize="11">🔑 id</text>
          <text x="110" y="52" textAnchor="end" fill="rgba(100, 116, 139, 0.6)" fontSize="10">uuid</text>
          <text x="16" y="70" fill="rgba(148, 163, 184, 0.9)" fontSize="11">✉️ email</text>
          <text x="110" y="70" textAnchor="end" fill="rgba(100, 116, 139, 0.6)" fontSize="10">string</text>
          <text x="16" y="88" fill="rgba(148, 163, 184, 0.9)" fontSize="11">👤 name</text>
          <text x="110" y="88" textAnchor="end" fill="rgba(100, 116, 139, 0.6)" fontSize="10">string</text>
          <text x="16" y="102" fill="rgba(148, 163, 184, 0.9)" fontSize="11">🎭 role</text>
          <text x="110" y="102" textAnchor="end" fill="rgba(251, 191, 36, 0.7)" fontSize="10">enum</text>
        </g>

        {/* Project */}
        <g className="ah-node ah-node--1" transform="translate(330, 50)">
          <rect width="140" height="125" rx="12" fill="rgba(139, 92, 246, 0.08)" stroke="rgba(139, 92, 246, 0.4)" strokeWidth="1.5"/>
          <rect x="8" y="8" width="124" height="28" rx="6" fill="rgba(139, 92, 246, 0.15)"/>
          <text x="70" y="26" textAnchor="middle" fill="#a78bfa" fontSize="13" fontWeight="600">📁 Project</text>
          <text x="16" y="52" fill="rgba(148, 163, 184, 0.9)" fontSize="11">🔑 id</text>
          <text x="110" y="52" textAnchor="end" fill="rgba(100, 116, 139, 0.6)" fontSize="10">uuid</text>
          <text x="16" y="70" fill="rgba(148, 163, 184, 0.9)" fontSize="11">📝 title</text>
          <text x="110" y="70" textAnchor="end" fill="rgba(100, 116, 139, 0.6)" fontSize="10">string</text>
          <text x="16" y="88" fill="rgba(148, 163, 184, 0.9)" fontSize="11">🌐 projectId</text>
          <text x="110" y="88" textAnchor="end" fill="rgba(100, 116, 139, 0.6)" fontSize="10">uuid</text>
          <text x="16" y="104" fill="rgba(148, 163, 184, 0.9)" fontSize="11">⚡ status</text>
          <text x="110" y="104" textAnchor="end" fill="rgba(251, 191, 36, 0.7)" fontSize="10">enum</text>
        </g>

        {/* Schema */}
        <g className="ah-node ah-node--2" transform="translate(560, 80)">
          <rect width="140" height="110" rx="12" fill="rgba(6, 182, 212, 0.08)" stroke="rgba(6, 182, 212, 0.4)" strokeWidth="1.5"/>
          <rect x="8" y="8" width="124" height="28" rx="6" fill="rgba(6, 182, 212, 0.15)"/>
          <text x="70" y="26" textAnchor="middle" fill="#22d3ee" fontSize="13" fontWeight="600">🗂️ Schema</text>
          <text x="16" y="52" fill="rgba(148, 163, 184, 0.9)" fontSize="11">🔑 id</text>
          <text x="110" y="52" textAnchor="end" fill="rgba(100, 116, 139, 0.6)" fontSize="10">uuid</text>
          <text x="16" y="70" fill="rgba(148, 163, 184, 0.9)" fontSize="11">📛 name</text>
          <text x="110" y="70" textAnchor="end" fill="rgba(100, 116, 139, 0.6)" fontSize="10">string</text>
          <text x="16" y="88" fill="rgba(148, 163, 184, 0.9)" fontSize="11">🔗 projectId</text>
          <text x="110" y="88" textAnchor="end" fill="rgba(100, 116, 139, 0.6)" fontSize="10">uuid</text>
          <text x="16" y="102" fill="rgba(148, 163, 184, 0.9)" fontSize="11">🔢 version</text>
          <text x="110" y="102" textAnchor="end" fill="rgba(100, 116, 139, 0.6)" fontSize="10">int</text>
        </g>

        {/* Field */}
        <g className="ah-node ah-node--3" transform="translate(200, 280)">
          <rect width="140" height="110" rx="12" fill="rgba(251, 146, 60, 0.08)" stroke="rgba(251, 146, 60, 0.4)" strokeWidth="1.5"/>
          <rect x="8" y="8" width="124" height="28" rx="6" fill="rgba(251, 146, 60, 0.15)"/>
          <text x="70" y="26" textAnchor="middle" fill="#fb923c" fontSize="13" fontWeight="600">🏷️ Field</text>
          <text x="16" y="52" fill="rgba(148, 163, 184, 0.9)" fontSize="11">🔑 id</text>
          <text x="110" y="52" textAnchor="end" fill="rgba(100, 116, 139, 0.6)" fontSize="10">uuid</text>
          <text x="16" y="70" fill="rgba(148, 163, 184, 0.9)" fontSize="11">📛 name</text>
          <text x="110" y="70" textAnchor="end" fill="rgba(100, 116, 139, 0.6)" fontSize="10">string</text>
          <text x="16" y="88" fill="rgba(148, 163, 184, 0.9)" fontSize="11">📐 type</text>
          <text x="110" y="88" textAnchor="end" fill="rgba(100, 116, 139, 0.6)" fontSize="10">string</text>
          <text x="16" y="102" fill="rgba(148, 163, 184, 0.9)" fontSize="11">🆔 entityId</text>
          <text x="110" y="102" textAnchor="end" fill="rgba(100, 116, 139, 0.6)" fontSize="10">uuid</text>
        </g>

        {/* Entity */}
        <g className="ah-node ah-node--4" transform="translate(430, 280)">
          <rect width="140" height="110" rx="12" fill="rgba(16, 185, 129, 0.08)" stroke="rgba(16, 185, 129, 0.4)" strokeWidth="1.5"/>
          <rect x="8" y="8" width="124" height="28" rx="6" fill="rgba(16, 185, 129, 0.15)"/>
          <text x="70" y="26" textAnchor="middle" fill="#34d399" fontSize="13" fontWeight="600">📦 Entity</text>
          <text x="16" y="52" fill="rgba(148, 163, 184, 0.9)" fontSize="11">🔑 id</text>
          <text x="110" y="52" textAnchor="end" fill="rgba(100, 116, 139, 0.6)" fontSize="10">uuid</text>
          <text x="16" y="70" fill="rgba(148, 163, 184, 0.9)" fontSize="11">📛 name</text>
          <text x="110" y="70" textAnchor="end" fill="rgba(100, 116, 139, 0.6)" fontSize="10">string</text>
          <text x="16" y="88" fill="rgba(148, 163, 184, 0.9)" fontSize="11">🗂️ schemaId</text>
          <text x="110" y="88" textAnchor="end" fill="rgba(100, 116, 139, 0.6)" fontSize="10">uuid</text>
        </g>

        {/* ── Edges (relationships) ── */}
        
        {/* User → Project */}
        <g className="ah-edge ah-edge--0">
          <line x1="240" y1="135" x2="330" y2="112" stroke="rgba(251, 191, 36, 0.4)" strokeWidth="2" strokeDasharray="6 4"/>
          <circle cx="285" cy="123" r="8" fill="rgba(8, 14, 26, 0.9)" stroke="rgba(251, 191, 36, 0.5)" strokeWidth="1.5"/>
          <text x="285" y="127" textAnchor="middle" fill="rgba(251, 191, 36, 0.8)" fontSize="10" fontWeight="600">1:N</text>
        </g>

        {/* Project → Schema */}
        <g className="ah-edge ah-edge--1">
          <line x1="470" y1="112" x2="560" y2="135" stroke="rgba(6, 182, 212, 0.4)" strokeWidth="2" strokeDasharray="6 4"/>
          <circle cx="515" cy="123" r="8" fill="rgba(8, 14, 26, 0.9)" stroke="rgba(6, 182, 212, 0.5)" strokeWidth="1.5"/>
          <text x="515" y="127" textAnchor="middle" fill="rgba(6, 182, 212, 0.8)" fontSize="10" fontWeight="600">1:N</text>
        </g>

        {/* Schema → Entity */}
        <g className="ah-edge ah-edge--2">
          <path d="M 630 190 Q 630 235, 570 280" stroke="rgba(16, 185, 129, 0.4)" strokeWidth="2" fill="none" strokeDasharray="6 4"/>
          <circle cx="595" cy="235" r="8" fill="rgba(8, 14, 26, 0.9)" stroke="rgba(16, 185, 129, 0.5)" strokeWidth="1.5"/>
          <text x="595" y="239" textAnchor="middle" fill="rgba(16, 185, 129, 0.8)" fontSize="10" fontWeight="600">1:N</text>
        </g>

        {/* Entity → Field */}
        <g className="ah-edge ah-edge--3">
          <line x1="430" y1="335" x2="340" y2="335" stroke="rgba(251, 146, 60, 0.4)" strokeWidth="2" strokeDasharray="6 4"/>
          <circle cx="385" cy="335" r="8" fill="rgba(8, 14, 26, 0.9)" stroke="rgba(251, 146, 60, 0.5)" strokeWidth="1.5"/>
          <text x="385" y="339" textAnchor="middle" fill="rgba(251, 146, 60, 0.8)" fontSize="10" fontWeight="600">1:N</text>
        </g>

        {/* User → Project (circular back reference visual hint) */}
        <g className="ah-edge ah-edge--4">
          <path d="M 170 190 Q 170 235, 200 280" stroke="rgba(59, 130, 246, 0.25)" strokeWidth="1.5" fill="none" strokeDasharray="4 3"/>
        </g>
      </svg>

      {/* Tagline */}
      <div className="ah-tagline">
        <span className="ah-tagline-brand">Escema</span>
        <span className="ah-tagline-sep">—</span>
        <span className="ah-tagline-sub">Build · Visualize · Document</span>
      </div>
    </div>
  );
}
