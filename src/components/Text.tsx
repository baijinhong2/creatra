import { FONT_SIZE, COLOR, type FontSize } from'@/lib/design';
import type { ReactNode } from'react';

// Text 只能用作文字颜色,排除 primary(主色按钮底色)、bg/surface/border(背景/边框)
type Tone ='text'|'muted'|'subtle'|'danger'|'success'|'warn';

type Props = {
 size?: FontSize;
 tone?: Tone;
 weight?:'normal'|'medium'|'semibold'|'bold';
 as?:'p'|'span'|'div'|'label'|'h1'|'h2'|'h3'|'h4';
 children: ReactNode;
 className?: string;
};

const WEIGHT_CLASS: Record<NonNullable<Props['weight']>, string> = {
 normal:'font-normal',
 medium:'font-medium',
 semibold:'font-semibold',
 bold:'font-bold',
};

export function Text({
 size ='small',
 tone ='text',
 weight,
 as: As ='p',
 children,
 className ='',
}: Props) {
 const weightClass = weight ? WEIGHT_CLASS[weight] :'';
  const color = COLOR[tone];
  return (
  <As className={`${FONT_SIZE[size]} ${color} ${weightClass} ${className}`}>
  {children}
  </As>
  );
}
