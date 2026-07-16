import { RADIUS } from'@/lib/design';
import type { ReactNode } from'react';

type Props = {
 children: ReactNode;
 className?: string;
 highlight?: boolean;
 padding?:'sm'|'md'|'lg';
};

export function Card({ children, className ='', highlight = false, padding ='md'}: Props) {
 const padClass = { sm:'p-3', md:'p-4', lg:'p-5'}[padding];
 const baseClass = `${RADIUS.lg} border bg-white ${padClass}`;
 const borderClass = highlight
 ?'border-zinc-200':'border-zinc-200';
 return <div className={`${baseClass} ${borderClass} ${className}`}>{children}</div>;
}
