'use client';

import React from 'react';

/**
 * Detecta o tipo de serviço de streaming pelo nome ou texto
 */
export function detectService(name: any = ''): string {
  const text = String(name || '').toLowerCase();

  if (text.includes('netflix')) return 'netflix';
  if (text.includes('disney')) return 'disney';
  if (text.includes('prime') || text.includes('amazon')) return 'prime';
  if (text.includes('crunchy') || text.includes('crunchyroll')) return 'crunchyroll';
  if (text.includes('globo') || text.includes('globoplay')) return 'globoplay';
  if (text.includes('max') || text.includes('hbo')) return 'max';
  if (text.includes('spotify')) return 'spotify';
  if (text.includes('paramount')) return 'paramount';
  if (text.includes('apple') || text.includes('apple tv') || text.includes('appletv')) return 'apple';
  if (text.includes('youtube')) return 'youtube';
  if (text.includes('iptv') || text.includes('p2p') || text.includes('tv')) return 'iptv';

  return 'generic';
}

interface ProductIconProps {
  name?: string | null;
  className?: string;
  style?: React.CSSProperties;
}

export default function ProductIcon({ name = '', className = '', style = {} }: ProductIconProps) {
  const service = detectService(name);
  const safeName = String(name || '').trim();
  const initial = (safeName || 'P').charAt(0).toUpperCase();

  const baseStyle: React.CSSProperties = {
    width: '64px',
    height: '64px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '18px',
    overflow: 'hidden',
    boxShadow: '0 8px 20px rgba(0,0,0,0.15)',
    flexShrink: 0,
    ...style,
  };

  switch (service) {
    case 'netflix':
      return (
        <div style={{ ...baseStyle, background: '#0a0a0a' }} className={className}>
          <span style={{ color: '#e50914', fontFamily: 'Arial Black, sans-serif', fontSize: '38px', fontWeight: 900, transform: 'scaleX(0.72)', lineHeight: 1 }}>
            N
          </span>
        </div>
      );

    case 'disney':
      return (
        <div style={{ ...baseStyle, background: 'linear-gradient(145deg, #1d3fa9, #071a66)', color: '#fff', fontSize: '15px', fontWeight: 900, letterSpacing: '-0.5px' }} className={className}>
          <span>Disney+</span>
        </div>
      );

    case 'prime':
      return (
        <div style={{ ...baseStyle, background: '#0f172a', color: '#00a8e1', flexDirection: 'column', fontWeight: 900, fontSize: '14px', lineHeight: 1 }} className={className}>
          <span>prime</span>
          <div style={{ marginTop: '3px', width: '28px', height: '6px', borderBottom: '3px solid #00a8e1', borderRadius: '0 0 50% 50%' }} />
        </div>
      );

    case 'crunchyroll':
      return (
        <div style={{ ...baseStyle, background: '#ffffff', border: '1px solid #f0f0f0' }} className={className}>
          <div style={{ width: '32px', height: '32px', border: '6px solid #f47521', borderRadius: '50%', position: 'relative' }}>
            <div style={{ position: 'absolute', width: '16px', height: '16px', background: '#fff', borderRadius: '50%', right: '-4px' }} />
          </div>
        </div>
      );

    case 'globoplay':
      return (
        <div style={{ ...baseStyle, background: 'linear-gradient(135deg, #ff2e00, #ff8400)' }} className={className}>
          <span style={{ color: '#fff', fontWeight: 900, fontSize: '13px', letterSpacing: '-0.5px' }}>globo</span>
        </div>
      );

    case 'max':
      return (
        <div style={{ ...baseStyle, background: '#002be7', color: '#ffffff', fontSize: '20px', fontWeight: 900, letterSpacing: '1px' }} className={className}>
          <span>MAX</span>
        </div>
      );

    case 'spotify':
      return (
        <div style={{ ...baseStyle, background: '#121212', color: '#1db954' }} className={className}>
          <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor">
            <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.35-1.435-5.308-1.76-8.793-.963-.335.077-.67-.133-.746-.468-.077-.334.132-.67.467-.746 3.808-.87 7.076-.496 9.722 1.115.294.18.386.562.207.855zm1.227-2.73c-.227.368-.71.482-1.078.256-2.69-1.654-6.79-2.134-9.97-1.168-.413.125-.85-.11-975-.523-.125-.413.11-.85.523-.975 3.633-1.103 8.163-.566 11.244 1.332.368.226.482.71.256 1.078zm.106-2.836C14.692 8.95 9.375 8.775 6.297 9.71c-.496.15-1.022-.132-1.173-.628-.151-.496.132-1.022.628-1.173 3.532-1.072 9.404-.87 13.115 1.333.447.265.592.846.327 1.293-.266.447-.846.592-1.293.327z"/>
          </svg>
        </div>
      );

    case 'paramount':
      return (
        <div style={{ ...baseStyle, background: 'linear-gradient(135deg, #0064ff, #002b80)', color: '#fff', fontSize: '13px', fontWeight: 900 }} className={className}>
          <span>P+</span>
        </div>
      );

    case 'apple':
      return (
        <div style={{ ...baseStyle, background: '#000000', color: '#fff', fontSize: '13px', fontWeight: 800 }} className={className}>
          <span>tv+</span>
        </div>
      );

    case 'youtube':
      return (
        <div style={{ ...baseStyle, background: '#ff0000', color: '#fff' }} className={className}>
          <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
        </div>
      );

    case 'iptv':
      return (
        <div style={{ ...baseStyle, background: 'linear-gradient(135deg, #10b981, #047857)', color: '#fff', fontSize: '16px', fontWeight: 900 }} className={className}>
          <span>TV</span>
        </div>
      );

    default:
      return (
        <div style={{ ...baseStyle, background: 'linear-gradient(135deg, #dc2626, #991b1b)', color: '#fff', fontSize: '24px', fontWeight: 900 }} className={className}>
          <span>{initial}</span>
        </div>
      );
  }
}
