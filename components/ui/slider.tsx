"use client"

import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"
import { cn } from "@/lib/utils"

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center",
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-3 w-full grow overflow-hidden border-2 border-black bg-white shadow-[2px_2px_0px_0px_#000]">
      <SliderPrimitive.Range className="absolute h-full bg-gradient-to-r from-cyan-400 to-purple-400" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="block h-6 w-6 border-4 border-black bg-yellow-400 shadow-[4px_4px_0px_0px_#000] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:shadow-[6px_6px_0px_0px_#000] hover:scale-110 cursor-grab active:cursor-grabbing" />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }