// Kuyumculuğa özel kategori ikonları (lucide'da olmayanlar için)
const S = ({ children, size = 30 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
export const CategoryIcon = ({ name, size }) => {
  switch (name) {
    case 'ring': return <S size={size}><circle cx="16" cy="19" r="8" /><path d="M13 9l3-4 3 4-3 2z" /></S>;
    case 'alyans': return <S size={size}><circle cx="12.5" cy="17" r="7" /><circle cx="19.5" cy="15" r="7" /></S>;
    case 'diamond': return <S size={size}><path d="M6 12l4-6h12l4 6-10 14z" /><path d="M6 12h20M13 6l-2 6 5 14M19 6l2 6-5 14" /></S>;
    case 'necklace': return <S size={size}><path d="M5 5c2 9 7 13 11 13s9-4 11-13" /><path d="M16 18v2" /><path d="M16 20l-3 4 3 3 3-3z" /></S>;
    case 'bracelet': return <S size={size}><ellipse cx="16" cy="16" rx="11" ry="7" /><circle cx="9" cy="20" r="1.3" /><circle cx="16" cy="23" r="1.3" /><circle cx="23" cy="20" r="1.3" /></S>;
    case 'bangle': return <S size={size}><ellipse cx="16" cy="16" rx="11" ry="7" /><ellipse cx="16" cy="16" rx="8" ry="4.5" /></S>;
    case 'earring': return <S size={size}><circle cx="11" cy="6" r="1.5" /><path d="M11 8v4M11 12c-3 4-3 8 0 10 3-2 3-6 0-10zM21 6a1.5 1.5 0 100 .1M21 8v4M21 12c-3 4-3 8 0 10 3-2 3-6 0-10z" /></S>;
    case 'set': return <S size={size}><path d="M5 4c2 7 6 10 11 10s9-3 11-10" /><path d="M16 14l-2 3 2 2 2-2z" /><ellipse cx="16" cy="25" rx="7" ry="3" /></S>;
    case 'coin': return <S size={size}><circle cx="16" cy="16" r="11" /><circle cx="16" cy="16" r="8" /><path d="M13 16h6M16 13v6" /></S>;
    case 'silver': return <S size={size}><path d="M5 22l3-10h16l3 10z" /><path d="M8 12l2-5h12l2 5" /></S>;
    default: return <S size={size}><circle cx="16" cy="16" r="10" /></S>;
  }
};
export const WhatsAppIcon = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.5 3.5A11.8 11.8 0 0012 0C5.4 0 .1 5.3.1 11.9c0 2.1.6 4.1 1.6 5.9L0 24l6.4-1.7a11.9 11.9 0 005.6 1.4h.1c6.5 0 11.9-5.3 11.9-11.9 0-3.2-1.3-6.2-3.5-8.3zM12 21.7c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.8 1 1-3.7-.2-.4a9.8 9.8 0 01-1.5-5.2c0-5.4 4.4-9.9 9.9-9.9 2.6 0 5.1 1 7 2.9a9.8 9.8 0 012.9 7c0 5.5-4.4 9.9-9.9 9.9zm5.4-7.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1l-.9 1.2c-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1-.2-.3-.2-.6-.4z" /></svg>
);
export const InstagramIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" /></svg>
);
