import type { ReactNode } from "react";
import { useMediaQuery } from "@/lib/prefs";

export const useIsMobile = () => useMediaQuery("(max-width: 767px)");

// Every top-level page scrolls in PAGE_SCROLL and puts its content in PAGE_COLUMN, so content starts at the same
// left edge and has the same width on every page. The scrollbar's gutter is always kept, so a page that scrolls
// isn't narrower than one that doesn't.
// relative: hidden form controls, such as a select's native copy, are placed inside it instead of stretching the whole window.
export const PAGE_SCROLL = "relative h-full overflow-auto [scrollbar-gutter:stable]";
export const PAGE_COLUMN = "mx-auto w-full max-w-[1180px] px-4 md:px-8";
// A band that stays put above or below a page's scrolling part (an opened page's header, the reply box) keeps the
// same gutter, so its PAGE_COLUMN lines up with the column that scrolls under it.
export const PAGE_BAND = "overflow-hidden [scrollbar-gutter:stable]";

/**
 * Standard header for an opened item (a project, a conversation, a file). Its title starts at the same left edge as
 * a top-level page's. `fixed`: the header sits outside the page's scrolling part.
 */
export function DetailHeader({ title, sub, actions, children, fixed }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; children?: ReactNode; fixed?: boolean }) {
  return (
    <header className={`flex-none border-b border-line ${fixed ? PAGE_BAND : ""}`}>
      <div className={`${PAGE_COLUMN} flex flex-col gap-3 py-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-[20px] font-semibold tracking-[-0.01em]">{title}</h1>
            {sub && <div className="mt-1 text-[13px] text-muted-foreground">{sub}</div>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {children}
      </div>
    </header>
  );
}

/** A page with no list pane. */
export function Page({ title, sub, actions, children }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className={PAGE_SCROLL}>
      <div className={`${PAGE_COLUMN} py-6`}>
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[24px] font-semibold tracking-[-0.01em]">{title}</h1>
            {sub && <p className="mt-1 text-muted-foreground">{sub}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
        {children}
      </div>
    </div>
  );
}
