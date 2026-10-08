import * as React from "react";
import { cva } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "cn";

/**
 * KOYO Studio Standard Button Primitive
 * Variants: primary, secondary, ghost, outline, danger
 * Sizes: sm (32px), md (38px), lg (44px), icon-sm (32px), icon-md (38px), icon-lg (44px)
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow] select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring focus-visible:border-brand disabled:pointer-events-none disabled:opacity-40 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-brand text-ink-on-accent font-semibold hover:bg-brand-hover active:bg-brand-active border border-brand-line",
        secondary:
          "bg-raised text-ink hover:bg-overlay active:bg-wash-press border border-line",
        ghost:
          "text-ink-muted hover:text-ink hover:bg-wash active:bg-wash-press border border-transparent",
        tertiary:
          "text-ink-muted hover:text-ink hover:bg-wash active:bg-wash-press border border-transparent",
        outline:
          "bg-transparent text-ink hover:bg-wash border border-line hover:border-line-strong active:bg-wash-press",
        danger:
          "bg-danger-soft text-danger hover:bg-danger-hover active:bg-danger-pressed border border-danger-line",
        default:
          "bg-raised text-ink hover:bg-overlay active:bg-wash-press border border-line",
        destructive:
          "bg-danger-soft text-danger hover:bg-danger-hover active:bg-danger-pressed border border-danger-line",
        link: "text-brand underline-offset-4 hover:underline border border-transparent",
      },
      size: {
        xs: "h-control-xs px-2 text-caption gap-1.5",
        sm: "h-control-sm px-3 text-label gap-1.5",
        md: "h-control-md px-4 text-body gap-2",
        lg: "h-control-lg px-6 text-body gap-2.5",
        default: "h-control-md px-4 text-body gap-2",
        icon: "size-control-md p-0",
        "icon-sm": "size-control-sm p-0",
        "icon-md": "size-control-md p-0",
        "icon-lg": "size-control-lg p-0",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  }
);

const SIZE_RADIUS = {
  xs: "rounded-md",
  sm: "rounded-md",
  md: "rounded-lg",
  lg: "rounded-lg",
  default: "rounded-lg",
  icon: "rounded-lg",
  "icon-xs": "rounded-md",
  "icon-sm": "rounded-md",
  "icon-md": "rounded-lg",
  "icon-lg": "rounded-lg",
};

function withoutRadiusUtilities(className = "") {
  return String(className)
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !/^!?rounded(?:-|$)/.test(token.slice(token.lastIndexOf(":") + 1)))
    .join(" ");
}

const Button = React.forwardRef(
  (
    {
      className,
      variant = "secondary",
      size = "md",
      shape = "control",
      as: As = "button",
      asChild = false,
      loading = false,
      disabled = false,
      fullWidth = false,
      children,
      type = "button",
      tabIndex,
      ...props
    },
    ref
  ) => {
    const variantAliases = { default: "secondary", destructive: "danger", link: "tertiary" };
    const sizeAliases = { default: "md", icon: "icon-md" };
    const supportedVariants = ["primary", "secondary", "ghost", "tertiary", "outline", "danger"];
    const resolvedVariant = variantAliases[variant] || (supportedVariants.includes(variant) ? variant : "secondary");
    const resolvedSize = sizeAliases[size] || size;
    const Component = asChild ? Slot.Root : As;
    const isDisabled = disabled || loading;

    return (
      <Component
        ref={ref}
        type={Component === "button" ? type : undefined}
        disabled={Component === "button" ? isDisabled : undefined}
        aria-disabled={Component === Slot.Root && isDisabled ? true : undefined}
        aria-busy={loading || undefined}
        tabIndex={Component === Slot.Root && isDisabled ? -1 : tabIndex}
        className={cn(
          buttonVariants({
            variant: resolvedVariant,
            size: resolvedSize,
            className: withoutRadiusUtilities(className),
          }),
          shape === "pill" ? "rounded-full" : SIZE_RADIUS[resolvedSize] || SIZE_RADIUS.md,
          fullWidth && "w-full",
          isDisabled && Component === Slot.Root && "pointer-events-none cursor-not-allowed opacity-40",
        )}
        {...props}
      >
        {asChild ? children : loading ? (
          <>
            <svg
              className="animate-spin -ml-0.5 mr-1.5 h-4 w-4 text-current"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>{children}</span>
          </>
        ) : (
          children
        )}
      </Component>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
export default Button;
