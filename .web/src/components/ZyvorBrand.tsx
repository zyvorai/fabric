/**
 * Zyvor product suite branding — logo at /zyvor-logo.png (Vite public/).
 */
import React from 'react';

const ZYVOR_URL = 'https://zyvor.dev';
const ZYVOR_COPY = '© @zyvor 2026';

const linkStyle: React.CSSProperties = {
  color: 'inherit',
  textDecoration: 'none',
  opacity: 0.9,
};

export function ZyvorFooter({ product, className = '' }: { product?: string; className?: string }) {
  return (
    <footer
      className={`zyvor-footer ${className}`.trim()}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px 16px',
        padding: '14px 20px',
        marginTop: 'auto',
        borderTop: '1px solid rgba(148, 163, 184, 0.15)',
        fontSize: '12px',
        color: 'rgba(148, 163, 184, 0.9)',
      }}
      role="contentinfo"
    >
      <a href={ZYVOR_URL} target="_blank" rel="noopener noreferrer" title="Zyvor — zyvor.dev">
        <img src="/zyvor-logo.png" alt="Zyvor" style={{ height: 26, width: 'auto', display: 'block' }} />
      </a>
      <span>
        <a href={ZYVOR_URL} target="_blank" rel="noopener noreferrer" style={linkStyle}>
          {ZYVOR_COPY}
        </a>
        {product ? <span style={{ opacity: 0.55, marginLeft: 8 }}>· {product}</span> : null}
      </span>
    </footer>
  );
}

export default ZyvorFooter;
