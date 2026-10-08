import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 font-medium whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs transition-colors select-none",
  {
    variants: {
      variant: {
        default: "bg-white/[0.08] text-gray-300 border border-white/[0.08]",
        accent: "bg-cyan-500/15 text-cyan-400 border border-cyan-500/25",
        success: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25",
        warning: "bg-amber-500/15 text-amber-400 border border-amber-500/25",
        danger: "bg-red-500/15 text-red-400 border border-red-500/25",
        info: "bg-blue-500/15 text-blue-400 border border-blue-500/25",
        outline: "bg-transparent text-gray-400 border border-white/[0.14]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function withoutRadiusUtilities(className = "") {
  return String(className)
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !/^!?rounded(?:-|$)/.test(token.slice(token.lastIndexOf(":") + 1)))
    .join(" ");
}

function Badge({ className, variant, children, ...props }) {
  return (
    <span className={cn(badgeVariants({ variant }), withoutRadiusUtilities(className))} {...props}>
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
export default Badge;
