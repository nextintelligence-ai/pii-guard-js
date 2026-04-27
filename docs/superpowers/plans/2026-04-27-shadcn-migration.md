# shadcn/ui 마이그레이션 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 PDF 익명화 도구의 UI(Toolbar/Sidebar/Modals)를 shadcn/ui 기반으로 재구성하여 시각/접근성/UX 를 개선하면서 단일 HTML(`file://`) 동작과 13.1MB 빌드 사이즈 가드를 유지한다.

**Architecture:** Phase 0(기반 설정) → 1(비파괴적 primitive 추가) → 2(Toolbar) → 3(Sidebar+CandidatePanel) → 4(Modals+Sonner). 각 Phase 종료 시 `npm test`, `npm run lint`, `npm run build` 통과를 강제하고 `dist/index.html` 사이즈가 18MB 가드 안에 머무는지 확인한다. `BoxOverlay.tsx` 와 PDF 처리 코어는 손대지 않는다.

**Tech Stack:** React 19 + TypeScript + Vite 5 + Tailwind 3.4 + Radix UI primitives + lucide-react + class-variance-authority + tailwindcss-animate + sonner. Light theme only.

**Decisions (사용자 확정):**
- 다크 모드 미도입 (라이트 전용)
- Phase 0~4 일괄 진행
- Sonner 토스트 도입
- CandidatePanel 카테고리 안에서 페이지 그룹화 + Collapsible

---

## File Structure

### 신규 (Create)
- `src/lib/utils.ts` — `cn()` 헬퍼
- `components.json` — shadcn CLI 설정 (기록용; 우리는 수동 추가하지만 일관성 보존)
- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/badge.tsx`
- `src/components/ui/alert.tsx`
- `src/components/ui/separator.tsx`
- `src/components/ui/label.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/select.tsx`
- `src/components/ui/checkbox.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/tooltip.tsx`
- `src/components/ui/scroll-area.tsx`
- `src/components/ui/collapsible.tsx`
- `src/components/ui/progress.tsx`
- `src/components/ui/sonner.tsx`

### 수정 (Modify)
- `package.json` — Radix/lucide/cva/clsx/tailwind-merge/tailwindcss-animate/sonner 추가
- `tailwind.config.js` — shadcn 토큰 + animate 플러그인
- `src/styles/index.css` — CSS 변수 (라이트만)
- `tsconfig.json` — paths 확인 (이미 `@/*` 존재)
- `src/components/Toolbar.tsx` — Button/Select/Tooltip
- `src/components/MaskStylePicker.tsx` — Select
- `src/components/CandidatePanel.tsx` — Card/Checkbox/Label/Collapsible/Badge
- `src/components/ReportModal.tsx` — Dialog
- `src/components/UsageGuideModal.tsx` — Dialog/Alert
- `src/components/PageNavigator.tsx` — Button + Input
- `src/components/DropZone.tsx` — Card 외곽
- `src/App.tsx` — `<Toaster />` 추가, 사이드바 layout
- `src/hooks/useApply.ts` — 토스트 호출 추가
- `scripts/verify-build-size.mjs` — 한도 확인 (변경 불필요)

### 손대지 않음 (Untouched)
- `src/components/BoxOverlay.tsx`
- `src/components/PdfCanvas.tsx`
- `src/core/**`
- `src/state/**`
- `src/workers/**`
- `vite.config.ts` (싱글파일 + 워커 우회 그대로)
- `tests/**`

---

## Phase 0 — 기반 설정

### Task 0.1: 의존성 설치

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 의존성 추가**

Run:
```bash
npm install \
  @radix-ui/react-dialog \
  @radix-ui/react-select \
  @radix-ui/react-checkbox \
  @radix-ui/react-label \
  @radix-ui/react-tooltip \
  @radix-ui/react-progress \
  @radix-ui/react-scroll-area \
  @radix-ui/react-collapsible \
  @radix-ui/react-slot \
  class-variance-authority \
  clsx \
  tailwind-merge \
  lucide-react \
  sonner
npm install -D tailwindcss-animate
```

- [ ] **Step 2: 검증**

Run: `npm test && npm run lint`
Expected: 41 tests pass, tsc clean

- [ ] **Step 3: 커밋**

```bash
git add package.json package-lock.json
git commit -m "chore: shadcn/ui 마이그레이션을 위한 의존성 추가"
```

---

### Task 0.2: Tailwind 설정 갱신

**Files:**
- Modify: `tailwind.config.js`

- [ ] **Step 1: 설정 교체**

Replace `tailwind.config.js` with:

```js
/** @type {import('tailwindcss').Config} */
import animate from 'tailwindcss-animate';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1rem',
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [animate],
};
```

- [ ] **Step 2: 빌드 검증**

Run: `npm run build`
Expected: dist/index.html 생성, postbuild 검증 통과

- [ ] **Step 3: 커밋**

```bash
git add tailwind.config.js
git commit -m "feat: Tailwind 에 shadcn 디자인 토큰과 animate 플러그인 추가"
```

---

### Task 0.3: CSS 변수 추가 (라이트 전용)

**Files:**
- Modify: `src/styles/index.css`

- [ ] **Step 1: 파일 교체**

Replace `src/styles/index.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 47.4% 11.2%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 47.4% 11.2%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --warning: 38 92% 50%;
    --warning-foreground: 48 96% 89%;
    --ring: 215 20.2% 65.1%;
    --radius: 0.5rem;
  }

  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground;
  }
}

html, body, #root { height: 100%; }
```

- [ ] **Step 2: 빌드 검증**

Run: `npm run build && npm test`
Expected: 빌드 + 41 tests pass

- [ ] **Step 3: 커밋**

```bash
git add src/styles/index.css
git commit -m "feat: shadcn CSS 변수 추가 (라이트 모드 전용)"
```

---

### Task 0.4: cn() 유틸 + components.json

**Files:**
- Create: `src/lib/utils.ts`
- Create: `components.json`

- [ ] **Step 1: cn() 작성**

Create `src/lib/utils.ts`:

```ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 2: components.json 작성**

Create `components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/styles/index.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui"
  },
  "iconLibrary": "lucide"
}
```

- [ ] **Step 3: 검증**

Run: `npm run lint`
Expected: tsc clean

- [ ] **Step 4: 커밋**

```bash
git add src/lib/utils.ts components.json
git commit -m "feat: cn() 유틸과 shadcn components.json 추가"
```

---

### Task 0.5: Phase 0 회귀 검증

- [ ] **Step 1: 전체 검증 파이프라인**

Run: `npm test && npm run lint && npm run build`
Expected:
- 41 tests pass
- tsc clean
- dist/index.html 생성, 외부 URL 0개, 사이즈 < 18MB

- [ ] **Step 2: file:// 수동 검증**

```bash
open dist/index.html
```
Expected: 기존 UI 그대로 동작 (PDF 업로드 → 자동 탐지 → 적용 → 다운로드 가능)

- [ ] **Step 3: Phase 0 마감 커밋**

이미 모든 변경이 커밋됨. `git log --oneline | head -5` 으로 확인.

---

## Phase 1 — shadcn primitive 컴포넌트 추가

### Task 1.1: Button 컴포넌트

**Files:**
- Create: `src/components/ui/button.tsx`

- [ ] **Step 1: Button 작성**

Create `src/components/ui/button.tsx`:

```tsx
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:
          'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
```

- [ ] **Step 2: 검증**

Run: `npm run lint`
Expected: tsc clean

- [ ] **Step 3: 커밋**

```bash
git add src/components/ui/button.tsx
git commit -m "feat(ui): Button 컴포넌트 추가"
```

---

### Task 1.2: Card / Badge / Alert / Separator / Label / Input

**Files:**
- Create: `src/components/ui/card.tsx`
- Create: `src/components/ui/badge.tsx`
- Create: `src/components/ui/alert.tsx`
- Create: `src/components/ui/separator.tsx`
- Create: `src/components/ui/label.tsx`
- Create: `src/components/ui/input.tsx`

- [ ] **Step 1: Card 작성**

Create `src/components/ui/card.tsx`:

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('text-lg font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  ),
);
CardTitle.displayName = 'CardTitle';

export const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  ),
);
CardFooter.displayName = 'CardFooter';
```

- [ ] **Step 2: Badge 작성**

Create `src/components/ui/badge.tsx`:

```tsx
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps): JSX.Element {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
```

- [ ] **Step 3: Alert 작성**

Create `src/components/ui/alert.tsx`:

```tsx
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const alertVariants = cva(
  'relative w-full rounded-lg border px-4 py-3 text-sm [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground [&>svg~*]:pl-7',
  {
    variants: {
      variant: {
        default: 'bg-background text-foreground',
        destructive:
          'border-destructive/50 text-destructive [&>svg]:text-destructive bg-destructive/5',
        warning: 'border-amber-200 bg-amber-50 text-amber-900 [&>svg]:text-amber-700',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
));
Alert.displayName = 'Alert';

export const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn('mb-1 font-medium leading-none tracking-tight', className)}
    {...props}
  />
));
AlertTitle.displayName = 'AlertTitle';

export const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('text-sm [&_p]:leading-relaxed', className)} {...props} />
));
AlertDescription.displayName = 'AlertDescription';
```

- [ ] **Step 4: Separator 작성**

Create `src/components/ui/separator.tsx`:

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Separator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { orientation?: 'horizontal' | 'vertical' }
>(({ className, orientation = 'horizontal', ...props }, ref) => (
  <div
    ref={ref}
    role="separator"
    aria-orientation={orientation}
    className={cn(
      'shrink-0 bg-border',
      orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
      className,
    )}
    {...props}
  />
));
Separator.displayName = 'Separator';
```

- [ ] **Step 5: Label 작성**

Create `src/components/ui/label.tsx`:

```tsx
import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const labelVariants = cva(
  'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
);

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn(labelVariants(), className)} {...props} />
));
Label.displayName = LabelPrimitive.Root.displayName;
```

- [ ] **Step 6: Input 작성**

Create `src/components/ui/input.tsx`:

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
```

- [ ] **Step 7: 검증**

Run: `npm run lint && npm run build`
Expected: tsc clean, dist 빌드 통과, 사이즈 가드 통과

- [ ] **Step 8: 커밋**

```bash
git add src/components/ui/{card,badge,alert,separator,label,input}.tsx
git commit -m "feat(ui): Card/Badge/Alert/Separator/Label/Input primitive 추가"
```

---

### Task 1.3: Radix 기반 컴포넌트 (Tooltip / Checkbox / Select / Dialog / ScrollArea / Collapsible / Progress / Sonner)

**Files:**
- Create: `src/components/ui/tooltip.tsx`
- Create: `src/components/ui/checkbox.tsx`
- Create: `src/components/ui/select.tsx`
- Create: `src/components/ui/dialog.tsx`
- Create: `src/components/ui/scroll-area.tsx`
- Create: `src/components/ui/collapsible.tsx`
- Create: `src/components/ui/progress.tsx`
- Create: `src/components/ui/sonner.tsx`

- [ ] **Step 1: Tooltip**

Create `src/components/ui/tooltip.tsx`:

```tsx
import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;
```

- [ ] **Step 2: Checkbox**

Create `src/components/ui/checkbox.tsx`:

```tsx
import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer h-4 w-4 shrink-0 rounded-sm border border-primary shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className={cn('flex items-center justify-center text-current')}>
      <Check className="h-3.5 w-3.5" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;
```

- [ ] **Step 3: Select**

Create `src/components/ui/select.tsx`:

```tsx
import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn('flex cursor-default items-center justify-center py-1', className)}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
));

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn('flex cursor-default items-center justify-center py-1', className)}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
));

export const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        'relative z-50 max-h-[var(--radix-select-content-available-height)] min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        position === 'popper' &&
          'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
        className,
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn('p-1', position === 'popper' && 'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]')}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

export const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  >
    <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;
```

- [ ] **Step 4: Dialog**

Create `src/components/ui/dialog.tsx`:

```tsx
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg',
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): JSX.Element {
  return (
    <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
  );
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): JSX.Element {
  return (
    <div
      className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
      {...props}
    />
  );
}

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;
```

- [ ] **Step 5: ScrollArea**

Create `src/components/ui/scroll-area.tsx`:

```tsx
import * as React from 'react';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import { cn } from '@/lib/utils';

export const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    className={cn('relative overflow-hidden', className)}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

export const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = 'vertical', ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      'flex touch-none select-none transition-colors',
      orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent p-[1px]',
      orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent p-[1px]',
      className,
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;
```

- [ ] **Step 6: Collapsible**

Create `src/components/ui/collapsible.tsx`:

```tsx
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';

export const Collapsible = CollapsiblePrimitive.Root;
export const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger;
export const CollapsibleContent = CollapsiblePrimitive.CollapsibleContent;
```

- [ ] **Step 7: Progress**

Create `src/components/ui/progress.tsx`:

```tsx
import * as React from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cn } from '@/lib/utils';

export const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn('relative h-2 w-full overflow-hidden rounded-full bg-primary/20', className)}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="h-full w-full flex-1 bg-primary transition-all"
      style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;
```

- [ ] **Step 8: Sonner Toaster 래퍼**

Create `src/components/ui/sonner.tsx`:

```tsx
import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

export function Toaster(props: ToasterProps): JSX.Element {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  );
}

export { toast } from 'sonner';
```

- [ ] **Step 9: 검증**

Run: `npm run lint && npm run build`
Expected: tsc clean, dist 생성, 18MB 가드 통과

- [ ] **Step 10: 커밋**

```bash
git add src/components/ui/{tooltip,checkbox,select,dialog,scroll-area,collapsible,progress,sonner}.tsx
git commit -m "feat(ui): Radix 기반 컴포넌트 (Tooltip/Checkbox/Select/Dialog/ScrollArea/Collapsible/Progress/Sonner) 추가"
```

---

### Task 1.4: Phase 1 회귀 검증

- [ ] **Step 1: 풀 검증**

Run: `npm test && npm run lint && npm run build`
Expected: 41 tests pass, tsc clean, 빌드 통과, 사이즈 < 18MB

- [ ] **Step 2: file:// 검증**

Run: `open dist/index.html`
Expected: 기존 UI 그대로 동작 (아직 어떤 컴포넌트도 교체되지 않음)

- [ ] **Step 3: 사이즈 기록**

Run: `du -h dist/index.html`
기록: 현재 사이즈 vs 13.1MB 기준선 비교

---

## Phase 2 — Toolbar 마이그레이션

### Task 2.1: MaskStylePicker 를 Select 로 교체

**Files:**
- Modify: `src/components/MaskStylePicker.tsx`

- [ ] **Step 1: 컴포넌트 재작성**

Replace `src/components/MaskStylePicker.tsx`:

```tsx
import { useAppStore } from '@/state/store';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type MaskKind = 'blackout' | 'label' | 'pattern';

const LABELS: Record<MaskKind, string> = {
  blackout: '검은 박스',
  label: '[라벨]',
  pattern: 'XXX 패턴',
};

export function MaskStylePicker(): JSX.Element {
  const m = useAppStore((s) => s.maskStyle);
  const set = useAppStore((s) => s.setMaskStyle);

  const onChange = (k: MaskKind): void => {
    if (k === 'blackout') set({ kind: 'blackout' });
    else if (k === 'label') set({ kind: 'label', label: '[익명]' });
    else set({ kind: 'pattern', pattern: 'XXX-XX-XXXX' });
  };

  return (
    <Select value={m.kind} onValueChange={(v) => onChange(v as MaskKind)}>
      <SelectTrigger className="h-8 w-[140px] text-xs" aria-label="마스킹 스타일">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="blackout">{LABELS.blackout}</SelectItem>
        <SelectItem value="label">{LABELS.label}</SelectItem>
        <SelectItem value="pattern">{LABELS.pattern}</SelectItem>
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 2: 검증**

Run: `npm test && npm run lint`
Expected: 41 tests pass, tsc clean

- [ ] **Step 3: 커밋**

```bash
git add src/components/MaskStylePicker.tsx
git commit -m "feat(ui): MaskStylePicker 를 shadcn Select 로 교체"
```

---

### Task 2.2: Toolbar 를 Button + Tooltip 으로 교체

**Files:**
- Modify: `src/components/Toolbar.tsx`

- [ ] **Step 1: 재작성**

Replace `src/components/Toolbar.tsx`:

```tsx
import { useRef } from 'react';
import { Upload, Undo2, Redo2, HelpCircle, Shield, Download } from 'lucide-react';
import { useAppStore } from '@/state/store';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { MaskStylePicker } from './MaskStylePicker';

type Props = {
  onLoad(f: File): void;
  onApply(): void;
  onDownload(): void;
  onHelp(): void;
};

export function Toolbar({ onLoad, onApply, onDownload, onHelp }: Props): JSX.Element {
  const docKind = useAppStore((s) => s.doc.kind);
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center gap-2 border-b bg-background px-4 py-2 shadow-sm">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onLoad(f);
            e.target.value = '';
          }}
        />
        <Button size="sm" onClick={() => inputRef.current?.click()}>
          <Upload />
          업로드
        </Button>

        <Separator orientation="vertical" className="h-6" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              onClick={() => useAppStore.getState().undo()}
              aria-label="되돌리기"
            >
              <Undo2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>되돌리기 (⌘Z)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              onClick={() => useAppStore.getState().redo()}
              aria-label="다시 실행"
            >
              <Redo2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>다시 실행 (⇧⌘Z)</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-6" />

        <MaskStylePicker />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" onClick={onHelp} aria-label="사용법">
              <HelpCircle />
            </Button>
          </TooltipTrigger>
          <TooltipContent>사용법 안내</TooltipContent>
        </Tooltip>

        <div className="flex-1" />

        <Button
          size="sm"
          variant="destructive"
          onClick={onApply}
          disabled={docKind !== 'ready'}
        >
          <Shield />
          익명화 적용
        </Button>
        <Button size="sm" onClick={onDownload} disabled={docKind !== 'done'}>
          <Download />
          다운로드
        </Button>
      </div>
    </TooltipProvider>
  );
}
```

- [ ] **Step 2: 검증**

Run: `npm test && npm run lint && npm run build`
Expected: 41 tests pass, tsc clean, 빌드 통과

- [ ] **Step 3: file:// 검증**

Run: `open dist/index.html`
Expected: Toolbar 가 새 디자인. 업로드/Undo/Redo/마스킹/사용법/적용/다운로드 모두 동작. Tooltip hover 동작.

- [ ] **Step 4: 커밋**

```bash
git add src/components/Toolbar.tsx
git commit -m "feat(ui): Toolbar 를 shadcn Button/Tooltip/Separator 로 교체"
```

---

## Phase 3 — Sidebar / CandidatePanel

### Task 3.1: PageNavigator 교체

**Files:**
- Modify: `src/components/PageNavigator.tsx`

- [ ] **Step 1: 재작성**

Replace `src/components/PageNavigator.tsx`:

```tsx
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppStore } from '@/state/store';
import { Button } from '@/components/ui/button';

export function PageNavigator(): JSX.Element | null {
  const doc = useAppStore((s) => s.doc);
  const cur = useAppStore((s) => s.currentPage);
  const go = useAppStore((s) => s.goToPage);
  if (doc.kind !== 'ready') return null;

  return (
    <div className="mt-2 flex items-center justify-center gap-2 text-sm">
      <Button
        size="icon"
        variant="outline"
        onClick={() => go(Math.max(0, cur - 1))}
        disabled={cur === 0}
        aria-label="이전 페이지"
      >
        <ChevronLeft />
      </Button>
      <span className="tabular-nums text-muted-foreground">
        {cur + 1} / {doc.pages.length}
      </span>
      <Button
        size="icon"
        variant="outline"
        onClick={() => go(Math.min(doc.pages.length - 1, cur + 1))}
        disabled={cur >= doc.pages.length - 1}
        aria-label="다음 페이지"
      >
        <ChevronRight />
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: 검증**

Run: `npm test && npm run lint`
Expected: 41 tests pass, tsc clean

- [ ] **Step 3: 커밋**

```bash
git add src/components/PageNavigator.tsx
git commit -m "feat(ui): PageNavigator 를 shadcn Button + lucide 아이콘으로 교체"
```

---

### Task 3.2: DropZone 시각 개선

**Files:**
- Modify: `src/components/DropZone.tsx`

- [ ] **Step 1: 재작성**

Replace `src/components/DropZone.tsx`:

```tsx
import { useCallback, useRef, useState } from 'react';
import { FileText, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = { onFile(file: File): void };

export function DropZone({ onFile }: Props): JSX.Element {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      const f = e.dataTransfer.files?.[0];
      if (f && f.type === 'application/pdf') onFile(f);
    },
    [onFile],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        'flex w-full max-w-md cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed p-12 text-center transition-colors',
        drag
          ? 'border-primary bg-primary/5'
          : 'border-muted-foreground/30 bg-background hover:border-primary/50 hover:bg-accent/30',
      )}
    >
      {drag ? (
        <Upload className="h-10 w-10 text-primary" />
      ) : (
        <FileText className="h-10 w-10 text-muted-foreground" />
      )}
      <div>
        <p className="font-medium text-foreground">PDF 파일을 여기에 드롭하세요</p>
        <p className="mt-1 text-sm text-muted-foreground">또는 클릭해서 선택</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: 검증**

Run: `npm test && npm run lint`
Expected: 41 tests pass, tsc clean

- [ ] **Step 3: 커밋**

```bash
git add src/components/DropZone.tsx
git commit -m "feat(ui): DropZone 에 lucide 아이콘과 토큰화된 색상 적용"
```

---

### Task 3.3: CandidatePanel 페이지 그룹화 + Collapsible

**Files:**
- Modify: `src/components/CandidatePanel.tsx`

- [ ] **Step 1: 재작성**

Replace `src/components/CandidatePanel.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ChevronRight } from 'lucide-react';
import { useAppStore } from '@/state/store';
import type { DetectionCategory, RedactionBox } from '@/types/domain';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

const LABELS: Record<DetectionCategory, string> = {
  rrn: '주민등록번호',
  phone: '전화번호',
  email: '이메일',
  account: '계좌번호',
  businessNo: '사업자번호',
  card: '카드번호',
};

const CAT_COLORS: Record<DetectionCategory, string> = {
  rrn: 'bg-red-500',
  phone: 'bg-orange-500',
  email: 'bg-blue-500',
  account: 'bg-green-500',
  businessNo: 'bg-purple-500',
  card: 'bg-yellow-500',
};

const CATS: DetectionCategory[] = ['rrn', 'phone', 'email', 'account', 'businessNo', 'card'];

type AutoBox = RedactionBox & { category: DetectionCategory };

export function CandidatePanel(): JSX.Element {
  const boxes = useAppStore(
    useShallow((s) =>
      Object.values(s.boxes).filter(
        (b): b is AutoBox => b.source === 'auto' && b.category !== undefined,
      ),
    ),
  );
  const cats = useAppStore((s) => s.categoryEnabled);
  const toggle = useAppStore((s) => s.toggleBox);
  const toggleCat = useAppStore((s) => s.toggleCategory);
  const goToPage = useAppStore((s) => s.goToPage);

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold">자동 탐지 결과</h2>
      {CATS.map((cat) => {
        const items = boxes.filter((b) => b.category === cat);
        return (
          <CategoryGroup
            key={cat}
            cat={cat}
            items={items}
            enabled={cats[cat]}
            onToggleCategory={() => toggleCat(cat)}
            onToggleBox={toggle}
            onGoTo={goToPage}
          />
        );
      })}
    </div>
  );
}

type GroupProps = {
  cat: DetectionCategory;
  items: AutoBox[];
  enabled: boolean;
  onToggleCategory(): void;
  onToggleBox(id: string): void;
  onGoTo(page: number): void;
};

function CategoryGroup({
  cat,
  items,
  enabled,
  onToggleCategory,
  onToggleBox,
  onGoTo,
}: GroupProps): JSX.Element {
  const [open, setOpen] = useState(items.length > 0 && items.length <= 30);

  const byPage = useMemo(() => {
    const map = new Map<number, AutoBox[]>();
    for (const b of items) {
      const arr = map.get(b.pageIndex) ?? [];
      arr.push(b);
      map.set(b.pageIndex, arr);
    }
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [items]);

  const id = `cat-${cat}`;

  return (
    <div className="rounded-md border bg-card">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Checkbox
            id={id}
            checked={enabled}
            onCheckedChange={onToggleCategory}
            disabled={items.length === 0}
          />
          <span className={cn('h-2 w-2 rounded-full', CAT_COLORS[cat])} />
          <Label htmlFor={id} className="flex-1 cursor-pointer text-sm">
            {LABELS[cat]}
          </Label>
          <Badge variant="secondary">{items.length}</Badge>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="rounded p-1 hover:bg-accent"
              disabled={items.length === 0}
              aria-label={open ? '접기' : '펼치기'}
            >
              <ChevronRight
                className={cn('h-4 w-4 transition-transform', open && 'rotate-90')}
              />
            </button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <div className="border-t bg-muted/30 px-2 py-1.5">
            {byPage.map(([page, group]) => (
              <div key={page} className="py-1">
                <button
                  type="button"
                  className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                  onClick={() => onGoTo(page)}
                >
                  p{page + 1} ({group.length})
                </button>
                <ul className="ml-2 mt-1 space-y-1">
                  {group.map((b) => (
                    <li key={b.id} className="flex items-center gap-2">
                      <Checkbox
                        id={b.id}
                        checked={b.enabled}
                        onCheckedChange={() => onToggleBox(b.id)}
                      />
                      <Label
                        htmlFor={b.id}
                        className="cursor-pointer text-xs font-normal text-muted-foreground"
                      >
                        박스 #{b.id.slice(-6)}
                      </Label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
```

- [ ] **Step 2: 검증**

Run: `npm test && npm run lint`
Expected: 41 tests pass, tsc clean

- [ ] **Step 3: 커밋**

```bash
git add src/components/CandidatePanel.tsx
git commit -m "feat(ui): CandidatePanel 카테고리/페이지 그룹화 + Collapsible 적용"
```

---

### Task 3.4: App.tsx 사이드바 layout 정리

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: 재작성**

Replace `src/App.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@/state/store';
import { Toolbar } from '@/components/Toolbar';
import { DropZone } from '@/components/DropZone';
import { PdfCanvas } from '@/components/PdfCanvas';
import { CandidatePanel } from '@/components/CandidatePanel';
import { PageNavigator } from '@/components/PageNavigator';
import { ReportModal } from '@/components/ReportModal';
import { UsageGuideModal } from '@/components/UsageGuideModal';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Toaster } from '@/components/ui/sonner';
import { usePdfDocument } from '@/hooks/usePdfDocument';
import { useAutoDetect } from '@/hooks/useAutoDetect';
import { useApply } from '@/hooks/useApply';
import { useKeyboard } from '@/hooks/useKeyboard';
import { hasSeenUsageGuide, markUsageGuideSeen } from '@/utils/usageGuideStorage';

export default function App(): JSX.Element {
  useKeyboard();
  useAutoDetect();
  const { load } = usePdfDocument();
  const { apply, download } = useApply();
  const doc = useAppStore((s) => s.doc);
  const [usageGuideOpen, setUsageGuideOpen] = useState(false);
  const [doNotShowUsageGuideAgain, setDoNotShowUsageGuideAgain] = useState(false);

  useEffect(() => {
    if (!hasSeenUsageGuide()) {
      setDoNotShowUsageGuideAgain(false);
      setUsageGuideOpen(true);
    }
  }, []);

  const openUsageGuide = useCallback(() => {
    setDoNotShowUsageGuideAgain(false);
    setUsageGuideOpen(true);
  }, []);

  const closeUsageGuide = useCallback(() => {
    if (doNotShowUsageGuideAgain) {
      markUsageGuideSeen();
    }
    setUsageGuideOpen(false);
  }, [doNotShowUsageGuideAgain]);

  return (
    <div className="flex min-h-screen flex-col bg-muted">
      <Toolbar onLoad={load} onApply={apply} onDownload={download} onHelp={openUsageGuide} />
      <main className="flex-1 grid grid-cols-[320px_1fr] gap-3 p-3">
        <Card className="flex flex-col overflow-hidden">
          <ScrollArea className="flex-1">
            <div className="p-3">
              {doc.kind === 'empty' && (
                <p className="text-sm text-muted-foreground">
                  파일을 업로드하면 후보가 표시됩니다.
                </p>
              )}
              {doc.kind === 'loading' && (
                <p className="text-sm text-muted-foreground">문서를 여는 중…</p>
              )}
              {doc.kind === 'ready' && (
                <>
                  <div className="mb-3 flex items-center gap-2 border-b pb-3 text-xs">
                    <Badge variant="outline">{doc.fileName}</Badge>
                    <span className="text-muted-foreground">{doc.pages.length}페이지</span>
                  </div>
                  <CandidatePanel />
                </>
              )}
              {doc.kind === 'applying' && (
                <p className="text-sm text-muted-foreground">익명화 적용 중…</p>
              )}
              {doc.kind === 'done' && (
                <Alert>
                  <AlertDescription>
                    완료. 다운로드 버튼을 눌러 저장하세요.
                  </AlertDescription>
                </Alert>
              )}
              {doc.kind === 'error' && (
                <Alert variant="destructive">
                  <AlertDescription>에러: {doc.message}</AlertDescription>
                </Alert>
              )}
            </div>
          </ScrollArea>
        </Card>

        <Card className="flex flex-col items-center justify-center overflow-hidden p-3">
          {doc.kind === 'empty' || doc.kind === 'loading' ? (
            <DropZone onFile={load} />
          ) : doc.kind === 'ready' ? (
            <>
              <div className="overflow-auto max-h-[calc(100vh-180px)]">
                <PdfCanvas />
              </div>
              <PageNavigator />
            </>
          ) : (
            <div className="text-muted-foreground">상태: {doc.kind}</div>
          )}
        </Card>
      </main>
      <ReportModal />
      <UsageGuideModal
        open={usageGuideOpen}
        doNotShowAgain={doNotShowUsageGuideAgain}
        onDoNotShowAgainChange={setDoNotShowUsageGuideAgain}
        onClose={closeUsageGuide}
      />
      <Toaster position="top-right" />
    </div>
  );
}
```

- [ ] **Step 2: 검증**

Run: `npm test && npm run lint && npm run build`
Expected: 41 tests pass, tsc clean, 빌드 통과

- [ ] **Step 3: file:// 검증**

Run: `open dist/index.html`
Expected: 사이드바 Card 외곽, ScrollArea 동작, 후보 패널 Collapsible 펼침/접힘

- [ ] **Step 4: 커밋**

```bash
git add src/App.tsx
git commit -m "feat(ui): App layout 을 Card/ScrollArea/Toaster 로 정리"
```

---

## Phase 4 — Modals + Sonner 통합

### Task 4.1: ReportModal 을 Dialog 로 교체

**Files:**
- Modify: `src/components/ReportModal.tsx`

- [ ] **Step 1: 재작성**

Replace `src/components/ReportModal.tsx`:

```tsx
import { CheckCircle2, AlertTriangle, Download } from 'lucide-react';
import { useAppStore } from '@/state/store';
import { useApply } from '@/hooks/useApply';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function ReportModal(): JSX.Element {
  const doc = useAppStore((s) => s.doc);
  const dismissed = useAppStore((s) => s.reportDismissed);
  const { download } = useApply();

  const open = doc.kind === 'done' && !dismissed;
  const onOpenChange = (next: boolean): void => {
    if (!next) useAppStore.getState().dismissReport();
  };

  if (doc.kind !== 'done') {
    return <Dialog open={false} onOpenChange={() => undefined} />;
  }

  const r = doc.report;
  const ok = r.postCheckLeaks === 0;
  const categoryLine =
    Object.entries(r.byCategory)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k}=${n}`)
      .join(', ') || '없음';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {ok ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            )}
            익명화 완료
          </DialogTitle>
          <DialogDescription>적용 결과 요약입니다.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center justify-between">
            <span className="text-muted-foreground">총 적용</span>
            <Badge variant="secondary">{r.totalBoxes}건</Badge>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-muted-foreground">영향 페이지</span>
            <Badge variant="secondary">{r.pagesAffected.length}페이지</Badge>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-muted-foreground">검증 누수</span>
            <Badge variant={ok ? 'default' : 'destructive'}>
              {r.postCheckLeaks}건 {ok ? '(통과)' : '(주의)'}
            </Badge>
          </li>
          <li className="text-xs text-muted-foreground">카테고리별: {categoryLine}</li>
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => useAppStore.getState().dismissReport()}>
            닫기
          </Button>
          <Button onClick={download}>
            <Download />
            다운로드
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: 검증**

Run: `npm test && npm run lint`
Expected: 41 tests pass, tsc clean

- [ ] **Step 3: 커밋**

```bash
git add src/components/ReportModal.tsx
git commit -m "feat(ui): ReportModal 을 shadcn Dialog 로 교체"
```

---

### Task 4.2: UsageGuideModal 을 Dialog 로 교체

**Files:**
- Modify: `src/components/UsageGuideModal.tsx`

- [ ] **Step 1: 재작성**

Replace `src/components/UsageGuideModal.tsx`:

```tsx
import { Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

type Props = {
  open: boolean;
  doNotShowAgain: boolean;
  onDoNotShowAgainChange(checked: boolean): void;
  onClose(): void;
};

const STEPS = [
  {
    title: 'PDF 업로드',
    body: '파일을 드롭하거나 업로드 버튼으로 선택합니다. PDF는 브라우저 안에서만 처리되며 외부로 전송되지 않습니다.',
  },
  {
    title: '자동 탐지 결과 검수',
    body: '왼쪽 패널에서 주민등록번호, 전화번호, 이메일, 계좌번호, 사업자번호, 카드번호 후보를 확인하고 제외할 항목은 체크를 해제합니다.',
  },
  {
    title: '누락 영역 보강',
    body: 'PDF 위에서 드래그해 수동 박스를 만들 수 있습니다. 텍스트만 고를 때는 Shift 키를 누른 채 드래그합니다.',
  },
  {
    title: '적용 후 다운로드',
    body: '익명화 적용을 누르면 실제 PDF 콘텐츠가 제거됩니다. 완료 리포트에서 검증 누수 0건을 확인한 뒤 다운로드합니다.',
  },
] as const;

export function UsageGuideModal({
  open,
  doNotShowAgain,
  onDoNotShowAgainChange,
  onClose,
}: Props): JSX.Element {
  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>사용 방법</DialogTitle>
          <DialogDescription>
            이 안내는 상단 사용법 버튼에서 언제든 다시 볼 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-3">
          {STEPS.map((step, idx) => (
            <li key={step.title} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary text-xs font-semibold text-primary-foreground">
                {idx + 1}
              </span>
              <div>
                <h3 className="text-sm font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <Alert variant="warning">
          <Info className="h-4 w-4" />
          <AlertDescription>
            스캔본처럼 텍스트 레이어가 없는 PDF는 자동 탐지 결과가 없을 수 있습니다. 이 경우
            수동 박스로 가릴 영역을 지정하세요.
          </AlertDescription>
        </Alert>

        <DialogFooter className="sm:justify-between">
          <div className="flex items-center gap-2">
            <Checkbox
              id="dont-show-again"
              checked={doNotShowAgain}
              onCheckedChange={(c) => onDoNotShowAgainChange(c === true)}
            />
            <Label htmlFor="dont-show-again" className="text-sm">
              더 이상 표시하지 않기
            </Label>
          </div>
          <Button onClick={onClose}>시작하기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: 검증**

Run: `npm test && npm run lint`
Expected: 41 tests pass, tsc clean

- [ ] **Step 3: 커밋**

```bash
git add src/components/UsageGuideModal.tsx
git commit -m "feat(ui): UsageGuideModal 을 shadcn Dialog/Alert/Checkbox 로 교체"
```

---

### Task 4.3: useApply 에 Sonner 토스트 통합

**Files:**
- Modify: `src/hooks/useApply.ts`

- [ ] **Step 1: useApply 재작성**

Replace `src/hooks/useApply.ts`:

```ts
import { useCallback } from 'react';
import { useAppStore } from '@/state/store';
import { downloadBlob } from '@/utils/fileIO';
import { getPdfWorker } from '@/workers/pdfWorkerClient';
import { toast } from '@/components/ui/sonner';

export function useApply() {
  const apply = useCallback(async () => {
    const s = useAppStore.getState();
    const enabled = Object.values(s.boxes).filter((b) => b.enabled);
    if (enabled.length === 0) {
      toast.warning('적용할 박스가 없습니다');
      return;
    }
    s.setDoc({ kind: 'applying' });
    toast.loading('익명화 적용 중…', { id: 'apply' });
    try {
      const api = await getPdfWorker();
      const { pdf, report } = await api.apply(enabled, s.maskStyle);
      // pdf 는 워커에서 transfer 된 Uint8Array<ArrayBufferLike> 라
      // Blob 의 BlobPart(ArrayBufferView<ArrayBuffer>) 와 타입이 다르다.
      // .buffer 는 ArrayBuffer 로 좁혀지므로 그대로 BlobPart 로 전달한다.
      const blob = new Blob([pdf.buffer as ArrayBuffer], { type: 'application/pdf' });
      useAppStore.getState().setDoc({ kind: 'done', outputBlob: blob, report });
      if (report.postCheckLeaks > 0) {
        toast.warning(`익명화 완료 — 검증 누수 ${report.postCheckLeaks}건`, { id: 'apply' });
      } else {
        toast.success('익명화 완료', { id: 'apply' });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      useAppStore.getState().setDoc({ kind: 'error', message });
      toast.error(`적용 실패: ${message}`, { id: 'apply' });
    }
  }, []);

  const download = useCallback(() => {
    const s = useAppStore.getState();
    if (s.doc.kind !== 'done') {
      toast.error('다운로드할 결과가 없습니다');
      return;
    }
    downloadBlob(s.doc.outputBlob, 'redacted.pdf');
    toast.success('다운로드 시작');
  }, []);

  return { apply, download };
}
```

- [ ] **Step 2: 검증**

Run: `npm test && npm run lint && npm run build`
Expected: 41 tests pass, tsc clean, 빌드 통과

- [ ] **Step 3: file:// 검증**

Run: `open dist/index.html`
Expected: 적용 시작 시 로딩 토스트, 완료 시 성공 토스트, 다운로드 시 토스트 표시

- [ ] **Step 4: 커밋**

```bash
git add src/hooks/useApply.ts
git commit -m "feat: 적용/다운로드 흐름에 Sonner 토스트 알림 추가"
```

---

### Task 4.4: Phase 4 / 전체 회귀 검증

- [ ] **Step 1: 전체 검증 파이프라인**

Run:
```bash
npm test && npm run lint && npm run build && du -h dist/index.html
```
Expected:
- 41 tests pass
- tsc clean
- dist/index.html 생성, postbuild 검증 통과 (외부 URL 0, 사이즈 < 18MB)
- 사이즈 출력 (Phase 0 기준선 대비 +KB 수준이어야 함)

- [ ] **Step 2: file:// 종합 검증**

```bash
open dist/index.html
```

체크리스트:
- [ ] 첫 방문 시 UsageGuideModal 자동 표시
- [ ] "더 이상 표시 안함" 체크 + 시작하기 → 닫힘
- [ ] PDF 드롭 → 캔버스 렌더 + 자동 탐지 결과 사이드바 채움
- [ ] CandidatePanel 카테고리 Collapsible 펼침/접힘
- [ ] 카테고리 toggle, 박스별 toggle 동작
- [ ] Toolbar Tooltip hover 동작
- [ ] MaskStylePicker Select 열기/선택
- [ ] 익명화 적용 → 토스트 → ReportModal
- [ ] ESC / X 버튼으로 ReportModal 닫기 + 다운로드 버튼 활성 유지
- [ ] 다운로드 버튼 → 토스트 + 파일 저장
- [ ] DevTools 콘솔 에러 0
- [ ] 에러 상태(예: 잘못된 PDF) → Alert destructive 표시

- [ ] **Step 3: HANDOFF.md 업데이트**

`HANDOFF.md` 의 "What Worked / Next Steps" 에 Phase 0~4 완료와 사이즈 변화 기록.

- [ ] **Step 4: 마감 커밋**

```bash
git add HANDOFF.md
git commit -m "docs: shadcn UI 마이그레이션 (Phase 0~4) 완료 기록"
```

---

## 종료 조건

- [ ] 41/41 테스트 통과
- [ ] `npm run lint` clean
- [ ] `npm run build` 통과 + 사이즈 < 18MB
- [ ] file:// 더블클릭 환경에서 모든 인터랙션 동작
- [ ] DevTools 콘솔 에러 0
- [ ] HANDOFF.md 갱신
- [ ] BoxOverlay/PdfCanvas/PDF 처리 코어 손대지 않음
