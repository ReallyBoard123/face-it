import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "neo-button inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-black transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 uppercase tracking-wider",
  {
    variants: {
      variant: {
        default: "neo-blue text-black hover:neo-blue",
        destructive: "neo-pink text-black hover:bg-red-500",
        outline: "border-4 border-black bg-white text-black hover:neo-yellow",
        secondary: "neo-yellow text-black hover:bg-yellow-500",
        ghost: "border-4 border-transparent hover:neo-green hover:border-black text-black",
        link: "text-black underline-offset-4 hover:underline border-0 shadow-none hover:shadow-none",
        success: "neo-green text-black hover:bg-green-500",
        warning: "neo-orange text-black hover:bg-orange-500",
        purple: "neo-purple text-black hover:bg-purple-500",
        cyan: "neo-cyan text-black hover:bg-cyan-500",
      },
      size: {
        default: "h-12 px-6 py-3 text-base",
        sm: "h-10 px-4 py-2 text-sm",
        lg: "h-16 px-8 py-4 text-lg",
        icon: "h-12 w-12",
        xl: "h-20 px-12 py-6 text-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }