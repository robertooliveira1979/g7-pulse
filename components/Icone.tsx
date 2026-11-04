const P: Record<string, React.ReactNode> = {
  home: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  in: <path d="M12 4v12M6 10l6 6 6-6M4 20h16" />,
  out: <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />,
  doc: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.6.8 2.6 2.6 3 5.2" /></>,
  truck: <><path d="M2 6h12v10H2zM14 10h4l3 3v3h-7z" /><circle cx="6" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
  bank: <path d="M3 9l9-5 9 5zM5 9v8M9.5 9v8M14.5 9v8M19 9v8M3 20h18" />,
  tree: <path d="M4 5h6M4 5v14M4 12h6M4 19h6M14 5h6M14 12h6M14 19h6" />,
  swap: <path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />,
  wallet: <><path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l12-3v3" /><circle cx="16.5" cy="13.5" r="1.3" /></>,
  pulse: <path d="M2 12h4l2-5 4 10 2-5h8" />,
  share: <><circle cx="12" cy="12" r="9" /><path d="M12 7v10M8.5 10.5c0-1.3 1.5-2 3.5-2s3.5.8 3.5 2-1.5 1.7-3.5 2-3.5.8-3.5 2 1.5 2 3.5 2 3.5-.7 3.5-2" /></>,
  upload: <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 12l5 5 9-10" />,
  alert: <><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.5" /></>,
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z" />,
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
};

export default function Icone({ n, size }: { n: keyof typeof P | string; size?: number }) {
  return (
    <svg className="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={size ? { width: size, height: size } : undefined} aria-hidden="true">
      {P[n]}
    </svg>
  );
}

export function Marca({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#12313F" />
      <path d="M7 39 H17 L21 33 L25 39 H29 L33 17 H51 L37 50 L41 39 H57" fill="none" stroke="#F5B83D" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
