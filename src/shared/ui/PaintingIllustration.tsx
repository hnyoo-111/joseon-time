/** Abstract placeholder illustration, used as a fallback when a Painting has no imageSrc set. */
export function PaintingIllustration() {
  return (
    <svg viewBox="0 0 800 380" xmlns="http://www.w3.org/2000/svg">
      <rect width="800" height="380" fill="#EFE8D8" />
      <rect x="4" y="4" width="792" height="372" fill="none" stroke="#B9AE8F" strokeWidth="2" />
      <path d="M40 300 C 200 258, 300 322, 460 270 S 700 224, 760 246" fill="none" stroke="#C9BFA0" strokeWidth="20" strokeLinecap="round" opacity="0.55" />
      <g fill="#3A362B" opacity="0.85">
        <circle cx="110" cy="292" r="7" /><rect x="103" y="296" width="14" height="18" rx="3" />
        <circle cx="155" cy="282" r="7" /><rect x="148" y="286" width="14" height="18" rx="3" />
        <circle cx="200" cy="292" r="8" /><rect x="192" y="296" width="16" height="20" rx="3" />
        <rect x="255" y="266" width="66" height="32" rx="7" />
        <circle cx="288" cy="258" r="7" />
        <circle cx="365" cy="280" r="7" /><rect x="358" y="284" width="14" height="18" rx="3" />
        <circle cx="410" cy="270" r="7" /><rect x="403" y="274" width="14" height="18" rx="3" />
        <circle cx="465" cy="258" r="7" /><rect x="458" y="262" width="14" height="18" rx="3" />
      </g>
      <g fill="none" stroke="#3A362B" strokeWidth="3" strokeLinejoin="round">
        <path d="M615 250 L615 195 L658 165 L701 195 L701 250 Z" />
        <path d="M555 250h220v18h-220z" fill="#3A362B" opacity="0.15" stroke="none" />
      </g>
      <text x="400" y="42" textAnchor="middle" fontSize="21" fill="#3A362B" fontWeight="700" fontFamily="Georgia, serif">
        회화 이미지 준비 중 — 프로토타입 목업 일러스트
      </text>
    </svg>
  );
}
