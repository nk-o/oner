'use client';

import { CheckIcon, CopyIcon, ListIcon, MenuIcon } from 'lucide-react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

export type SectionVariant = { name: string; node: ReactNode };

export type PickerSection = {
  id: string;
  label: string;
  variants: SectionVariant[];
  headlines?: string[];
};

type Tone = 'plain' | 'muted' | 'dark';

export type PickerSurface = {
  name: string;
  edge: 'hard' | 'fade' | 'scroll';
  tones: Record<string, Tone>;
};

const fadeMask =
  'linear-gradient(transparent, #000 200px, #000 calc(100% - 200px), transparent)';

const HeadlineContext = createContext<Record<string, number>>({});

export function HeadlineOption({
  section,
  options,
}: {
  section: string;
  options: ReactNode[];
}) {
  const choices = useContext(HeadlineContext);
  return <>{options[choices[section] ?? 0]}</>;
}

// The prototype's pages, shown in the bottom-left menu.
const pages: { href: string; label: string }[] = [];

const cn = (...parts: (string | false | undefined)[]) =>
  parts.filter(Boolean).join(' ');

const paramKey = (id: string) => `__${id}`;

export function SectionPicker({
  sections,
  surfaces,
}: {
  sections: PickerSection[];
  surfaces?: PickerSurface[];
}) {
  const [surfaceIndex, setSurfaceIndex] = useState(0);
  const [choices, setChoices] = useState<Record<string, number>>({});
  const [headlines, setHeadlines] = useState<Record<string, number>>({});
  const [activeId, setActiveId] = useState(sections[0].id);
  const [isListOpen, setIsListOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);
  const pendingScroll = useRef<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next: Record<string, number> = {};
    for (const section of sections) {
      const value = Number(params.get(paramKey(section.id)));
      if (
        Number.isInteger(value) &&
        value >= 1 &&
        value <= section.variants.length
      ) {
        next[section.id] = value - 1;
      }
    }
    setChoices(next);
    const nextHeadlines: Record<string, number> = {};
    for (const section of sections) {
      const value = Number(params.get(`${paramKey(section.id)}Headline`));
      if (
        Number.isInteger(value) &&
        value >= 1 &&
        value <= (section.headlines?.length ?? 0)
      ) {
        nextHeadlines[section.id] = value - 1;
      }
    }
    setHeadlines(nextHeadlines);
    const surfaceValue = Number(params.get('__surface'));
    if (
      Number.isInteger(surfaceValue) &&
      surfaceValue >= 1 &&
      surfaceValue <= (surfaces?.length ?? 0)
    ) {
      setSurfaceIndex(surfaceValue - 1);
    }
  }, [sections, surfaces]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const probe = window.innerHeight * 0.45;
      for (const section of sections) {
        const element = document.getElementById(`proto-${section.id}`);
        if (!element) continue;
        const rect = element.getBoundingClientRect();
        if (rect.top <= probe && rect.bottom > probe) {
          setActiveId(section.id);
          return;
        }
      }
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [sections]);

  const choose = useCallback((section: PickerSection, index: number) => {
    const bounded = (index + section.variants.length) % section.variants.length;
    pendingScroll.current = section.id;
    setChoices((current) => ({ ...current, [section.id]: bounded }));
    const url = new URL(window.location.href);
    if (bounded === 0) url.searchParams.delete(paramKey(section.id));
    else url.searchParams.set(paramKey(section.id), String(bounded + 1));
    window.history.replaceState(window.history.state, '', url);
  }, []);

  const chooseHeadline = (section: PickerSection, index: number) => {
    setHeadlines((current) => ({ ...current, [section.id]: index }));
    const url = new URL(window.location.href);
    const key = `${paramKey(section.id)}Headline`;
    if (index === 0) url.searchParams.delete(key);
    else url.searchParams.set(key, String(index + 1));
    window.history.replaceState(window.history.state, '', url);
  };

  const chooseSurface = (index: number) => {
    setSurfaceIndex(index);
    const url = new URL(window.location.href);
    if (index === 0) url.searchParams.delete('__surface');
    else url.searchParams.set('__surface', String(index + 1));
    window.history.replaceState(window.history.state, '', url);
  };

  // A variant of another height must not leave the reader in the next section.
  useLayoutEffect(() => {
    if (!pendingScroll.current) return;
    const element = document.getElementById(`proto-${pendingScroll.current}`);
    pendingScroll.current = null;
    if (!element) return;
    const { top } = element.getBoundingClientRect();
    if (top < 0) {
      window.scrollTo({ top: window.scrollY + top, behavior: 'instant' });
    }
  });

  const surface = surfaces?.[surfaceIndex];
  const active =
    sections.find((section) => section.id === activeId) ?? sections[0];
  const scrollTone = surface?.tones[active.id] ?? 'plain';
  const activeIndex = choices[active.id] ?? 0;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        target?.closest('input, textarea, select, [contenteditable]')
      ) {
        return;
      }
      if (event.key === 'ArrowRight') choose(active, activeIndex + 1);
      else if (event.key === 'ArrowLeft') choose(active, activeIndex - 1);
      else if (/^[1-9]$/.test(event.key)) {
        const index = Number(event.key) - 1;
        if (index < active.variants.length) choose(active, index);
      } else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, activeIndex, choose]);

  const copyChoices = () => {
    const lines = [
      ...(surface ? [`Backgrounds: ${surface.name}`] : []),
      ...sections.map(
        (section) =>
          `${section.label}: ${section.variants[choices[section.id] ?? 0].name}${
            section.headlines
              ? ` / ${section.headlines[headlines[section.id] ?? 0]}`
              : ''
          }`,
      ),
    ].join('\n');
    void navigator.clipboard.writeText(lines);
    setHasCopied(true);
    window.setTimeout(() => setHasCopied(false), 1600);
  };

  return (
    <HeadlineContext.Provider value={headlines}>
      {surface?.edge === 'scroll' ? (
        <div
          aria-hidden
          className={cn(
            'fixed inset-0 -z-10 transition-colors duration-700',
            scrollTone === 'muted' && 'bg-muted',
            scrollTone === 'plain' && 'bg-background',
            scrollTone === 'dark' && 'dark bg-background',
          )}
        />
      ) : null}
      {sections.map((section) => {
        const tone = surface?.tones[section.id] ?? 'plain';
        return (
          <div
            key={section.id}
            id={`proto-${section.id}`}
            data-proto-section={section.id}
            className={cn(
              'relative',
              tone === 'dark' && 'dark text-foreground',
              surface?.edge === 'hard' && tone === 'muted' && 'bg-muted',
              surface?.edge === 'hard' && tone === 'dark' && 'bg-background',
            )}
          >
            {surface?.edge === 'fade' && tone !== 'plain' ? (
              <div
                aria-hidden
                className={cn(
                  'absolute inset-x-0 -inset-y-24 -z-1',
                  tone === 'muted' ? 'bg-muted' : 'bg-background',
                )}
                style={{ maskImage: fadeMask }}
              />
            ) : null}
            {section.variants[choices[section.id] ?? 0].node}
          </div>
        );
      })}

      <nav
        aria-label="Prototype pages"
        className="fixed bottom-4 left-4 z-[60] hidden flex-col items-start gap-1.5 text-neutral-300 text-xs xl:flex"
      >
        {isMenuOpen ? (
          <div className="flex w-44 flex-col gap-0.5 rounded-2xl bg-neutral-950 p-1 shadow-2xl ring-1 ring-white/10">
            {pages.map((page) => (
              <a
                key={page.href}
                href={page.href}
                className="rounded-xl px-2.5 py-1.5 transition-colors hover:bg-white/10 hover:text-white"
              >
                {page.label}
              </a>
            ))}
            {surfaces ? (
              <div className="mt-1 flex flex-col gap-0.5 border-white/15 border-t pt-1.5">
                <span className="px-2.5 pb-0.5 text-neutral-500">
                  Backgrounds
                </span>
                {surfaces.map((item, index) => (
                  <button
                    key={item.name}
                    type="button"
                    aria-pressed={index === surfaceIndex}
                    onClick={() => chooseSurface(index)}
                    className={cn(
                      'rounded-xl px-2.5 py-1.5 text-left transition-colors',
                      index === surfaceIndex
                        ? 'bg-white font-medium text-neutral-950'
                        : 'hover:bg-white/10 hover:text-white',
                    )}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setIsMenuOpen((open) => !open)}
          aria-expanded={isMenuOpen}
          className="flex h-10 items-center gap-1.5 rounded-full bg-neutral-950 px-3.5 font-medium text-white shadow-2xl ring-1 ring-white/10 transition-colors hover:bg-neutral-800"
        >
          <MenuIcon className="size-3.5" />
          {surface ? surface.name : 'Pages'}
        </button>
      </nav>

      <div className="fixed bottom-4 left-1/2 z-[60] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col items-center gap-1.5">
        {active.headlines ? (
          <div className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-neutral-950 p-1 text-neutral-300 text-xs shadow-2xl ring-1 ring-white/10">
            <span className="px-2.5 text-neutral-500">Headline</span>
            {active.headlines.map((headline, index) => (
              <button
                key={headline}
                type="button"
                aria-pressed={index === (headlines[active.id] ?? 0)}
                onClick={() => chooseHeadline(active, index)}
                className={cn(
                  'h-7 whitespace-nowrap rounded-full px-2.5 transition-colors',
                  index === (headlines[active.id] ?? 0)
                    ? 'bg-white/20 font-medium text-white'
                    : 'hover:bg-white/10 hover:text-white',
                )}
              >
                {headline}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex max-w-full items-center gap-1 rounded-full bg-neutral-950 p-1 text-neutral-300 text-xs shadow-2xl ring-1 ring-white/10">
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsListOpen((open) => !open)}
              aria-expanded={isListOpen}
              className="flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 font-medium text-white transition-colors hover:bg-white/10"
            >
              <ListIcon className="size-3.5" />
              {active.label}
            </button>
            {isListOpen ? (
              <div className="absolute bottom-11 left-0 w-72 rounded-2xl bg-neutral-950 p-1.5 shadow-2xl ring-1 ring-white/10">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => {
                      setIsListOpen(false);
                      document
                        .getElementById(`proto-${section.id}`)
                        ?.scrollIntoView({ behavior: 'instant' });
                    }}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-xl px-2.5 py-1.5 text-left transition-colors hover:bg-white/10',
                      section.id === active.id && 'bg-white/10 text-white',
                    )}
                  >
                    <span>{section.label}</span>
                    <span className="truncate text-neutral-500">
                      {section.variants[choices[section.id] ?? 0].name}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <span aria-hidden className="h-4 w-px bg-white/15" />
          <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
            {active.variants.map((variant, index) => (
              <button
                key={variant.name}
                type="button"
                aria-pressed={index === activeIndex}
                onClick={() => choose(active, index)}
                className={cn(
                  'h-8 whitespace-nowrap rounded-full px-3 transition-colors',
                  index === activeIndex
                    ? 'bg-white font-medium text-neutral-950'
                    : 'hover:bg-white/10 hover:text-white',
                )}
              >
                {variant.name}
              </button>
            ))}
          </div>
          <span aria-hidden className="h-4 w-px bg-white/15" />
          <button
            type="button"
            onClick={copyChoices}
            aria-label="Copy all choices"
            title="Copy all choices"
            className="flex size-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10 hover:text-white"
          >
            {hasCopied ? (
              <CheckIcon className="size-3.5" />
            ) : (
              <CopyIcon className="size-3.5" />
            )}
          </button>
        </div>
      </div>
    </HeadlineContext.Provider>
  );
}
