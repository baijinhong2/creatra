'use client';

import { ICON, RADIUS, type IconName } from'@/lib/design';
import type { ReactNode } from'react';

type Variant ='primary'|'secondary'|'ghost'|'danger';

type Props = {
 variant?: Variant;
 icon?: IconName;
 trailingIcon?: IconName;
 iconOnly?: boolean;
 size?:'sm'|'md';
 children?: ReactNode;
 onClick?: () => void;
 disabled?: boolean;
 typeAttr?:'button'|'submit'|'reset';
 className?: string;
 title?: string;
 ariaLabel?: string;
};

export function Button({
 variant ='secondary',
 icon,
 trailingIcon,
 iconOnly = false,
 size ='md',
 children,
 onClick,
 disabled = false,
 typeAttr ='button',
 className ='',
 title,
 ariaLabel,
}: Props) {
 const IconComp = icon ? ICON[icon] : null;
 const TrailingComp = trailingIcon ? ICON[trailingIcon] : null;
 const sizeClasses = size ==='sm'?'h-8 text-xs px-2.5':'h-10 text-sm px-4';
 const iconSize = size ==='sm'? 14 : 16;

 const variantClasses = {
 primary:'bg-amber-400 hover:bg-amber-500 text-zinc-900',
 secondary:'border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50',
 ghost:'text-zinc-600 hover:bg-zinc-100',
 danger:'text-red-700 hover:bg-red-50',
 }[variant];

 const baseClasses ='inline-flex items-center justify-center font-medium transition disabled:opacity-50 disabled:cursor-not-allowed';
 const shapeClasses = iconOnly ?'w-10 h-10': `${sizeClasses} gap-1.5 ${RADIUS.sm}`;

 return (
 <button
 type={typeAttr}
 onClick={onClick}
 disabled={disabled}
 title={title}
 aria-label={ariaLabel ?? title}
 className={`${baseClasses} ${shapeClasses} ${variantClasses} ${className}`}
 >
 {IconComp && <IconComp size={iconSize} strokeWidth={2} />}
 {!iconOnly && children}
 {TrailingComp && !iconOnly && <TrailingComp size={iconSize} strokeWidth={2} />}
 </button>
 );
}
