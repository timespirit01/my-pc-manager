import { useEffect, useState } from 'react';
import { isHex } from '../../core/color';

export const PALETTE_PRESETS = [
  { name: '따뜻한 주황', primary: '#E0602F', accent: '#F5C04A' },
  { name: '숲 초록', primary: '#2E7D5B', accent: '#F2A541' },
  { name: '산뜻한 파랑', primary: '#3A86FF', accent: '#FFBE0B' },
  { name: '로즈 핑크', primary: '#E64980', accent: '#FFD8A8' },
  { name: '보라', primary: '#7048E8', accent: '#63E6BE' },
  { name: '모노 블랙', primary: '#222222', accent: '#E0C08C' },
];

export function ColorField({ label, value, onChange, testId }: { label: string; value: string; onChange: (v: string) => void; testId?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="color-field">
      <span>{label}</span>
      <input type="color" value={isHex(value) && value.length === 7 ? value : '#000000'} onChange={(e) => onChange(e.target.value.toUpperCase())} />
      <input
        className="hex"
        data-testid={testId}
        value={text}
        maxLength={7}
        onChange={(e) => {
          const v = e.target.value.trim();
          setText(v);
          const withHash = v.startsWith('#') ? v : `#${v}`;
          if (isHex(withHash) && withHash.length === 7) onChange(withHash.toUpperCase());
        }}
        onBlur={() => setText(value)}
      />
    </div>
  );
}
