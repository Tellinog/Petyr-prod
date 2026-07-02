"use client";

import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PetyrCard } from "@/components/petyr/PetyrLayoutPrimitives";

type PetyrSelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: ReactNode;
  badge?: ReactNode;
  containerClassName?: string;
};

export function PetyrSelectField({
  label,
  badge,
  containerClassName,
  className,
  children,
  ...props
}: PetyrSelectFieldProps) {
  return (
    <label className={cn("space-y-2", containerClassName)}>
      <span className="flex items-center justify-between gap-3 text-sm text-slate-500">
        <span>{label}</span>
        {badge ? <Badge variant="outline">{badge}</Badge> : null}
      </span>
      <select
        className={cn(
          "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

type PetyrPreviousNextControlProps = {
  counter: ReactNode;
  helperText?: ReactNode;
  onPrevious?: () => void;
  onNext?: () => void;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
  previousLabel?: ReactNode;
  nextLabel?: ReactNode;
  className?: string;
};

export function PetyrPreviousNextControl({
  counter,
  helperText,
  onPrevious,
  onNext,
  previousDisabled = false,
  nextDisabled = false,
  previousLabel = "Previous",
  nextLabel = "Next",
  className
}: PetyrPreviousNextControlProps) {
  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-slate-50 p-3", className)}>
      <div className="mb-3 flex items-center gap-3">
        <Button
          variant="outline"
          className="min-w-[112px] rounded-xl"
          type="button"
          disabled={previousDisabled}
          onClick={onPrevious}
        >
          {previousLabel}
        </Button>
        <div className="flex-1 whitespace-nowrap rounded-xl bg-white px-3 py-2 text-center text-sm font-semibold text-slate-900 shadow-sm">
          {counter}
        </div>
        <Button
          variant="outline"
          className="min-w-[112px] rounded-xl"
          type="button"
          disabled={nextDisabled}
          onClick={onNext}
        >
          {nextLabel}
        </Button>
      </div>
      {helperText ? <div className="text-xs text-slate-500">{helperText}</div> : null}
    </div>
  );
}

type PetyrForecastNavigatorShellProps = {
  csmSlot: ReactNode;
  companySlot: ReactNode;
  navigationSlot: ReactNode;
  extraSlot?: ReactNode;
  sticky?: boolean;
  className?: string;
};

export function PetyrForecastNavigatorShell({
  csmSlot,
  companySlot,
  navigationSlot,
  extraSlot,
  sticky = false,
  className
}: PetyrForecastNavigatorShellProps) {
  return (
    <PetyrCard className={cn(sticky && "sticky top-4 z-30 bg-white/95 backdrop-blur", "bg-white/95", className)}>
      <CardContent
        className={cn(
          "grid grid-cols-1 gap-4 p-5 xl:items-end",
          extraSlot
            ? "xl:grid-cols-[220px_minmax(260px,0.62fr)_minmax(360px,1fr)_240px]"
            : "xl:grid-cols-[220px_minmax(260px,0.62fr)_minmax(640px,1fr)]"
        )}
      >
        {csmSlot}
        {companySlot}
        {navigationSlot}
        {extraSlot}
      </CardContent>
    </PetyrCard>
  );
}

type PetyrToggleSwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> & {
  checked: boolean;
  onCheckedChange?: (value: boolean) => void;
  label: ReactNode;
};

export function PetyrToggleSwitch({
  checked,
  onCheckedChange,
  label,
  disabled = false,
  className,
  ...props
}: PetyrToggleSwitchProps) {
  return (
    <button
      {...props}
      type="button"
      aria-pressed={checked}
      disabled={disabled}
      onClick={(event) => {
        props.onClick?.(event);
        if (!event.defaultPrevented && !disabled) onCheckedChange?.(!checked);
      }}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    >
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <span className={cn("relative inline-flex h-6 w-11 items-center rounded-full transition", checked ? "bg-emerald-500" : "bg-slate-300")}>
        <span className={cn("inline-block h-5 w-5 rounded-full bg-white shadow transition", checked ? "translate-x-5" : "translate-x-1")} />
      </span>
    </button>
  );
}
